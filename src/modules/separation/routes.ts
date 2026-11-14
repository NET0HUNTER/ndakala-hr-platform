import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { SeparationService } from './service.js';
import { auditCtx } from '../employees/util.js';

export function createSeparationRouter(deps: AppDeps): Router {
  const router = Router();
  const service = new SeparationService(deps.prisma);

  // 1. List Separations
  registerRoute(router, deps, {
    method: 'get',
    path: '/separation',
    auth: 'session',
    handler: async ({ deps }) => {
      return deps.prisma.employeeSeparation.findMany({
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true, workEmail: true },
          },
          clearanceItems: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    },
  });

  // 2. Initiate Separation
  registerRoute(router, deps, {
    method: 'post',
    path: '/separation/initiate',
    auth: { permission: 'separation.initiate' },
    body: z.object({
      employeeId: z.string(),
      triggerType: z.string(),
      reason: z.string().min(5),
      sensitiveReasonCategory: z.string().optional(),
      noticeDate: z.string(),
      intendedLastDay: z.string(),
      effectiveDate: z.string(),
      noticeServedDays: z.number().int().default(0),
      noticeRequiredDays: z.number().int().optional(),
      noticeWaived: z.boolean().default(false),
      payInLieuOfNotice: z.boolean().default(false),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.initiateSeparation({
        ...body,
        initiatorUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 3. Get Separation Details (Restricted comments shielded)
  registerRoute(router, deps, {
    method: 'get',
    path: '/separation/:id',
    auth: 'session',
    params: z.object({ id: z.string() }),
    handler: async ({ params, auth, deps }) => {
      const separation = await deps.prisma.employeeSeparation.findUniqueOrThrow({
        where: { id: params.id },
        include: {
          employee: true,
          clearanceItems: true,
          exitInterview: true,
        },
      });

      const canViewRestricted =
        auth.roles.includes('managing_partner') ||
        auth.roles.includes('head_of_hr') ||
        auth.permissions.has('exit_interview.conduct');

      if (separation.exitInterview && !canViewRestricted) {
        separation.exitInterview.confidentialComments = '[RESTRICTED — HR PARTNER ONLY]';
      }

      return separation;
    },
  });

  // 4. Update Clearance Checklist Item
  registerRoute(router, deps, {
    method: 'patch',
    path: '/separation/:id/clearance/:itemId',
    auth: { permission: 'separation.clearance' },
    params: z.object({ id: z.string(), itemId: z.string() }),
    body: z.object({
      isCompleted: z.boolean(),
      hasFinancialDeduction: z.boolean().optional(),
      proposedDeductionAmount: z.number().optional(),
      deductionLawfulBasis: z.string().optional(),
      deductionApproved: z.boolean().optional(),
      notes: z.string().optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.updateClearanceItem({
        separationId: params.id,
        clearanceItemId: params.itemId,
        ...body,
        actorUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 5. Conduct Exit Interview
  registerRoute(router, deps, {
    method: 'post',
    path: '/separation/:id/exit-interview',
    auth: { permission: 'exit_interview.conduct' },
    params: z.object({ id: z.string() }),
    body: z.object({
      primaryReason: z.string().min(3),
      cultureRating: z.number().int().min(1).max(5).optional(),
      managementRating: z.number().int().min(1).max(5).optional(),
      compensationRating: z.number().int().min(1).max(5).optional(),
      confidentialComments: z.string().min(5),
    }),
    successStatus: 201,
    handler: async ({ params, body, auth, req }) => {
      return service.conductExitInterview({
        separationId: params.id,
        ...body,
        interviewerUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 6. Finalize Separation & Issue Certificate of Service
  registerRoute(router, deps, {
    method: 'post',
    path: '/separation/:id/finalize',
    auth: { permission: 'separation.approve' },
    params: z.object({ id: z.string() }),
    handler: async ({ params, auth, req }) => {
      return service.finalizeSeparation({
        separationId: params.id,
        approverUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  return router;
}
