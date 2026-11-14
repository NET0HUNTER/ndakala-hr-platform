import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { PrivacyService } from './service.js';
import { auditCtx } from '../employees/util.js';
import { forbidden } from '../../core/errors/errors.js';

export function createPrivacyRouter(deps: AppDeps): Router {
  const router = Router();
  const service = new PrivacyService(deps.prisma);

  // 1. DPIA Register
  registerRoute(router, deps, {
    method: 'get',
    path: '/privacy/dpia',
    auth: { permission: 'system.hardening.view' },
    handler: async () => {
      return service.getDPIARegister();
    },
  });

  // 2. List DSR Requests
  registerRoute(router, deps, {
    method: 'get',
    path: '/privacy/dsr',
    auth: 'session',
    handler: async ({ auth, req }) => {
      const hasManage = auth?.roles.some((r) => ['managing_partner', 'dpo', 'head_of_hr'].includes(r));
      const employeeId = req.query.employeeId as string | undefined;

      // If ordinary user without manage perm, scope to their own employee ID
      if (!hasManage) {
        const emp = await deps.prisma.employee.findFirst({
          where: { userId: auth!.userId },
          select: { id: true },
        });
        if (!emp?.id) return [];
        return service.listDSRRequests({ employeeId: emp.id });
      }

      return service.listDSRRequests({ employeeId });
    },
  });

  // 3. Submit DSR Request
  registerRoute(router, deps, {
    method: 'post',
    path: '/privacy/dsr',
    auth: { permission: 'privacy.dsr.submit' },
    body: z.object({
      employeeId: z.string(),
      requestType: z.enum(['ACCESS', 'RECTIFICATION', 'ERASURE', 'OBJECTION', 'PORTABILITY']),
      lawfulJustification: z.string().min(5),
      details: z.string().optional(),
      requesterEmail: z.string().email(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      // If regular employee, verify they are submitting for themselves
      const hasManage = auth?.roles.some((r) => ['managing_partner', 'dpo', 'head_of_hr'].includes(r));
      if (!hasManage) {
        const emp = await deps.prisma.employee.findFirst({
          where: { userId: auth!.userId },
          select: { id: true },
        });
        if (emp?.id !== body.employeeId) {
          throw forbidden('You can only submit statutory data subject requests for your own employee record');
        }
      }

      return service.submitDSR(body, auditCtx(auth!, req));
    },
  });

  // 4. View DSR Request Details
  registerRoute(router, deps, {
    method: 'get',
    path: '/privacy/dsr/:id',
    auth: 'session',
    handler: async ({ params, auth }) => {
      const dsr = await service.getDSRRequest(params.id);
      const hasManage = auth?.roles.some((r) => ['managing_partner', 'dpo', 'head_of_hr'].includes(r));

      if (!hasManage) {
        const emp = await deps.prisma.employee.findFirst({
          where: { userId: auth!.userId },
          select: { id: true },
        });
        if (emp?.id !== dsr.employeeId) {
          throw forbidden('Access restricted to your own DSR request');
        }
      }

      return dsr;
    },
  });

  // 5. Review / Action DSR Request (DPO / Head of HR / Managing Partner)
  registerRoute(router, deps, {
    method: 'post',
    path: '/privacy/dsr/:id/review',
    auth: { permission: 'privacy.dsr.manage' },
    body: z.object({
      action: z.enum(['APPROVE', 'REJECT', 'FULFILL']),
      rejectionReason: z.string().optional(),
      details: z.string().optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.reviewDSR(
        {
          requestId: params.id,
          action: body.action,
          rejectionReason: body.rejectionReason,
          details: body.details,
          handlerUserId: auth!.userId,
        },
        auditCtx(auth!, req)
      );
    },
  });

  // 6. Generate Data Portability / Access Package
  registerRoute(router, deps, {
    method: 'get',
    path: '/privacy/dsr/export/:employeeId',
    auth: 'session',
    handler: async ({ params, auth }) => {
      const hasManage = auth?.roles.some((r) => ['managing_partner', 'dpo', 'head_of_hr'].includes(r));
      if (!hasManage) {
        const emp = await deps.prisma.employee.findFirst({
          where: { userId: auth!.userId },
          select: { id: true },
        });
        if (emp?.id !== params.employeeId) {
          throw forbidden('Access restricted to your own data portability package');
        }
      }

      return service.generatePortabilityPackage(params.employeeId);
    },
  });

  // 7. List Legal Holds
  registerRoute(router, deps, {
    method: 'get',
    path: '/privacy/legal-holds',
    auth: { permission: 'privacy.legal_hold.manage' },
    handler: async ({ req }) => {
      const employeeId = req.query.employeeId as string | undefined;
      return service.listLegalHolds(employeeId);
    },
  });

  // 8. Apply Legal Hold
  registerRoute(router, deps, {
    method: 'post',
    path: '/privacy/legal-holds',
    auth: { permission: 'privacy.legal_hold.manage' },
    body: z.object({
      employeeId: z.string(),
      matterTitle: z.string().min(3),
      reasonCategory: z.enum(['LITIGATION', 'ER_INVESTIGATION', 'TAX_AUDIT', 'REGULATORY']),
      notes: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.applyLegalHold(body, auth!.userId, auditCtx(auth!, req));
    },
  });

  // 9. Release Legal Hold
  registerRoute(router, deps, {
    method: 'post',
    path: '/privacy/legal-holds/:id/release',
    auth: { permission: 'privacy.legal_hold.manage' },
    body: z.object({
      notes: z.string().optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.releaseLegalHold({ holdId: params.id, notes: body.notes }, auditCtx(auth!, req));
    },
  });

  return router;
}
