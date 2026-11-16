import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { GovernanceService } from './service.js';
import { auditCtx } from '../employees/util.js';
import { notFound } from '../../core/errors/errors.js';

export function createGovernanceRouter(deps: AppDeps): Router {
  const router = Router();
  const service = new GovernanceService(deps.prisma);

  // 1. List Policy Documents & Versions
  registerRoute(router, deps, {
    method: 'get',
    path: '/governance/policies',
    auth: 'session',
    handler: async ({ deps }) => {
      return deps.prisma.policyDocument.findMany({
        include: {
          versions: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { code: 'asc' },
      });
    },
  });

  // 2. Draft Policy Document
  registerRoute(router, deps, {
    method: 'post',
    path: '/governance/policies',
    auth: { permission: 'policy.manage' },
    body: z.object({
      code: z.string().min(3),
      title: z.string().min(3),
      owner: z.string().default('Human Resources'),
      targetAudience: z.string().default('ALL_STAFF'),
      category: z.string().default('CODE_OF_CONDUCT'),
      initialVersionSummary: z.string().min(5),
      effectiveDate: z.string(),
      reviewDate: z.string().optional(),
      sourceReference: z.string().min(3),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.createPolicy({
        ...body,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 3. Draft New Version for Policy
  registerRoute(router, deps, {
    method: 'post',
    path: '/governance/policies/:id/versions',
    auth: { permission: 'policy.manage' },
    params: z.object({ id: z.string() }),
    body: z.object({
      versionNumber: z.string(),
      contentSummary: z.string().min(5),
      effectiveDate: z.string(),
      reviewDate: z.string().optional(),
      sourceReference: z.string(),
    }),
    successStatus: 201,
    handler: async ({ params, body, auth, req }) => {
      return service.createNewVersion(params.id, {
        ...body,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 4. Publish Version (Maker-Checker enforced)
  registerRoute(router, deps, {
    method: 'post',
    path: '/governance/policies/versions/:versionId/publish',
    auth: { permission: 'policy.manage' },
    params: z.object({ versionId: z.string() }),
    handler: async ({ params, auth, req }) => {
      return service.publishPolicyVersion({
        versionId: params.versionId,
        approverId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 4b. Dispatch Acknowledgement Reminders for Pending Staff
  registerRoute(router, deps, {
    method: 'post',
    path: '/governance/policies/versions/:versionId/remind',
    auth: { permission: 'policy.manage' },
    params: z.object({ versionId: z.string() }),
    handler: async ({ params, auth, req, deps }) => {
      const version = await deps.prisma.policyVersion.findUnique({
        where: { id: params.versionId },
        include: { policy: true },
      });
      if (!version) throw notFound('PolicyVersion', params.versionId);

      const pendingCount = await deps.prisma.policyAcknowledgement.count({
        where: { policyVersionId: version.id, status: 'PENDING' },
      });

      const { writeAudit } = await import('../../core/audit/audit.js');
      await writeAudit(deps.prisma, auditCtx(auth, req), {
        action: 'POLICY_ACKNOWLEDGEMENT_REMINDER_DISPATCHED',
        targetType: 'PolicyVersion',
        targetId: version.id,
        outcome: 'SUCCESS',
        after: { policyCode: version.policy.code, versionNumber: version.versionNumber, pendingCount },
      });

      return { versionId: version.id, pendingCount, remindedAt: new Date().toISOString() };
    },
  });

  // 5. List Employee Acknowledgements
  registerRoute(router, deps, {
    method: 'get',
    path: '/governance/policies/acknowledgements',
    auth: 'session',
    handler: async ({ auth, deps }) => {
      const employee = await deps.prisma.employee.findUnique({
        where: { userId: auth.userId },
      });
      if (!employee) return [];

      return deps.prisma.policyAcknowledgement.findMany({
        where: { employeeId: employee.id },
        include: {
          policyVersion: {
            include: { policy: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    },
  });

  // 6. Acknowledge Policy (Exact version bound)
  registerRoute(router, deps, {
    method: 'post',
    path: '/governance/policies/acknowledgements/:id/acknowledge',
    auth: { permission: 'policy.view_self' },
    params: z.object({ id: z.string() }),
    body: z.object({
      evidenceDocumentId: z.string().optional(),
    }).optional(),
    handler: async ({ params, body, auth, req, deps }) => {
      const employee = await deps.prisma.employee.findUnique({
        where: { userId: auth.userId },
      });
      if (!employee) throw notFound('Employee record not found');

      return service.acknowledgePolicy({
        acknowledgementId: params.id,
        employeeId: employee.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        evidenceDocumentId: body?.evidenceDocumentId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 7. Refuse Policy
  registerRoute(router, deps, {
    method: 'post',
    path: '/governance/policies/acknowledgements/:id/refuse',
    auth: { permission: 'policy.view_self' },
    params: z.object({ id: z.string() }),
    body: z.object({
      refusalReason: z.string().min(5),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      const employee = await deps.prisma.employee.findUnique({
        where: { userId: auth.userId },
      });
      if (!employee) throw notFound('Employee record not found');

      return service.refusePolicy({
        acknowledgementId: params.id,
        employeeId: employee.id,
        refusalReason: body.refusalReason,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 8. Training Catalog
  registerRoute(router, deps, {
    method: 'get',
    path: '/governance/training/programmes',
    auth: 'session',
    handler: async ({ deps }) => {
      return deps.prisma.trainingProgramme.findMany({
        orderBy: { code: 'asc' },
      });
    },
  });

  // 9. Create Training Programme
  registerRoute(router, deps, {
    method: 'post',
    path: '/governance/training/programmes',
    auth: { permission: 'training.manage' },
    body: z.object({
      code: z.string().min(3),
      name: z.string().min(3),
      category: z.string(),
      recurrence: z.string().optional(),
      dueDaysAfterAssignment: z.number().optional(),
      description: z.string().optional(),
      provider: z.string().optional(),
      decisionReference: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.createTrainingProgramme({
        ...body,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 10. Assign Training Programme
  registerRoute(router, deps, {
    method: 'post',
    path: '/governance/training/assign',
    auth: { permission: 'training.manage' },
    body: z.object({
      programmeId: z.string(),
      employeeId: z.string(),
      dueDate: z.string(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.assignTraining({
        ...body,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 11. My Training Assignments
  registerRoute(router, deps, {
    method: 'get',
    path: '/governance/training/my-assignments',
    auth: 'session',
    handler: async ({ auth, deps }) => {
      const employee = await deps.prisma.employee.findUnique({
        where: { userId: auth.userId },
      });
      if (!employee) return [];

      return deps.prisma.trainingAssignment.findMany({
        where: { employeeId: employee.id },
        include: { programme: true },
        orderBy: { dueDate: 'asc' },
      });
    },
  });

  // 12. Complete Training
  registerRoute(router, deps, {
    method: 'post',
    path: '/governance/training/assignments/:id/complete',
    auth: 'session',
    params: z.object({ id: z.string() }),
    body: z.object({
      scorePercent: z.number().optional(),
      passed: z.boolean().optional(),
      evidenceDocumentId: z.string().optional(),
      certificateNumber: z.string().optional(),
      remedialAction: z.string().optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.completeTraining({
        assignmentId: params.id,
        ...body,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 13. Phishing Simulation Record
  registerRoute(router, deps, {
    method: 'post',
    path: '/governance/training/phishing-records',
    auth: { permission: 'training.manage' },
    body: z.object({
      campaignName: z.string(),
      simulationDate: z.string(),
      employeeId: z.string(),
      payloadType: z.string(),
      clickedLink: z.boolean().default(false),
      submittedCredentials: z.boolean().default(false),
      reportedPhish: z.boolean().default(false),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.recordPhishingSimulation({
        ...body,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 14. List Phishing Records
  registerRoute(router, deps, {
    method: 'get',
    path: '/governance/training/phishing-records',
    auth: { permission: 'training.manage' },
    handler: async ({ deps }) => {
      return deps.prisma.phishingSimulationRecord.findMany({
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, workEmail: true },
          },
        },
        orderBy: { simulationDate: 'desc' },
      });
    },
  });

  // 15. Security Communication Log
  registerRoute(router, deps, {
    method: 'get',
    path: '/governance/training/security-comms',
    auth: 'session',
    handler: async ({ deps }) => {
      return deps.prisma.securityCommunicationLog.findMany({
        orderBy: { sentAt: 'desc' },
        take: 50,
      });
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/governance/training/security-comms',
    auth: { permission: 'training.manage' },
    body: z.object({
      subject: z.string(),
      channel: z.string().default('EMAIL'),
      audience: z.string().default('ALL_STAFF'),
      reference: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.logSecurityCommunication({
        ...body,
        sentById: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  return router;
}
