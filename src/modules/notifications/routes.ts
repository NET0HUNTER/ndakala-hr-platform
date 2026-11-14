import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { notFound, conflict } from '../../core/errors/errors.js';
import { writeAudit } from '../../core/audit/audit.js';

export function createNotificationsRouter(deps: AppDeps): Router {
  const router = Router();

  // 1. Get Current User Notifications
  registerRoute(router, deps, {
    method: 'get',
    path: '/notifications',
    auth: 'session',
    query: z.object({
      unreadOnly: z.enum(['true', 'false']).optional(),
    }).optional(),
    handler: async ({ auth, query, deps }) => {
      const where: any = { recipientUserId: auth.userId };
      if (query?.unreadOnly === 'true') where.isRead = false;

      return deps.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    },
  });

  // 2. Mark Notification as Read
  registerRoute(router, deps, {
    method: 'patch',
    path: '/notifications/:id/read',
    auth: 'session',
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, deps }) => {
      const notif = await deps.prisma.notification.findUnique({
        where: { id: params.id },
      });
      if (!notif || notif.recipientUserId !== auth.userId) {
        throw notFound('Notification', params.id);
      }

      return deps.prisma.notification.update({
        where: { id: params.id },
        data: { isRead: true },
      });
    },
  });

  // 3. Dispatch Notification with Idempotency Key (Admin / System Trigger)
  registerRoute(router, deps, {
    method: 'post',
    path: '/notifications',
    auth: { permission: 'notifications.manage' },
    body: z.object({
      recipientUserId: z.string().uuid(),
      title: z.string().min(1).max(100),
      message: z.string().min(1).max(500),
      channel: z.enum(['IN_APP', 'EMAIL']).default('IN_APP'),
      idempotencyKey: z.string().min(8).max(64).optional(),
      deepLink: z.string().optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      // Check idempotency
      if (body.idempotencyKey) {
        const existing = await deps.prisma.notification.findUnique({
          where: { idempotencyKey: body.idempotencyKey },
        });
        if (existing) {
          return { ...existing, deduplicated: true };
        }
      }

      const notif = await deps.prisma.notification.create({
        data: {
          recipientUserId: body.recipientUserId,
          title: body.title,
          message: body.message,
          channel: body.channel,
          idempotencyKey: body.idempotencyKey,
          deepLink: body.deepLink,
          status: 'PENDING',
        },
      });

      return notif;
    },
  });

  // 4. Notification Retry Dispatch Engine
  registerRoute(router, deps, {
    method: 'post',
    path: '/notifications/:id/retry',
    auth: { permission: 'notifications.manage' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, deps }) => {
      const notif = await deps.prisma.notification.findUnique({
        where: { id: params.id },
      });
      if (!notif) throw notFound('Notification', params.id);

      if (notif.status === 'DELIVERED') {
        throw conflict('Notification is already delivered');
      }

      const nextAttempt = notif.attempts + 1;
      // Simulate delivery logic (in-app always delivers, email can simulate delivery)
      const isDelivered = nextAttempt <= notif.maxAttempts;

      const updated = await deps.prisma.notification.update({
        where: { id: params.id },
        data: {
          attempts: nextAttempt,
          lastAttemptAt: new Date(),
          status: isDelivered ? 'DELIVERED' : 'FAILED',
          failureReason: isDelivered ? null : 'Exceeded maximum delivery retry threshold',
        },
      });

      return updated;
    },
  });

  return router;
}
