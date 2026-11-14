import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { conflict, notFound, validation, forbidden } from '../../core/errors/errors.js';
import { writeAudit } from '../../core/audit/audit.js';
import { auditCtx, parseJson } from './util.js';

const OWNER_TYPES = ['HR', 'MANAGER', 'EMPLOYEE', 'ICT'] as const;

/**
 * Employee categories (D-25), onboarding checklist templates and probation form templates.
 * Drafting requires `employees.categories.manage`; activation requires `config.approve`
 * held by a DIFFERENT user than the author (maker-checker).
 */
export function createEmployeeSetupRouter(deps: AppDeps): Router {
  const router = Router();

  // ---------------- Employee categories ----------------
  registerRoute(router, deps, {
    method: 'get',
    path: '/employee-categories',
    auth: { permission: ['employees.view', 'employees.create', 'employees.categories.manage', 'config.approve'], any: true },
    handler: async ({ deps }) => deps.prisma.employmentCategory.findMany({ orderBy: { code: 'asc' } }),
  });

  const categoryParams = z.object({
    name: z.string().min(2).max(80),
    description: z.string().max(500).optional(),
    probationApplies: z.boolean().nullable().optional(),
    defaultProbationMonths: z.number().int().min(1).max(24).nullable().optional(),
    maxProbationExtensionMonths: z.number().int().min(1).max(24).nullable().optional(),
    defaultNoticePeriodDays: z.number().int().min(1).max(365).nullable().optional(),
    probationReminderLeadDays: z.number().int().min(1).max(120).nullable().optional(),
    sourceReference: z.string().min(3).max(300),
    decisionReference: z.string().max(100).optional(),
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/employee-categories',
    auth: { permission: 'employees.categories.manage' },
    successStatus: 201,
    body: categoryParams.extend({ code: z.string().regex(/^[A-Z][A-Z0-9_]{1,30}$/) }),
    handler: async ({ body, auth, req, deps }) => {
      const existing = await deps.prisma.employmentCategory.findUnique({ where: { code: body.code } });
      if (existing) throw conflict(`Employee category '${body.code}' already exists`);
      const created = await deps.prisma.employmentCategory.create({
        data: { ...body, status: 'DRAFT', createdById: auth.userId },
      });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'EMPLOYEE_CATEGORY_DRAFTED', targetType: 'EmploymentCategory', targetId: created.id, outcome: 'SUCCESS', after: created,
      });
      return created;
    },
  });

  registerRoute(router, deps, {
    method: 'patch',
    path: '/employee-categories/:id',
    auth: { permission: 'employees.categories.manage' },
    params: z.object({ id: z.string().uuid() }),
    body: categoryParams.partial(),
    handler: async ({ params, body, auth, req, deps }) => {
      const cat = await deps.prisma.employmentCategory.findUnique({ where: { id: params.id } });
      if (!cat) throw notFound('EmploymentCategory', params.id);
      if (cat.status !== 'DRAFT') {
        throw conflict('Only DRAFT categories can be edited. Deactivate and redraft to change an active category.');
      }
      const updated = await deps.prisma.employmentCategory.update({
        where: { id: params.id },
        // Editing resets authorship so the editor cannot also approve
        data: { ...body, createdById: auth.userId },
      });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'EMPLOYEE_CATEGORY_UPDATED', targetType: 'EmploymentCategory', targetId: cat.id, outcome: 'SUCCESS', before: cat, after: updated,
      });
      return updated;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/employee-categories/:id/activate',
    auth: { permission: 'config.approve' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, req, deps }) => {
      const cat = await deps.prisma.employmentCategory.findUnique({ where: { id: params.id } });
      if (!cat) throw notFound('EmploymentCategory', params.id);
      if (cat.createdById === auth.userId) {
        await writeAudit(deps.prisma, auditCtx(auth, req), {
          action: 'EMPLOYEE_CATEGORY_ACTIVATE', targetType: 'EmploymentCategory', targetId: cat.id, outcome: 'BLOCKED', reason: 'Maker-checker violation',
        });
        throw forbidden('Maker-Checker violation: the author of a category cannot activate it');
      }
      if (cat.status !== 'DRAFT') throw conflict(`Category is ${cat.status}; only DRAFT categories can be activated`);
      if (cat.probationApplies === null) {
        throw validation('Activation blocked: probationApplies must be explicitly confirmed (true/false) for this category (D-18/D-25)');
      }
      const updated = await deps.prisma.employmentCategory.update({
        where: { id: params.id },
        data: { status: 'ACTIVE', approvedById: auth.userId, approvedAt: new Date() },
      });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'EMPLOYEE_CATEGORY_ACTIVATED', targetType: 'EmploymentCategory', targetId: cat.id, outcome: 'SUCCESS', before: { status: cat.status }, after: { status: 'ACTIVE' },
      });
      return updated;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/employee-categories/:id/deactivate',
    auth: { permission: 'config.approve' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ reason: z.string().min(5) }),
    handler: async ({ params, body, auth, req, deps }) => {
      const cat = await deps.prisma.employmentCategory.findUnique({ where: { id: params.id } });
      if (!cat) throw notFound('EmploymentCategory', params.id);
      const updated = await deps.prisma.employmentCategory.update({ where: { id: params.id }, data: { status: 'INACTIVE' } });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'EMPLOYEE_CATEGORY_DEACTIVATED', targetType: 'EmploymentCategory', targetId: cat.id, outcome: 'SUCCESS', reason: body.reason,
      });
      return updated;
    },
  });

  // ---------------- Onboarding templates ----------------
  registerRoute(router, deps, {
    method: 'get',
    path: '/onboarding-templates',
    auth: { permission: ['onboarding.manage', 'employees.categories.manage', 'config.approve'], any: true },
    handler: async ({ deps }) =>
      deps.prisma.onboardingTemplate.findMany({ include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { code: 'asc' } }),
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/onboarding-templates',
    auth: { permission: 'employees.categories.manage' },
    successStatus: 201,
    body: z.object({
      code: z.string().regex(/^[A-Z][A-Z0-9_-]{1,40}$/),
      name: z.string().min(3).max(150),
      employmentCategoryCode: z.string().optional(),
      departmentId: z.string().uuid().optional(),
      locationId: z.string().uuid().optional(),
      positionId: z.string().uuid().optional(),
      sourceReference: z.string().min(3).max(300),
      items: z
        .array(
          z.object({
            title: z.string().min(3).max(200),
            description: z.string().max(1000).optional(),
            ownerType: z.enum(OWNER_TYPES),
            dueDaysAfterStart: z.number().int().min(-60).max(365).optional(),
            evidenceRequired: z.boolean().default(false),
            escalateAfterDaysOverdue: z.number().int().min(0).max(90).optional(),
            escalateToRoleKey: z.string().optional(),
            policyAcknowledgementRef: z.string().max(200).optional(),
            sourceReference: z.string().max(300).optional(),
          }),
        )
        .min(1)
        .max(50),
    }),
    handler: async ({ body, auth, req, deps }) => {
      if (await deps.prisma.onboardingTemplate.findUnique({ where: { code: body.code } })) {
        throw conflict(`Onboarding template '${body.code}' already exists`);
      }
      if (body.employmentCategoryCode) {
        const cat = await deps.prisma.employmentCategory.findUnique({ where: { code: body.employmentCategoryCode } });
        if (!cat) throw validation(`Unknown employment category '${body.employmentCategoryCode}'`);
      }
      for (const item of body.items) {
        if (item.escalateToRoleKey && !(await deps.prisma.role.findUnique({ where: { key: item.escalateToRoleKey } }))) {
          throw validation(`Unknown escalation role '${item.escalateToRoleKey}'`);
        }
      }
      const { items, ...tpl } = body;
      const created = await deps.prisma.onboardingTemplate.create({
        data: {
          ...tpl,
          status: 'DRAFT',
          createdById: auth.userId,
          items: { create: items.map((it, idx) => ({ ...it, sortOrder: idx + 1 })) },
        },
        include: { items: true },
      });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'ONBOARDING_TEMPLATE_DRAFTED', targetType: 'OnboardingTemplate', targetId: created.id, outcome: 'SUCCESS', after: { code: created.code, items: items.length },
      });
      return created;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/onboarding-templates/:id/activate',
    auth: { permission: 'config.approve' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, req, deps }) => {
      const tpl = await deps.prisma.onboardingTemplate.findUnique({ where: { id: params.id } });
      if (!tpl) throw notFound('OnboardingTemplate', params.id);
      if (tpl.createdById === auth.userId) throw forbidden('Maker-Checker violation: the author of a template cannot activate it');
      if (tpl.status !== 'DRAFT') throw conflict(`Template is ${tpl.status}; only DRAFT templates can be activated`);
      const updated = await deps.prisma.onboardingTemplate.update({
        where: { id: params.id },
        data: { status: 'ACTIVE', approvedById: auth.userId, approvedAt: new Date() },
      });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'ONBOARDING_TEMPLATE_ACTIVATED', targetType: 'OnboardingTemplate', targetId: tpl.id, outcome: 'SUCCESS',
      });
      return updated;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/onboarding-templates/:id/deactivate',
    auth: { permission: 'config.approve' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, req, deps }) => {
      const tpl = await deps.prisma.onboardingTemplate.findUnique({ where: { id: params.id } });
      if (!tpl) throw notFound('OnboardingTemplate', params.id);
      const updated = await deps.prisma.onboardingTemplate.update({ where: { id: params.id }, data: { status: 'INACTIVE' } });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'ONBOARDING_TEMPLATE_DEACTIVATED', targetType: 'OnboardingTemplate', targetId: tpl.id, outcome: 'SUCCESS',
      });
      return updated;
    },
  });

  // ---------------- Probation form templates ----------------
  registerRoute(router, deps, {
    method: 'get',
    path: '/probation-forms',
    auth: 'session',
    handler: async ({ deps }) => {
      const forms = await deps.prisma.probationFormTemplate.findMany({ where: { status: 'ACTIVE' } });
      return forms.map((f) => ({ ...f, values: parseJson<string[]>(f.values, []), ratingScale: parseJson<string[]>(f.ratingScale, []) }));
    },
  });

  return router;
}
