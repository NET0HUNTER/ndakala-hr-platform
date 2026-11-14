import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { ErService } from './service.js';
import { auditCtx } from '../employees/util.js';

export function createErRouter(deps: AppDeps): Router {
  const router = Router();
  const service = new ErService(deps.prisma);

  // 1. Public Whistleblower Anonymous Intake (No Auth Required)
  registerRoute(router, deps, {
    method: 'post',
    path: '/er/cases/whistleblower/anonymous',
    auth: 'public',
    body: z.object({
      title: z.string().min(5),
      allegationSummary: z.string().min(10),
      policyClausesCited: z.string().optional(),
      voluntaryContactName: z.string().optional(),
      voluntaryContactEmail: z.string().email().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, req }) => {
      const auditContext = {
        userId: 'ANONYMOUS',
        email: null,
        role: 'WHISTLEBLOWER',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        correlationId: req.requestId,
      };
      return service.submitAnonymousWhistleblower({
        ...body,
        auditCtx: auditContext,
      });
    },
  });

  // 2. Public Whistleblower Token Tracking (No Auth Required)
  registerRoute(router, deps, {
    method: 'get',
    path: '/er/cases/whistleblower/track/:token',
    auth: 'public',
    params: z.object({ token: z.string() }),
    handler: async ({ params }) => {
      return service.trackAnonymousWhistleblower(params.token);
    },
  });

  // 3. Authenticated ER Case Intake
  registerRoute(router, deps, {
    method: 'post',
    path: '/er/cases',
    auth: { permission: 'er.intake' },
    body: z.object({
      caseType: z.enum(['DISCIPLINARY', 'GRIEVANCE', 'HARASSMENT_DISCRIMINATION', 'WHISTLEBLOWING']),
      title: z.string().min(5),
      severity: z.enum(['STANDARD', 'HIGH', 'CRITICAL']).optional(),
      primaryHandlerId: z.string().optional(),
      assignedInvestigatorId: z.string().optional(),
      subjectEmployeeId: z.string().optional(),
      complainantEmployeeId: z.string().optional(),
      allegationSummary: z.string().min(10),
      policyClausesCited: z.string().optional(),
      safetySupportMeasures: z.string().optional(),
      intakeChannel: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.createCase({
        ...body,
        userId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 4. Authenticated Case Listing (MANDATORY CASE-LEVEL ACCESS ENFORCEMENT)
  // A generic HR case list visible to all HR staff is strictly PROHIBITED.
  registerRoute(router, deps, {
    method: 'get',
    path: '/er/cases',
    auth: 'session',
    handler: async ({ auth, deps }) => {
      const userId = auth.userId;
      const isManagingPartner = auth.roles.includes('managing_partner');

      if (isManagingPartner) {
        return deps.prisma.erCase.findMany({
          orderBy: { createdAt: 'desc' },
        });
      }

      const accesses = await deps.prisma.erCaseAccess.findMany({
        where: { userId, revokedAt: null },
        select: { caseId: true },
      });
      const assignedCaseIds = accesses.map((a) => a.caseId);

      return deps.prisma.erCase.findMany({
        where: {
          OR: [
            { primaryHandlerId: userId },
            { assignedInvestigatorId: userId },
            { id: { in: assignedCaseIds } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    },
  });

  // 5. Individual Case Inspection (Enforces case-level access)
  registerRoute(router, deps, {
    method: 'get',
    path: '/er/cases/:id',
    auth: 'session',
    params: z.object({ id: z.string() }),
    handler: async ({ params, auth, deps }) => {
      await service.assertCaseAccess(auth.userId, auth.roles, params.id);

      return deps.prisma.erCase.findUniqueOrThrow({
        where: { id: params.id },
        include: {
          accessControls: { where: { revokedAt: null } },
          conflicts: true,
          evidence: true,
          hearings: true,
          decisions: true,
          appeals: true,
          events: { orderBy: { createdAt: 'asc' } },
        },
      });
    },
  });

  // 6. Grant Case Access (Handler, Investigator, Panel, Appeal)
  registerRoute(router, deps, {
    method: 'post',
    path: '/er/cases/:id/access',
    auth: { permission: 'er.case.handle' },
    params: z.object({ id: z.string() }),
    body: z.object({
      userId: z.string(),
      role: z.enum(['HANDLER', 'INVESTIGATOR', 'PANEL_MEMBER', 'APPEAL_OFFICER', 'OBSERVER']),
    }),
    successStatus: 201,
    handler: async ({ params, body, auth, req }) => {
      await service.assertCaseAccess(auth.userId, auth.roles, params.id);

      return service.grantCaseAccess({
        caseId: params.id,
        userId: body.userId,
        role: body.role,
        grantedById: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 7. Declare Conflict of Interest & Reassign
  registerRoute(router, deps, {
    method: 'post',
    path: '/er/cases/:id/conflict',
    auth: 'session',
    params: z.object({ id: z.string() }),
    body: z.object({
      natureOfConflict: z.string().min(5),
      reassignToUserId: z.string().optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.declareConflictOfInterest({
        caseId: params.id,
        declaringUserId: auth.userId,
        natureOfConflict: body.natureOfConflict,
        reassignToUserId: body.reassignToUserId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 8. Schedule Hearing
  registerRoute(router, deps, {
    method: 'post',
    path: '/er/cases/:id/hearings',
    auth: { permission: 'er.case.handle' },
    params: z.object({ id: z.string() }),
    body: z.object({
      scheduledDate: z.string(),
      locationOrLink: z.string().min(2),
      companionAllowed: z.boolean().default(true),
      companionName: z.string().optional(),
      panelMemberUserIds: z.array(z.string()).default([]),
    }),
    successStatus: 201,
    handler: async ({ params, body, auth, req }) => {
      await service.assertCaseAccess(auth.userId, auth.roles, params.id);

      return service.scheduleHearing({
        caseId: params.id,
        ...body,
        schedulerUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 9. Upload Case Evidence
  registerRoute(router, deps, {
    method: 'post',
    path: '/er/cases/:id/evidence',
    auth: 'session',
    params: z.object({ id: z.string() }),
    body: z.object({
      documentId: z.string(),
      category: z.string(),
      title: z.string().min(2),
      isRestrictedMedical: z.boolean().default(false),
    }),
    successStatus: 201,
    handler: async ({ params, body, auth, req }) => {
      await service.assertCaseAccess(auth.userId, auth.roles, params.id);

      return service.uploadCaseEvidence({
        caseId: params.id,
        ...body,
        uploadedById: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 10. Issue Case Decision (Authorised Human Record)
  registerRoute(router, deps, {
    method: 'post',
    path: '/er/cases/:id/decision',
    auth: { permission: 'er.case.handle' },
    params: z.object({ id: z.string() }),
    body: z.object({
      findings: z.string().min(5),
      sanction: z.string().optional(),
      sanctionDurationMonths: z.number().optional(),
      appealDeadlineDays: z.number().optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      await service.assertCaseAccess(auth.userId, auth.roles, params.id);

      return service.issueDecision({
        caseId: params.id,
        ...body,
        deciderUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 11. Submit Appeal
  registerRoute(router, deps, {
    method: 'post',
    path: '/er/cases/:id/appeal',
    auth: 'session',
    params: z.object({ id: z.string() }),
    body: z.object({
      grounds: z.string().min(10),
      appealOfficerId: z.string(),
    }),
    successStatus: 201,
    handler: async ({ params, body, auth, req }) => {
      return service.submitAppeal({
        caseId: params.id,
        grounds: body.grounds,
        appealOfficerId: body.appealOfficerId,
        appellantUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 12. Review Appeal
  registerRoute(router, deps, {
    method: 'post',
    path: '/er/cases/:id/appeal/review',
    auth: { permission: 'er.case.appeal' },
    params: z.object({ id: z.string() }),
    body: z.object({
      appealId: z.string(),
      outcome: z.enum(['UPHELD', 'OVERTURNED', 'MODIFIED']),
      comments: z.string().min(5),
    }),
    handler: async ({ body, auth, req }) => {
      return service.reviewAppeal({
        appealId: body.appealId,
        outcome: body.outcome,
        comments: body.comments,
        reviewerUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  return router;
}
