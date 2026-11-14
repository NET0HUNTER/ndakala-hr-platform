import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { WorkforceService } from './service.js';
import { auditCtx } from '../employees/util.js';
import { notFound } from '../../core/errors/errors.js';

export function createWorkforceRouter(deps: AppDeps): Router {
  const router = Router();
  const service = new WorkforceService(deps.prisma);

  // 1. List Staff Requisitions (Form 1)
  registerRoute(router, deps, {
    method: 'get',
    path: '/workforce/requisitions',
    auth: { permission: 'requisition.view' },
    handler: async ({ deps }) => {
      return deps.prisma.staffRequisition.findMany({
        include: { department: true },
        orderBy: { createdAt: 'desc' },
      });
    },
  });

  // 2. Create Staff Requisition (Form 1)
  registerRoute(router, deps, {
    method: 'post',
    path: '/workforce/requisitions',
    auth: { permission: 'requisition.create' },
    body: z.object({
      departmentId: z.string(),
      positionTitle: z.string().min(2),
      gradeId: z.string().optional(),
      locationId: z.string().optional(),
      headcount: z.number().int().positive().default(1),
      reason: z.string(),
      vacancyDuration: z.string(),
      proposedStartDate: z.string().optional(),
      reportingToPosition: z.string().optional(),
      jobDescription: z.string().min(5),
      keyResponsibilities: z.string().min(5),
      requiredSkills: z.string().min(5),
      objectives: z.string().optional(),
      teamChallenges: z.string().optional(),
      budgetContext: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.createRequisition({
        ...body,
        userId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 3. Review Staff Requisition (Multi-stage Maker-Checker)
  registerRoute(router, deps, {
    method: 'post',
    path: '/workforce/requisitions/:id/review',
    auth: { permission: 'requisition.approve' },
    params: z.object({ id: z.string() }),
    body: z.object({
      stage: z.enum(['LINE_MANAGER', 'HR', 'GM']),
      decision: z.enum(['APPROVE', 'REJECT']),
      comments: z.string().optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.reviewRequisition({
        requisitionId: params.id,
        stage: body.stage,
        decision: body.decision,
        comments: body.comments,
        reviewerId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 4. Submit Post-Recruitment Survey (Form 2)
  registerRoute(router, deps, {
    method: 'post',
    path: '/workforce/surveys',
    auth: { permission: 'survey.manage' },
    body: z.object({
      requisitionId: z.string().optional(),
      candidateRef: z.string().optional(),
      roleClarityRating: z.number().int().min(1).max(5).optional(),
      processSpeedRating: z.number().int().min(1).max(5).optional(),
      candidateQualityRating: z.number().int().min(1).max(5).optional(),
      communicationRating: z.number().int().min(1).max(5).optional(),
      overallExperienceRating: z.number().int().min(1).max(5).optional(),
      comments: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req, deps }) => {
      const employee = await deps.prisma.employee.findUnique({
        where: { userId: auth.userId },
      });
      if (!employee) throw notFound('Hiring manager employee record not found');

      return service.submitRecruitmentSurvey({
        ...body,
        hiringManagerId: employee.id,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 5. Get Survey Metrics & Privacy-Safe Reporting
  registerRoute(router, deps, {
    method: 'get',
    path: '/workforce/surveys/metrics',
    auth: { permission: 'survey.manage' },
    handler: async () => {
      return service.getRecruitmentSurveyMetrics();
    },
  });

  // 6. List Transfers
  registerRoute(router, deps, {
    method: 'get',
    path: '/workforce/transfers',
    auth: 'session',
    handler: async ({ deps }) => {
      return deps.prisma.employeeTransfer.findMany({
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    },
  });

  // 7. Request Transfer (Leave carry-over block verified)
  registerRoute(router, deps, {
    method: 'post',
    path: '/workforce/transfers',
    auth: { permission: 'transfer.request' },
    body: z.object({
      employeeId: z.string(),
      proposedDepartmentId: z.string(),
      proposedPositionId: z.string(),
      proposedLocationId: z.string().optional(),
      proposedManagerId: z.string().optional(),
      reason: z.string().min(5),
      compensationGradeReviewNotes: z.string().optional(),
      handoverRequired: z.boolean().default(true),
      handoverNotes: z.string().optional(),
      effectiveDate: z.string(),
      leaveBalanceCarryOverPolicy: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.requestTransfer({
        ...body,
        requestedById: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 8. Review Transfer
  registerRoute(router, deps, {
    method: 'post',
    path: '/workforce/transfers/:id/review',
    auth: { permission: 'transfer.approve' },
    params: z.object({ id: z.string() }),
    body: z.object({
      decision: z.enum(['APPROVE', 'REJECT']),
      comments: z.string().optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.reviewTransfer({
        transferId: params.id,
        decision: body.decision,
        comments: body.comments,
        reviewerId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  return router;
}
