import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { writeAudit } from '../../core/audit/audit.js';
import { auditCtx } from '../employees/util.js';
import { getActorEmployeeId } from '../employees/access.js';
import { TimeTrackerService } from './service.js';

export function createTimeTrackerRouter(deps: AppDeps): Router {
  const router = Router();
  const service = new TimeTrackerService(deps.prisma);

  // 1. Time Logs
  registerRoute(router, deps, {
    method: 'get',
    path: '/timetracker/logs',
    auth: { permission: 'timetracker.view' },
    query: z
      .object({
        employeeId: z.string().optional(),
        projectId: z.string().optional(),
        status: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        search: z.string().optional(),
      })
      .optional(),
    handler: async ({ query, auth }) => {
      const canViewRates = auth.permissions.has('timetracker.rates.view');
      let empFilter = query?.employeeId;
      if (!auth.permissions.has('timetracker.approve') && !canViewRates) {
        const actorEmpId = await getActorEmployeeId(deps.prisma, auth.userId);
        if (actorEmpId) empFilter = actorEmpId;
      }
      return service.listTimeLogs({ ...(query || {}), employeeId: empFilter }, canViewRates);
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/timetracker/logs',
    auth: { permission: 'timetracker.log' },
    body: z.object({
      employeeId: z.string().optional(),
      projectId: z.string().min(1),
      phaseId: z.string().nullable().optional(),
      workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      hours: z.number().min(0.25).max(24),
      isBillable: z.boolean().default(true),
      description: z.string().min(2).max(500),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      const actorEmpId = await getActorEmployeeId(deps.prisma, auth.userId);
      const targetEmpId =
        body.employeeId && auth.permissions.has('timetracker.approve')
          ? body.employeeId
          : actorEmpId || body.employeeId || auth.userId;

      const created = await service.logTime({
        employeeId: targetEmpId,
        projectId: body.projectId,
        phaseId: body.phaseId ?? null,
        workDate: body.workDate,
        hours: body.hours,
        isBillable: body.isBillable,
        description: body.description,
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'TIME_LOG_CREATED',
        targetType: 'TimeLog',
        targetId: created.id,
        outcome: 'SUCCESS',
        after: { projectId: created.projectId, workDate: created.workDate, hours: created.hours },
      });

      return created;
    },
  });

  registerRoute(router, deps, {
    method: 'delete',
    path: '/timetracker/logs/:id',
    auth: { permission: 'timetracker.log' },
    params: z.object({ id: z.string() }),
    handler: async ({ params, auth, req }) => {
      const actorEmpId = await getActorEmployeeId(deps.prisma, auth.userId);
      const isAdmin = auth.permissions.has('timetracker.approve');
      const result = await service.deleteTimeLog(params.id, actorEmpId, isAdmin);

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'TIME_LOG_DELETED',
        targetType: 'TimeLog',
        targetId: params.id,
        outcome: 'SUCCESS',
      });
      return result;
    },
  });

  registerRoute(router, deps, {
    method: 'patch',
    path: '/timetracker/logs/review',
    auth: { permission: 'timetracker.approve' },
    body: z.object({
      logIds: z.array(z.string()).min(1),
      action: z.enum(['APPROVE', 'REJECT']),
      rejectionReason: z.string().optional(),
    }),
    handler: async ({ body, auth, req }) => {
      const reviewed = await service.reviewTimeLogs({
        logIds: body.logIds,
        action: body.action,
        actorUserId: auth.userId,
        rejectionReason: body.rejectionReason,
      });

      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: `TIME_LOGS_${body.action}`,
        targetType: 'TimeLog',
        targetId: body.logIds.join(','),
        outcome: 'SUCCESS',
        after: { action: body.action, count: reviewed.length, reason: body.rejectionReason },
      });

      return reviewed;
    },
  });

  // 2. Clients & Projects & Phases
  registerRoute(router, deps, {
    method: 'get',
    path: '/timetracker/clients',
    auth: { permission: 'timetracker.view' },
    handler: async () => service.listClients(),
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/timetracker/clients',
    auth: { permission: 'timetracker.projects.manage' },
    body: z.object({
      code: z.string().min(2).max(30),
      name: z.string().min(2).max(150),
      industry: z.string().optional(),
      contactName: z.string().optional(),
      contactEmail: z.string().email().optional().or(z.literal('')),
      currency: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      const client = await service.createClient({
        ...body,
        contactEmail: body.contactEmail || undefined,
      });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'TIME_CLIENT_CREATED',
        targetType: 'TimeClient',
        targetId: client.id,
        outcome: 'SUCCESS',
      });
      return client;
    },
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/timetracker/projects',
    auth: { permission: 'timetracker.view' },
    handler: async ({ auth }) => {
      const canViewRates = auth.permissions.has('timetracker.rates.view');
      return service.listProjects(canViewRates);
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/timetracker/projects',
    auth: { permission: 'timetracker.projects.manage' },
    body: z.object({
      code: z.string().min(2).max(30),
      name: z.string().min(2).max(150),
      clientId: z.string().min(1),
      department: z.string().optional(),
      leadEmployeeId: z.string().min(1),
      budgetAmountKes: z.number().min(0).default(0),
      budgetHours: z.number().min(0).default(0),
      startDate: z.string(),
      endDate: z.string(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      const project = await service.createProject(body);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'TIME_PROJECT_CREATED',
        targetType: 'TimeProject',
        targetId: project.id,
        outcome: 'SUCCESS',
      });
      return project;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/timetracker/projects/:id/phases',
    auth: { permission: 'timetracker.projects.manage' },
    params: z.object({ id: z.string() }),
    body: z.object({
      name: z.string().min(2).max(120),
      startDate: z.string(),
      endDate: z.string(),
      progressPct: z.number().int().min(0).max(100).default(0),
      sortOrder: z.number().int().min(1).default(1),
    }),
    successStatus: 201,
    handler: async ({ params, body }) => service.createPhase(params.id, body),
  });

  registerRoute(router, deps, {
    method: 'patch',
    path: '/timetracker/phases/:id',
    auth: { permission: 'timetracker.projects.manage' },
    params: z.object({ id: z.string() }),
    body: z.object({ progressPct: z.number().int().min(0).max(100) }),
    handler: async ({ params, body }) => service.updatePhaseProgress(params.id, body.progressPct),
  });

  // 3. Rate Cards (Strictly RBAC protected)
  registerRoute(router, deps, {
    method: 'get',
    path: '/timetracker/rates',
    auth: { permission: 'timetracker.rates.view' },
    handler: async () => service.listRateCards(),
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/timetracker/rates/:employeeId',
    auth: { permission: 'timetracker.rates.view' },
    params: z.object({ employeeId: z.string() }),
    handler: async ({ params }) => service.getRateCard(params.employeeId),
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/timetracker/rates',
    auth: { permission: 'timetracker.rates.manage' },
    body: z.object({
      employeeId: z.string().min(1),
      costRateKes: z.number().min(0),
      billingRateKes: z.number().min(0),
      currency: z.string().optional(),
      effectiveFrom: z.string().optional(),
    }),
    handler: async ({ body, auth, req }) => {
      const card = await service.upsertRateCard({
        ...body,
        updatedById: auth.userId,
      });
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'TIME_RATE_CARD_UPDATED',
        targetType: 'TimeRateCard',
        targetId: card.id,
        outcome: 'SUCCESS',
        after: { employeeId: card.employeeId, costRateKes: card.costRateKes, billingRateKes: card.billingRateKes },
      });
      return card;
    },
  });

  // 4. Period Close & Lock Management
  registerRoute(router, deps, {
    method: 'get',
    path: '/timetracker/periods',
    auth: { permission: 'timetracker.view' },
    handler: async () => service.listPeriods(),
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/timetracker/periods',
    auth: { permission: 'timetracker.periods.manage' },
    body: z.object({
      name: z.string().min(3).max(80),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      const period = await service.openPeriod(body);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'TIME_PERIOD_OPENED',
        targetType: 'TimePeriodClose',
        targetId: period.id,
        outcome: 'SUCCESS',
      });
      return period;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/timetracker/periods/:id/approve-all',
    auth: { permission: 'timetracker.periods.manage' },
    params: z.object({ id: z.string() }),
    handler: async ({ params, auth, req }) => {
      const res = await service.approveAllPeriodLogs(params.id, auth.userId);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'TIME_PERIOD_BULK_APPROVE',
        targetType: 'TimePeriodClose',
        targetId: params.id,
        outcome: 'SUCCESS',
        after: res,
      });
      return res;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/timetracker/periods/:id/close',
    auth: { permission: 'timetracker.periods.manage' },
    params: z.object({ id: z.string() }),
    body: z.object({ autoApprove: z.boolean().optional() }).optional(),
    handler: async ({ params, body, auth, req }) => {
      const closed = await service.closePeriod(params.id, auth.userId, Boolean(body?.autoApprove));
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'TIME_PERIOD_LOCKED',
        targetType: 'TimePeriodClose',
        targetId: closed.id,
        outcome: 'SUCCESS',
        after: { status: closed.status, snapshotChecksum: closed.snapshotChecksum },
      });
      return closed;
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/timetracker/periods/:id/reopen',
    auth: { permission: 'timetracker.periods.manage' },
    params: z.object({ id: z.string() }),
    body: z.object({ reason: z.string().min(5) }),
    handler: async ({ params, body, auth, req }) => {
      const reopened = await service.reopenPeriod(params.id, body.reason, auth.userId);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'TIME_PERIOD_REOPENED',
        targetType: 'TimePeriodClose',
        targetId: reopened.id,
        outcome: 'SUCCESS',
        after: { reason: body.reason },
      });
      return reopened;
    },
  });

  // 5. Financial KPI & Capacity Utilization Reports
  registerRoute(router, deps, {
    method: 'get',
    path: '/timetracker/reports/executive',
    auth: { permission: 'timetracker.view' },
    query: z
      .object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        projectId: z.string().optional(),
        employeeId: z.string().optional(),
      })
      .optional(),
    handler: async ({ query, auth }) => {
      const canViewRates = auth.permissions.has('timetracker.rates.view');
      return service.getExecutiveOverview(query || {}, canViewRates);
    },
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/timetracker/reports/utilization',
    auth: { permission: 'timetracker.view' },
    query: z.object({
      startDate: z.string().default('2026-11-01'),
      endDate: z.string().default('2026-11-30'),
    }),
    handler: async ({ query }) => service.getTeamUtilization(query.startDate, query.endDate),
  });

  return router;
}
