import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';

export function createAuditRouter(deps: AppDeps): Router {
  const router = Router();

  // 1. Search / View Audit Logs
  registerRoute(router, deps, {
    method: 'get',
    path: '/audit-logs',
    auth: { permission: 'audit.view' },
    query: z.object({
      actorUserId: z.string().uuid().optional(),
      action: z.string().optional(),
      targetType: z.string().optional(),
      outcome: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }).optional(),
    handler: async ({ query, deps }) => {
      const where: any = {};
      if (query?.actorUserId) where.actorUserId = query.actorUserId;
      if (query?.action) where.action = query.action;
      if (query?.targetType) where.targetType = query.targetType;
      if (query?.outcome) where.outcome = query.outcome;

      const [items, total] = await Promise.all([
        deps.prisma.auditLog.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          take: query?.limit ?? 50,
          skip: query?.offset ?? 0,
        }),
        deps.prisma.auditLog.count({ where }),
      ]);

      return {
        total,
        limit: query?.limit ?? 50,
        offset: query?.offset ?? 0,
        items: items.map((i) => ({
          ...i,
          before: i.before ? JSON.parse(i.before) : null,
          after: i.after ? JSON.parse(i.after) : null,
        })),
      };
    },
  });

  // 2. Export Audit Evidence (CSV/JSON formatted)
  registerRoute(router, deps, {
    method: 'get',
    path: '/audit-logs/export',
    auth: { permission: 'audit.export' },
    query: z.object({
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
    }).optional(),
    handler: async ({ query, deps }) => {
      const where: any = {};
      if (query?.fromDate || query?.toDate) {
        where.timestamp = {};
        if (query.fromDate) where.timestamp.gte = new Date(query.fromDate);
        if (query.toDate) where.timestamp.lte = new Date(query.toDate);
      }

      const logs = await deps.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'asc' },
        take: 1000,
      });

      return {
        exportedAt: new Date().toISOString(),
        count: logs.length,
        logs: logs.map((l) => ({
          id: l.id,
          timestamp: l.timestamp,
          actor: l.actorEmail,
          action: l.action,
          targetType: l.targetType,
          targetId: l.targetId,
          outcome: l.outcome,
          correlationId: l.correlationId,
        })),
      };
    },
  });

  return router;
}
