import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { notFound, conflict, validation } from '../../core/errors/errors.js';
import { assertMakerChecker } from '../../core/permissions/rbac.js';
import { writeAudit } from '../../core/audit/audit.js';
import { resolveEffectiveConfiguration, PolicyRule } from './precedence.js';

export function createConfigurationRouter(deps: AppDeps): Router {
  const router = Router();

  // 1. List Policy Configurations
  registerRoute(router, deps, {
    method: 'get',
    path: '/configuration',
    auth: { permission: 'config.view' },
    query: z.object({
      code: z.string().optional(),
      status: z.string().optional(),
      layer: z.string().optional(),
    }).optional(),
    handler: async ({ query, deps }) => {
      const where: any = {};
      if (query?.code) where.code = query.code;
      if (query?.status) where.status = query.status;
      if (query?.layer) where.layer = query.layer;

      const items = await deps.prisma.policyConfiguration.findMany({
        where,
        orderBy: [{ code: 'asc' }, { version: 'desc' }],
      });

      return items.map((i) => ({
        ...i,
        values: JSON.parse(i.values),
        customFields: i.customFields ? JSON.parse(i.customFields) : null,
      }));
    },
  });

  // 2. Create Policy Configuration Draft
  registerRoute(router, deps, {
    method: 'post',
    path: '/configuration',
    auth: { permission: 'config.create' },
    body: z.object({
      code: z.string().min(2).max(50).toUpperCase(),
      title: z.string().min(3).max(150),
      layer: z.enum(['STATUTORY', 'ORGANISATION', 'LOCATION', 'DEPARTMENT', 'EXCEPTION']),
      locationId: z.string().uuid().optional(),
      departmentId: z.string().uuid().optional(),
      gradeId: z.string().uuid().optional(),
      targetEmployeeId: z.string().uuid().optional(),
      values: z.record(z.any()),
      customFields: z.record(z.any()).optional(),
      sourceReference: z.string().min(3),
      owner: z.string().min(2),
      reviewDate: z.string().datetime().optional(),
      effectiveFrom: z.string().datetime(),
      effectiveTo: z.string().datetime().optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      // Find latest version for this code & scope
      const latest = await deps.prisma.policyConfiguration.findFirst({
        where: {
          code: body.code,
          layer: body.layer,
          locationId: body.locationId ?? null,
          departmentId: body.departmentId ?? null,
          targetEmployeeId: body.targetEmployeeId ?? null,
        },
        orderBy: { version: 'desc' },
      });

      const nextVersion = (latest?.version ?? 0) + 1;

      const created = await deps.prisma.policyConfiguration.create({
        data: {
          code: body.code,
          title: body.title,
          layer: body.layer,
          locationId: body.locationId,
          departmentId: body.departmentId,
          gradeId: body.gradeId,
          targetEmployeeId: body.targetEmployeeId,
          version: nextVersion,
          status: 'DRAFT',
          values: JSON.stringify(body.values),
          customFields: body.customFields ? JSON.stringify(body.customFields) : null,
          sourceReference: body.sourceReference,
          owner: body.owner,
          reviewDate: body.reviewDate ? new Date(body.reviewDate) : null,
          effectiveFrom: new Date(body.effectiveFrom),
          effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
          createdById: auth.userId,
        },
      });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'CONFIG_DRAFT_CREATED',
          targetType: 'PolicyConfiguration',
          targetId: created.id,
          outcome: 'SUCCESS',
          after: { code: body.code, version: nextVersion, layer: body.layer },
        },
      );

      return {
        ...created,
        values: JSON.parse(created.values),
        customFields: created.customFields ? JSON.parse(created.customFields) : null,
      };
    },
  });

  // 3. Submit Configuration Proposal for Approval
  registerRoute(router, deps, {
    method: 'post',
    path: '/configuration/:id/submit',
    auth: { permission: 'config.submit' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, req, deps }) => {
      const config = await deps.prisma.policyConfiguration.findUnique({ where: { id: params.id } });
      if (!config) throw notFound('PolicyConfiguration', params.id);
      if (config.status !== 'DRAFT') throw conflict(`Cannot submit configuration with status '${config.status}'`);

      const updated = await deps.prisma.policyConfiguration.update({
        where: { id: params.id },
        data: {
          status: 'SUBMITTED',
          submittedById: auth.userId,
        },
      });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'CONFIG_SUBMITTED',
          targetType: 'PolicyConfiguration',
          targetId: config.id,
          outcome: 'SUCCESS',
        },
      );

      return { ...updated, values: JSON.parse(updated.values) };
    },
  });

  // 4. Maker-Checker Approval & Activation
  registerRoute(router, deps, {
    method: 'post',
    path: '/configuration/:id/approve',
    auth: { permission: 'config.approve' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, req, deps }) => {
      const config = await deps.prisma.policyConfiguration.findUnique({ where: { id: params.id } });
      if (!config) throw notFound('PolicyConfiguration', params.id);
      if (config.status !== 'SUBMITTED') {
        throw conflict(`Cannot approve configuration with status '${config.status}'. Must be 'SUBMITTED'.`);
      }

      // STRICT MAKER-CHECKER ENFORCEMENT:
      // The author or submitter cannot approve their own configuration change!
      assertMakerChecker(config.createdById, auth.userId);
      if (config.submittedById) {
        assertMakerChecker(config.submittedById, auth.userId);
      }

      const now = new Date();
      const isActiveNow = config.effectiveFrom <= now && (!config.effectiveTo || config.effectiveTo >= now);
      const newStatus = isActiveNow ? 'ACTIVE' : 'SCHEDULED';

      // Supersede previous active versions for the identical scope
      await deps.prisma.policyConfiguration.updateMany({
        where: {
          code: config.code,
          layer: config.layer,
          locationId: config.locationId,
          departmentId: config.departmentId,
          gradeId: config.gradeId,
          targetEmployeeId: config.targetEmployeeId,
          status: 'ACTIVE',
          id: { not: config.id },
        },
        data: {
          status: 'SUPERSEDED',
          supersededById: config.id,
        },
      });

      const approved = await deps.prisma.policyConfiguration.update({
        where: { id: params.id },
        data: {
          status: newStatus,
          approvedById: auth.userId,
          approvedAt: now,
        },
      });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'CONFIG_APPROVED',
          targetType: 'PolicyConfiguration',
          targetId: config.id,
          outcome: 'SUCCESS',
          after: { code: config.code, version: config.version, newStatus },
        },
      );

      return { ...approved, values: JSON.parse(approved.values) };
    },
  });

  // 5. Precedence Simulation & Impact Preview
  registerRoute(router, deps, {
    method: 'post',
    path: '/configuration/preview',
    auth: { permission: 'config.view' },
    body: z.object({
      code: z.string(),
      targetEmployeeId: z.string().uuid().optional(),
      departmentId: z.string().uuid().optional(),
      locationId: z.string().uuid().optional(),
      gradeId: z.string().uuid().optional(),
      asOfDate: z.string().datetime().optional(),
    }),
    handler: async ({ body, deps }) => {
      const records = await deps.prisma.policyConfiguration.findMany({
        where: { code: body.code },
      });

      const rules: PolicyRule[] = records.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        layer: r.layer as any,
        locationId: r.locationId,
        departmentId: r.departmentId,
        gradeId: r.gradeId,
        targetEmployeeId: r.targetEmployeeId,
        version: r.version,
        status: r.status,
        values: JSON.parse(r.values),
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
      }));

      const resolution = resolveEffectiveConfiguration(rules, {
        targetEmployeeId: body.targetEmployeeId,
        departmentId: body.departmentId,
        locationId: body.locationId,
        gradeId: body.gradeId,
        asOfDate: body.asOfDate ? new Date(body.asOfDate) : undefined,
      });

      return resolution;
    },
  });

  return router;
}
