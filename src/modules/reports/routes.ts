import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { writeAudit } from '../../core/audit/audit.js';
import { auditCtx } from '../employees/util.js';
import { ReportsService } from './service.js';

const querySchema = z
  .object({
    scope: z.enum(['my', 'team', 'org']).default('org'),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    departmentId: z.string().optional(),
    search: z.string().optional(),
  })
  .optional();

export function createReportsRouter(deps: AppDeps): Router {
  const router = Router();
  const service = new ReportsService(deps.prisma);

  registerRoute(router, deps, {
    method: 'get',
    path: '/reports/summary',
    auth: { permission: 'reports.view' },
    query: querySchema,
    handler: async ({ query, auth }) => service.getExecutiveSummary(auth, query || {}),
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/reports/workforce',
    auth: { permission: 'reports.view' },
    query: querySchema,
    handler: async ({ query, auth }) => service.getWorkforceReport(auth, query || {}),
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/reports/leave',
    auth: { permission: 'reports.view' },
    query: querySchema,
    handler: async ({ query, auth }) => service.getLeaveReport(auth, query || {}),
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/reports/payroll',
    auth: { permission: 'reports.view' },
    query: querySchema,
    handler: async ({ query, auth }) => service.getPayrollReport(auth, query || {}),
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/reports/performance',
    auth: { permission: 'reports.view' },
    query: querySchema,
    handler: async ({ query, auth }) => service.getPerformanceReport(auth, query || {}),
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/reports/governance',
    auth: { permission: 'reports.view' },
    query: querySchema,
    handler: async ({ query, auth }) => service.getGovernanceReport(auth, query || {}),
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/reports/timetracker',
    auth: { permission: 'reports.view' },
    query: querySchema,
    handler: async ({ query, auth }) => service.getTimeTrackerReport(auth, query || {}),
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/reports/export/:domain',
    auth: { permission: 'reports.export' },
    params: z.object({ domain: z.string() }),
    query: querySchema,
    handler: async ({ params, query, auth, res }) => {
      const { filename, csv } = await service.exportDomainCsv(params.domain, auth, query || {});
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
      return undefined;
    },
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/reports/permissions',
    auth: { permission: 'reports.view' },
    handler: async () => service.getReportPermissions(),
  });

  registerRoute(router, deps, {
    method: 'put',
    path: '/reports/permissions',
    auth: { permission: 'reports.permissions.manage' },
    body: z.record(z.any()),
    handler: async ({ body, auth, req }) => {
      const updated = await service.updateReportPermissions(body, auth.userId);
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'REPORT_PERMISSIONS_UPDATED',
        targetType: 'PolicyConfiguration',
        targetId: 'REPORT_ACCESS_MATRIX',
        outcome: 'SUCCESS',
        after: updated,
      });
      return updated;
    },
  });

  return router;
}
