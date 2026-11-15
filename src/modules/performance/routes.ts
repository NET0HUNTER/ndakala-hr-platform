import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { PerformanceService } from './service.js';
import { auditCtx } from '../employees/util.js';
import { forbidden, notFound } from '../../core/errors/errors.js';

export function createPerformanceRouter(deps: AppDeps): Router {
  const router = Router();
  const service = new PerformanceService(deps.prisma);

  // 1. Rating Scales Reference Data
  registerRoute(router, deps, {
    method: 'get',
    path: '/performance/rating-scales',
    auth: 'session',
    handler: async ({ deps }) => {
      return deps.prisma.performanceRatingScale.findMany({
        where: { isActive: true },
        orderBy: { code: 'asc' },
      });
    },
  });

  // 2. List & Create Performance Cycles
  registerRoute(router, deps, {
    method: 'get',
    path: '/performance/cycles',
    auth: 'session',
    handler: async ({ deps }) => {
      return deps.prisma.performanceCycle.findMany({
        orderBy: { createdAt: 'desc' },
      });
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/cycles',
    auth: { permission: 'performance.cycle.manage' },
    body: z.object({
      title: z.string().min(5),
      cycleType: z.enum(['ANNUAL', 'QUARTERLY']),
      periodStart: z.string(),
      periodEnd: z.string(),
      selfAppraisalDeadline: z.string(),
      managerReviewDeadline: z.string(),
      moderationDeadline: z.string().optional(),
      maxObjectivesGuideline: z.number().int().min(1).default(6),
      allowPeerFeedback: z.boolean().default(false),
      peerFeedbackPrivacyModel: z.string().default('HR_RESTRICTED'),
      distributionGuidance: z.record(z.string(), z.number()).optional(),
      isDistributionMandatory: z.boolean().default(false),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      const guidance = body.distributionGuidance
        ? Object.fromEntries(Object.entries(body.distributionGuidance).map(([k, v]) => [Number(k), v]))
        : undefined;

      return service.createPerformanceCycle({
        ...body,
        distributionGuidance: guidance,
        createdById: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 3. Cycle Rating Metrics & Unapproved Formula Guardrail
  registerRoute(router, deps, {
    method: 'get',
    path: '/performance/cycles/:id/metrics',
    auth: { permission: 'performance.reports.view' },
    params: z.object({ id: z.string() }),
    handler: async ({ params }) => {
      return service.calculateCycleMetrics(params.id);
    },
  });

  // 3b. View Annual Formula Configuration
  registerRoute(router, deps, {
    method: 'get',
    path: '/performance/cycles/:id/formula-config',
    auth: { permission: 'performance.reports.view' },
    params: z.object({ id: z.string() }),
    handler: async ({ params }) => {
      return service.getAnnualFormulaConfig(params.id);
    },
  });

  // 3c. Propose Annual Formula Configuration
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/cycles/:id/formula-config',
    auth: { permission: 'performance.cycle.manage' },
    params: z.object({ id: z.string() }),
    body: z.object({
      model: z.enum(['SIMPLE_AVERAGE', 'QUARTERLY_WEIGHTED', 'ANNUAL_ONLY', 'HYBRID_SPLIT']),
      weights: z.record(z.string(), z.number()).optional(),
      roundingMethod: z.enum(['TWO_DECIMALS', 'NEAREST_HALF', 'NEAREST_INTEGER', 'FLOOR', 'CEIL']).optional(),
      minCyclesRequired: z.number().int().min(1).max(4).optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.proposeAnnualFormula({
        cycleId: params.id,
        ...body,
        proposerUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 3d. Approve & Activate Annual Formula Configuration (Maker-Checker Enforced)
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/cycles/:id/formula-config/approve',
    auth: { permission: 'appraisal.approve' },
    params: z.object({ id: z.string() }),
    handler: async ({ params, auth, req }) => {
      return service.approveAnnualFormula({
        cycleId: params.id,
        approverUserId: auth.userId,
        approverRole: auth.roles[0],
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 3e. Simulate Annual Formula Models (Interactive Leadership Sandbox)
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/cycles/:id/formula-config/simulate',
    auth: { permission: 'performance.reports.view' },
    params: z.object({ id: z.string() }),
    body: z.object({
      sampleScores: z.array(z.number().min(1).max(6)).optional(),
      customWeights: z.record(z.string(), z.number()).optional(),
      roundingMethod: z.enum(['TWO_DECIMALS', 'NEAREST_HALF', 'NEAREST_INTEGER', 'FLOOR', 'CEIL']).optional(),
    }),
    handler: async ({ params, body }) => {
      return service.simulateAnnualFormulas({
        cycleId: params.id,
        ...body,
      });
    },
  });

  // 4. List & Create Performance Objective Sets
  registerRoute(router, deps, {
    method: 'get',
    path: '/performance/objectives',
    auth: 'session',
    handler: async ({ auth }) => {
      return service.listObjectiveSets(auth.userId, auth.roles);
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/objectives',
    auth: 'session',
    body: z.object({
      employeeId: z.string(),
      cycleId: z.string().optional(),
      title: z.string().min(3),
      objectives: z.array(
        z.object({
          title: z.string().min(3),
          kpi: z.string().min(3),
          behavioursAndValues: z.string().min(3),
          expectedDate: z.string(),
          weightPercent: z.number().optional(),
          supportRequired: z.string().optional(),
          isRealistic: z.boolean().default(true),
          supportAgreedDeadline: z.string().optional(),
        })
      ).min(1),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req, deps }) => {
      const canManageOthers =
        auth.roles.includes('managing_partner') ||
        auth.roles.includes('operations_director') ||
        auth.roles.includes('head_of_hr') ||
        auth.roles.includes('line_manager');
      if (!canManageOthers) {
        const actorEmp = await deps.prisma.employee.findUnique({ where: { userId: auth.userId }, select: { id: true } });
        if (!actorEmp || actorEmp.id !== body.employeeId) {
          throw forbidden('Employees may only create objective sets for their own profile.');
        }
      }
      return service.createObjectiveSet({
        ...body,
        userId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 5. Submit Objective Set (Employee)
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/objectives/:id/submit',
    auth: { permission: 'objectives.manage_self' },
    params: z.object({ id: z.string() }),
    handler: async ({ params, auth, req }) => {
      return service.submitObjectiveSet(params.id, auth.userId, auditCtx(auth, req));
    },
  });

  // 6. Approve Objective Set (Maker-Checker enforced)
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/objectives/:id/approve',
    auth: { permission: 'objectives.approve' },
    params: z.object({ id: z.string() }),
    handler: async ({ params, auth, req }) => {
      return service.approveObjectiveSet(params.id, auth.userId, auth.roles[0], auditCtx(auth, req));
    },
  });

  // 7. Amend Approved Objective Set (History preserved)
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/objectives/:id/amend',
    auth: { permission: 'objectives.approve' },
    params: z.object({ id: z.string() }),
    body: z.object({
      amendmentReason: z.string().min(5),
      updatedObjectives: z.array(
        z.object({
          title: z.string().min(3),
          kpi: z.string().min(3),
          behavioursAndValues: z.string().min(3),
          expectedDate: z.string(),
          weightPercent: z.number().optional(),
          supportRequired: z.string().optional(),
          isRealistic: z.boolean().default(true),
          supportAgreedDeadline: z.string().optional(),
        })
      ).min(1),
    }),
    successStatus: 201,
    handler: async ({ params, body, auth, req }) => {
      return service.amendObjectiveSet({
        objectiveSetId: params.id,
        amendmentReason: body.amendmentReason,
        updatedObjectives: body.updatedObjectives,
        userId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 8. Self-Appraisal Submission (at least two strengths and improvement areas)
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/appraisals/self',
    auth: { permission: 'appraisal.view_self' },
    body: z.object({
      cycleId: z.string(),
      employeeId: z.string(),
      selfAchievements: z.string().min(5),
      selfStrengths: z.array(z.string().min(2)).min(2),
      selfImprovementAreas: z.array(z.string().min(2)).min(2),
      selfChallenges: z.string().optional(),
      selfSupportRequired: z.string().optional(),
      objectiveRatings: z.array(
        z.object({
          objectiveId: z.string(),
          employeeRating: z.number().int().min(1).max(6),
          employeeComments: z.string().optional(),
        })
      ).optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req, deps }) => {
      const isExecutive =
        auth.roles.includes('managing_partner') ||
        auth.roles.includes('operations_director') ||
        auth.roles.includes('head_of_hr');
      if (!isExecutive) {
        const actorEmp = await deps.prisma.employee.findUnique({ where: { userId: auth.userId }, select: { id: true } });
        if (!actorEmp || actorEmp.id !== body.employeeId) {
          throw forbidden('You can only submit a self-appraisal for your own employee record.');
        }
      }
      return service.submitSelfAppraisal({
        ...body,
        userId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 9. Manager Appraisal Submission (Maker-Checker enforced)
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/appraisals/:id/manager',
    auth: { permission: 'appraisal.manage_team' },
    params: z.object({ id: z.string() }),
    body: z.object({
      managerAchievementsComments: z.string().optional(),
      managerStrengths: z.array(z.string().min(2)).min(2),
      managerImprovementAreas: z.array(z.string().min(2)).min(2),
      managerGeneralComments: z.string().optional(),
      managerRatingCode: z.number().int().min(1).max(6),
      objectiveRatings: z.array(
        z.object({
          objectiveId: z.string(),
          managerRating: z.number().int().min(1).max(6),
          managerComments: z.string().optional(),
          achievementStatus: z.string().optional(),
        })
      ).optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.submitManagerAppraisal({
        appraisalId: params.id,
        ...body,
        managerId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 10. Record Formal Review Meeting
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/appraisals/:id/meeting',
    auth: { permission: 'appraisal.manage_team' },
    params: z.object({ id: z.string() }),
    body: z.object({
      meetingDate: z.string(),
      meetingNotes: z.string().min(5),
      developmentAgreement: z.string().min(5),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.recordReviewMeeting({
        appraisalId: params.id,
        ...body,
        actorUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 11. HR Moderation
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/appraisals/:id/moderate',
    auth: { permission: 'appraisal.moderate' },
    params: z.object({ id: z.string() }),
    body: z.object({
      moderatedRatingCode: z.number().int().min(1).max(6),
      moderationNotes: z.string().min(5),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.moderateAppraisal({
        appraisalId: params.id,
        moderatedRatingCode: body.moderatedRatingCode,
        moderationNotes: body.moderationNotes,
        moderatorUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 12. Partner Final Approval
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/appraisals/:id/approve',
    auth: { permission: 'appraisal.approve' },
    params: z.object({ id: z.string() }),
    handler: async ({ params, auth, req }) => {
      return service.approveAppraisal({
        appraisalId: params.id,
        approverUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 13. Inspect Appraisal (Enforces peer feedback privacy model)
  registerRoute(router, deps, {
    method: 'get',
    path: '/performance/appraisals/:id',
    auth: 'session',
    params: z.object({ id: z.string() }),
    handler: async ({ params, auth, deps }) => {
      const appraisal = await deps.prisma.performanceAppraisal.findUniqueOrThrow({
        where: { id: params.id },
        include: {
          cycle: true,
          employee: true,
          manager: true,
          objectiveScores: { include: { objective: true } },
          peerFeedbacks: true,
          developmentPlans: { include: { actions: true } },
        },
      });

      // Scope check: employee can only view their own; manager can only view their reporting line (unless executive)
      const isExecutive = auth.roles.includes('managing_partner') || auth.roles.includes('operations_director') || auth.roles.includes('head_of_hr');
      const isReviewee = appraisal.employee.userId === auth.userId;
      const isManager = appraisal.manager.userId === auth.userId;

      if (!isExecutive && !isReviewee && !isManager) {
        throw forbidden('Access denied: You are not authorized to view this appraisal record.');
      }

      // PRIVACY MODEL ENFORCEMENT:
      // If the reviewee is viewing, suppress peer identity to prevent retaliation
      if (isReviewee && !isExecutive) {
        return {
          ...appraisal,
          peerFeedbacks: appraisal.peerFeedbacks.map((f) => ({
            id: f.id,
            feedbackText: f.feedbackText,
            strengths: f.strengths,
            improvementAreas: f.improvementAreas,
            submittedAt: f.submittedAt,
            peerEmployeeId: '[ANONYMISED / IDENTITY PROTECTED FROM REVIEWEE]',
          })),
        };
      }

      return appraisal;
    },
  });

  // 14. Request & Submit Peer Feedback
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/appraisals/:id/peer-feedback/request',
    auth: { permission: 'peer_feedback.request' },
    params: z.object({ id: z.string() }),
    body: z.object({
      peerEmployeeId: z.string(),
    }),
    successStatus: 201,
    handler: async ({ params, body, auth, req }) => {
      return service.requestPeerFeedback({
        appraisalId: params.id,
        requesterId: auth.userId,
        peerEmployeeId: body.peerEmployeeId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/peer-feedback/:id/submit',
    auth: { permission: 'peer_feedback.submit' },
    params: z.object({ id: z.string() }),
    body: z.object({
      peerEmployeeId: z.string(),
      feedbackText: z.string().min(5),
      strengths: z.string().optional(),
      improvementAreas: z.string().optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.submitPeerFeedback({
        feedbackId: params.id,
        ...body,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/performance/peer-feedback/pending',
    auth: 'session',
    handler: async ({ auth }) => {
      return service.listMyPeerFeedbackRequests(auth.userId);
    },
  });

  // 15. Development Actions
  registerRoute(router, deps, {
    method: 'get',
    path: '/performance/development/actions',
    auth: { permission: 'development.view' },
    handler: async ({ auth }) => {
      return service.listDevelopmentActions(auth.userId, auth.roles);
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/development/actions',
    auth: { permission: 'development.manage' },
    body: z.object({
      employeeId: z.string(),
      appraisalId: z.string().optional(),
      objective: z.string().min(3),
      actionDescription: z.string().min(5),
      targetDate: z.string(),
      supportRequired: z.string().optional(),
      linkedTrainingProgrammeId: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.recordDevelopmentAction({
        ...body,
        userId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  registerRoute(router, deps, {
    method: 'patch',
    path: '/performance/development/actions/:id/complete',
    auth: { permission: 'development.manage' },
    params: z.object({ id: z.string() }),
    body: z.object({
      evidence: z.string().min(3),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.completeDevelopmentAction({
        actionId: params.id,
        evidence: body.evidence,
        actorUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 16. Performance Improvement Plan (PIP) Initiation
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/pip',
    auth: { permission: 'pip.initiate' },
    body: z.object({
      employeeId: z.string(),
      lineManagerId: z.string(),
      triggerReason: z.enum([
        'FIRST_TIME_RATING_2',
        'CONSECUTIVE_RATING_2',
        'RATING_2_WHILE_ON_PIP',
        'RATING_3_INSUFFICIENT_IMPROVEMENT',
        'CAPABILITY_DEFICIT',
      ]),
      durationMonths: z.number().int().min(1).max(6), // Service enforces max 3 months
      startDate: z.string(),
      endDate: z.string(),
      baselineAssessment: z.string().min(5),
      smartTargets: z.array(
        z.object({
          target: z.string().min(3),
          measurement: z.string().min(3),
          supportRequired: z.string().optional(),
          dueDate: z.string(),
        })
      ).min(1),
      supportAndTrainingNotes: z.string().optional(),
    }),
    successStatus: 201,
    handler: async ({ body, auth, req }) => {
      return service.initiatePip({
        ...body,
        hrLeadId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 17. Acknowledge / Refuse PIP
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/pip/:id/acknowledge',
    auth: { permission: 'pip.view_self' },
    params: z.object({ id: z.string() }),
    body: z.object({
      employeeId: z.string(),
      comments: z.string().optional(),
      refuseToSign: z.boolean().default(false),
      refusalReason: z.string().optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.acknowledgePip({
        pipId: params.id,
        ...body,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 18. Record Monthly PIP Check-In
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/pip/:id/check-ins',
    auth: { permission: 'pip.view_team' },
    params: z.object({ id: z.string() }),
    body: z.object({
      checkInMonth: z.number().int().min(1).max(3),
      scheduledDate: z.string(),
      conductedDate: z.string().optional(),
      managerReviewEvidence: z.string().min(5),
      progressStatus: z.enum(['SATISFACTORY', 'PARTIAL', 'UNSATISFACTORY']),
      employeeComments: z.string().optional(),
      actionAdjustments: z.string().optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.recordPipCheckIn({
        pipId: params.id,
        ...body,
        actorUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 19. Authorize Human PIP Outcome Decision
  registerRoute(router, deps, {
    method: 'post',
    path: '/performance/pip/:id/outcome',
    auth: { permission: 'pip.decide' },
    params: z.object({ id: z.string() }),
    body: z.object({
      outcomeRecommendation: z.enum(['CLEARANCE', 'FURTHER_REVIEW', 'REFERRAL_TO_FAIR_HEARING']),
      outcomeNotes: z.string().min(5),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.decidePipOutcome({
        pipId: params.id,
        ...body,
        deciderUserId: auth.userId,
        auditCtx: auditCtx(auth, req),
      });
    },
  });

  // 20. Performance Scoped Dashboard
  registerRoute(router, deps, {
    method: 'get',
    path: '/performance/dashboard',
    auth: 'session',
    handler: async ({ auth }) => {
      return service.getPerformanceDashboard(auth.userId, auth.roles);
    },
  });

  // 21. Scoped List Helpers for Appraisals & PIPs
  registerRoute(router, deps, {
    method: 'get',
    path: '/performance/appraisals',
    auth: 'session',
    handler: async ({ auth }) => {
      return service.listAppraisals(auth.userId, auth.roles);
    },
  });

  registerRoute(router, deps, {
    method: 'get',
    path: '/performance/pips',
    auth: 'session',
    handler: async ({ auth }) => {
      return service.listPips(auth.userId, auth.roles);
    },
  });

  return router;
}
