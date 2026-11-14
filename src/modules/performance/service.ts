import { PrismaClient } from '@prisma/client';
import { writeAudit, type AuditContext } from '../../core/audit/audit.js';
import { forbidden, validation, conflict, notFound } from '../../core/errors/errors.js';

export interface CreateObjectiveParams {
  title: string;
  kpi: string;
  behavioursAndValues: string;
  expectedDate: string;
  weightPercent?: number;
  supportRequired?: string;
  isRealistic?: boolean;
  supportAgreedDeadline?: string;
}

export interface CreateObjectiveSetParams {
  employeeId: string;
  cycleId?: string;
  title: string;
  objectives: CreateObjectiveParams[];
  userId: string;
  auditCtx: AuditContext;
}

export interface AmendObjectiveSetParams {
  objectiveSetId: string;
  amendmentReason: string;
  updatedObjectives: CreateObjectiveParams[];
  userId: string;
  auditCtx: AuditContext;
}

export interface SubmitSelfAppraisalParams {
  cycleId: string;
  employeeId: string;
  selfAchievements: string;
  selfStrengths: string[]; // min 2
  selfImprovementAreas: string[]; // min 2
  selfChallenges?: string;
  selfSupportRequired?: string;
  objectiveRatings?: Array<{
    objectiveId: string;
    employeeRating: number;
    employeeComments?: string;
  }>;
  userId: string;
  auditCtx: AuditContext;
}

export interface SubmitManagerAppraisalParams {
  appraisalId: string;
  managerAchievementsComments?: string;
  managerStrengths: string[]; // min 2
  managerImprovementAreas: string[]; // min 2
  managerGeneralComments?: string;
  managerRatingCode: number; // 1..6
  objectiveRatings?: Array<{
    objectiveId: string;
    managerRating: number;
    managerComments?: string;
    achievementStatus?: string;
  }>;
  managerId: string;
  auditCtx: AuditContext;
}

export interface InitiatePipParams {
  employeeId: string;
  lineManagerId: string;
  triggerReason: 'FIRST_TIME_RATING_2' | 'CONSECUTIVE_RATING_2' | 'RATING_2_WHILE_ON_PIP' | 'RATING_3_INSUFFICIENT_IMPROVEMENT' | 'CAPABILITY_DEFICIT';
  durationMonths: number; // 1 to 3 months approved limit
  startDate: string;
  endDate: string;
  baselineAssessment: string;
  smartTargets: Array<{
    target: string;
    measurement: string;
    supportRequired?: string;
    dueDate: string;
  }>;
  supportAndTrainingNotes?: string;
  hrLeadId: string;
  auditCtx: AuditContext;
}

export interface RecordPipCheckInParams {
  pipId: string;
  checkInMonth: number;
  scheduledDate: string;
  conductedDate?: string;
  managerReviewEvidence: string;
  progressStatus: 'SATISFACTORY' | 'PARTIAL' | 'UNSATISFACTORY';
  employeeComments?: string;
  actionAdjustments?: string;
  actorUserId: string;
  auditCtx: AuditContext;
}

export class PerformanceService {
  constructor(private prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // 1. Objective Setting & Versioning
  // ---------------------------------------------------------------------------

  async createObjectiveSet(params: CreateObjectiveSetParams) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: params.employeeId },
      include: { manager: true },
    });

    // Check Cycle Guidelines if cycleId provided
    let guidelineExceeded = false;
    let maxGuideline = 6;
    if (params.cycleId) {
      const cycle = await this.prisma.performanceCycle.findUnique({
        where: { id: params.cycleId },
      });
      if (cycle) {
        maxGuideline = cycle.maxObjectivesGuideline;
        if (params.objectives.length > maxGuideline) {
          guidelineExceeded = true;
        }
      }
    } else if (params.objectives.length > 6) {
      guidelineExceeded = true;
    }

    // Weight Validation: if any objective has weight, all must have weight and sum to 100%
    const hasWeights = params.objectives.some((o) => o.weightPercent !== undefined && o.weightPercent !== null);
    if (hasWeights) {
      const totalWeight = params.objectives.reduce((sum, o) => sum + (o.weightPercent || 0), 0);
      if (Math.abs(totalWeight - 100.0) > 0.01) {
        throw validation(`Total objective weights must sum to exactly 100% (currently ${totalWeight.toFixed(1)}%)`);
      }
    }

    // Realistic check: if isRealistic === false, supportRequired and deadline required
    for (const obj of params.objectives) {
      if (obj.isRealistic === false && (!obj.supportRequired || !obj.supportAgreedDeadline)) {
        throw validation(`Objective "${obj.title}" marked as unrealistic requires documented support and agreed support deadline.`);
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      const set = await tx.performanceObjectiveSet.create({
        data: {
          employeeId: employee.id,
          cycleId: params.cycleId,
          title: params.title,
          version: 1,
          status: 'DRAFT',
          isImmutable: false,
          createdById: params.userId,
          objectives: {
            create: params.objectives.map((o, idx) => ({
              title: o.title,
              kpi: o.kpi,
              behavioursAndValues: o.behavioursAndValues,
              expectedDate: new Date(o.expectedDate),
              weightPercent: o.weightPercent,
              supportRequired: o.supportRequired,
              isRealistic: o.isRealistic ?? true,
              supportAgreedDeadline: o.supportAgreedDeadline ? new Date(o.supportAgreedDeadline) : null,
              orderIndex: idx,
            })),
          },
        },
        include: { objectives: true },
      });

      await writeAudit(tx, params.auditCtx, {
        action: 'PERFORMANCE_OBJECTIVES_CREATED',
        targetType: 'PerformanceObjectiveSet',
        targetId: set.id,
        outcome: 'SUCCESS',
        after: {
          employeeId: employee.id,
          count: set.objectives.length,
          guidelineExceeded,
          version: 1,
        },
      });

      return {
        ...set,
        guidelineWarning: guidelineExceeded,
        warningMessage: guidelineExceeded
          ? `Objective count (${set.objectives.length}) exceeds the recommended guideline of ${maxGuideline}. Please review.`
          : null,
      };
    });
  }

  async submitObjectiveSet(id: string, userId: string, auditCtx: AuditContext) {
    const set = await this.prisma.performanceObjectiveSet.findUniqueOrThrow({
      where: { id },
      include: { employee: true },
    });

    if (set.status !== 'DRAFT') {
      throw validation(`Objective set cannot be submitted from status: ${set.status}`);
    }

    const updated = await this.prisma.performanceObjectiveSet.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        employeeSignOffAt: new Date(),
      },
      include: { objectives: true },
    });

    await writeAudit(this.prisma, auditCtx, {
      action: 'PERFORMANCE_OBJECTIVES_SUBMITTED',
      targetType: 'PerformanceObjectiveSet',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: { status: updated.status, version: updated.version },
    });

    return updated;
  }

  async approveObjectiveSet(id: string, reviewerId: string, role: string, auditCtx: AuditContext) {
    const set = await this.prisma.performanceObjectiveSet.findUniqueOrThrow({
      where: { id },
      include: { employee: true },
    });

    // Maker-Checker: Employee cannot approve their own objectives
    if (set.employee.userId === reviewerId || set.createdById === reviewerId) {
      throw forbidden('Maker-Checker Violation: Employee cannot approve their own performance objectives.');
    }

    const updateData: any = {
      status: 'APPROVED',
      isImmutable: true,
    };

    if (role === 'line_manager' || role === 'operations_director') {
      updateData.managerSignOffAt = new Date();
    }
    if (role === 'head_of_hr') {
      updateData.hrSignOffAt = new Date();
    }
    if (role === 'managing_partner') {
      updateData.partnerSignOffAt = new Date();
    }

    const updated = await this.prisma.performanceObjectiveSet.update({
      where: { id },
      data: updateData,
      include: { objectives: true },
    });

    await writeAudit(this.prisma, auditCtx, {
      action: 'PERFORMANCE_OBJECTIVES_APPROVED',
      targetType: 'PerformanceObjectiveSet',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: { status: updated.status, isImmutable: true, approvedByRole: role },
    });

    return updated;
  }

  async amendObjectiveSet(params: AmendObjectiveSetParams) {
    const priorSet = await this.prisma.performanceObjectiveSet.findUniqueOrThrow({
      where: { id: params.objectiveSetId },
      include: { objectives: true, employee: true },
    });

    if (!params.amendmentReason || params.amendmentReason.trim().length < 5) {
      throw validation('An explicit, documented amendment reason is required when modifying agreed objectives.');
    }

    // Weight validation on amended objectives
    const hasWeights = params.updatedObjectives.some((o) => o.weightPercent !== undefined && o.weightPercent !== null);
    if (hasWeights) {
      const totalWeight = params.updatedObjectives.reduce((sum, o) => sum + (o.weightPercent || 0), 0);
      if (Math.abs(totalWeight - 100.0) > 0.01) {
        throw validation(`Total objective weights must sum to exactly 100% (currently ${totalWeight.toFixed(1)}%)`);
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Mark prior set as SUPERSEDED (never overwrite historical agreed objectives!)
      await tx.performanceObjectiveSet.update({
        where: { id: priorSet.id },
        data: { status: 'SUPERSEDED' },
      });

      // 2. Create new version
      const newVersion = priorSet.version + 1;
      const amendedSet = await tx.performanceObjectiveSet.create({
        data: {
          employeeId: priorSet.employeeId,
          cycleId: priorSet.cycleId,
          title: priorSet.title,
          version: newVersion,
          status: 'APPROVED', // Amended by authority
          amendmentReason: params.amendmentReason,
          isImmutable: true,
          managerSignOffAt: new Date(),
          createdById: params.userId,
          objectives: {
            create: params.updatedObjectives.map((o, idx) => ({
              title: o.title,
              kpi: o.kpi,
              behavioursAndValues: o.behavioursAndValues,
              expectedDate: new Date(o.expectedDate),
              weightPercent: o.weightPercent,
              supportRequired: o.supportRequired,
              isRealistic: o.isRealistic ?? true,
              supportAgreedDeadline: o.supportAgreedDeadline ? new Date(o.supportAgreedDeadline) : null,
              orderIndex: idx,
            })),
          },
        },
        include: { objectives: true },
      });

      await writeAudit(tx, params.auditCtx, {
        action: 'PERFORMANCE_OBJECTIVES_AMENDED',
        targetType: 'PerformanceObjectiveSet',
        targetId: amendedSet.id,
        outcome: 'SUCCESS',
        after: {
          priorSetId: priorSet.id,
          priorVersion: priorSet.version,
          newVersion: amendedSet.version,
          amendmentReason: params.amendmentReason,
        },
      });

      return amendedSet;
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Performance Cycle Administration & Snapshotting
  // ---------------------------------------------------------------------------

  async createPerformanceCycle(params: {
    title: string;
    cycleType: 'ANNUAL' | 'QUARTERLY';
    periodStart: string;
    periodEnd: string;
    selfAppraisalDeadline: string;
    managerReviewDeadline: string;
    moderationDeadline?: string;
    maxObjectivesGuideline?: number;
    allowPeerFeedback?: boolean;
    peerFeedbackPrivacyModel?: string;
    distributionGuidance?: Record<number, number>;
    isDistributionMandatory?: boolean;
    createdById: string;
    auditCtx: AuditContext;
  }) {
    const guidanceObj = params.distributionGuidance || { 2: 5, 3: 10, 4: 70, 5: 10, 6: 5 };
    const snapshotObj = {
      title: params.title,
      cycleType: params.cycleType,
      maxObjectivesGuideline: params.maxObjectivesGuideline || 6,
      distributionGuidance: guidanceObj,
      isDistributionMandatory: params.isDistributionMandatory ?? false,
      annualFormulaStatus: 'PENDING_APPROVAL', // Mandatory guardrail: formula unapproved
      privacyModel: params.peerFeedbackPrivacyModel || 'HR_RESTRICTED',
      createdAt: new Date().toISOString(),
    };

    const cycle = await this.prisma.performanceCycle.create({
      data: {
        title: params.title,
        cycleType: params.cycleType,
        periodStart: new Date(params.periodStart),
        periodEnd: new Date(params.periodEnd),
        selfAppraisalDeadline: new Date(params.selfAppraisalDeadline),
        managerReviewDeadline: new Date(params.managerReviewDeadline),
        moderationDeadline: params.moderationDeadline ? new Date(params.moderationDeadline) : null,
        maxObjectivesGuideline: params.maxObjectivesGuideline || 6,
        allowPeerFeedback: params.allowPeerFeedback ?? false,
        peerFeedbackPrivacyModel: params.peerFeedbackPrivacyModel || 'HR_RESTRICTED',
        distributionGuidance: JSON.stringify(guidanceObj),
        isDistributionMandatory: params.isDistributionMandatory ?? false,
        annualFormulaStatus: 'PENDING_APPROVAL',
        configurationSnapshot: JSON.stringify(snapshotObj),
        status: 'ACTIVE',
        createdById: params.createdById,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'PERFORMANCE_CYCLE_CREATED',
      targetType: 'PerformanceCycle',
      targetId: cycle.id,
      outcome: 'SUCCESS',
      after: { title: cycle.title, cycleType: cycle.cycleType, status: cycle.status },
    });

    return cycle;
  }

  // ---------------------------------------------------------------------------
  // 3. Self-Appraisal & Manager Appraisal Lifecycle
  // ---------------------------------------------------------------------------

  async submitSelfAppraisal(params: SubmitSelfAppraisalParams) {
    const cycle = await this.prisma.performanceCycle.findUniqueOrThrow({
      where: { id: params.cycleId },
    });

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: params.employeeId },
      include: { manager: true },
    });

    if (!employee.managerId) {
      throw validation('Employee must have an assigned reporting manager to undergo appraisal review.');
    }

    // Source Form Requirement: at least two strengths and two improvement areas
    if (!params.selfStrengths || params.selfStrengths.length < 2) {
      throw validation('Self-appraisal requires at least two documented key strengths per BRS appraisal form.');
    }
    if (!params.selfImprovementAreas || params.selfImprovementAreas.length < 2) {
      throw validation('Self-appraisal requires at least two documented improvement areas per BRS appraisal form.');
    }

    return await this.prisma.$transaction(async (tx) => {
      let appraisal = await tx.performanceAppraisal.findFirst({
        where: { cycleId: cycle.id, employeeId: employee.id },
      });

      if (!appraisal) {
        appraisal = await tx.performanceAppraisal.create({
          data: {
            cycleId: cycle.id,
            employeeId: employee.id,
            managerId: employee.managerId!,
            selfAchievements: params.selfAchievements,
            selfStrengths: JSON.stringify(params.selfStrengths),
            selfImprovementAreas: JSON.stringify(params.selfImprovementAreas),
            selfChallenges: params.selfChallenges,
            selfSupportRequired: params.selfSupportRequired,
            selfSubmittedAt: new Date(),
            status: 'SUBMITTED_SELF',
          },
        });
      } else {
        appraisal = await tx.performanceAppraisal.update({
          where: { id: appraisal.id },
          data: {
            selfAchievements: params.selfAchievements,
            selfStrengths: JSON.stringify(params.selfStrengths),
            selfImprovementAreas: JSON.stringify(params.selfImprovementAreas),
            selfChallenges: params.selfChallenges,
            selfSupportRequired: params.selfSupportRequired,
            selfSubmittedAt: new Date(),
            status: 'SUBMITTED_SELF',
          },
        });
      }

      if (params.objectiveRatings && params.objectiveRatings.length > 0) {
        for (const objRating of params.objectiveRatings) {
          await tx.appraisalObjectiveScore.upsert({
            where: {
              appraisalId_objectiveId: {
                appraisalId: appraisal.id,
                objectiveId: objRating.objectiveId,
              },
            },
            create: {
              appraisalId: appraisal.id,
              objectiveId: objRating.objectiveId,
              employeeRating: objRating.employeeRating,
              employeeComments: objRating.employeeComments,
            },
            update: {
              employeeRating: objRating.employeeRating,
              employeeComments: objRating.employeeComments,
            },
          });
        }
      }

      await writeAudit(tx, params.auditCtx, {
        action: 'PERFORMANCE_SELF_APPRAISAL_SUBMITTED',
        targetType: 'PerformanceAppraisal',
        targetId: appraisal.id,
        outcome: 'SUCCESS',
        after: { employeeId: employee.id, status: appraisal.status },
      });

      return {
        ...appraisal,
        selfStrengths: typeof appraisal.selfStrengths === 'string' ? JSON.parse(appraisal.selfStrengths) : appraisal.selfStrengths,
        selfImprovementAreas: typeof appraisal.selfImprovementAreas === 'string' ? JSON.parse(appraisal.selfImprovementAreas) : appraisal.selfImprovementAreas,
      };
    });
  }

  async submitManagerAppraisal(params: SubmitManagerAppraisalParams) {
    const appraisal = await this.prisma.performanceAppraisal.findUniqueOrThrow({
      where: { id: params.appraisalId },
      include: { employee: true, cycle: true },
    });

    // Maker-Checker: Employee cannot perform manager appraisal on themselves!
    if (appraisal.employee.userId === params.managerId) {
      throw forbidden('Maker-Checker Violation: An employee cannot conduct manager appraisal on themselves.');
    }

    // Source Form Requirement: at least two strengths and two improvement areas
    if (!params.managerStrengths || params.managerStrengths.length < 2) {
      throw validation('Manager appraisal requires at least two documented key strengths per BRS appraisal form.');
    }
    if (!params.managerImprovementAreas || params.managerImprovementAreas.length < 2) {
      throw validation('Manager appraisal requires at least two documented areas for improvement per BRS appraisal form.');
    }

    // Rating Scale Validation: Code must be 1..6
    const ratingScale = await this.prisma.performanceRatingScale.findUnique({
      where: { code: params.managerRatingCode },
    });
    if (!ratingScale) {
      throw validation(`Invalid rating code ${params.managerRatingCode}. Must be between 1 and 6.`);
    }

    return await this.prisma.$transaction(async (tx) => {
      const updated = await tx.performanceAppraisal.update({
        where: { id: appraisal.id },
        data: {
          managerAchievementsComments: params.managerAchievementsComments,
          managerStrengths: JSON.stringify(params.managerStrengths),
          managerImprovementAreas: JSON.stringify(params.managerImprovementAreas),
          managerGeneralComments: params.managerGeneralComments,
          managerRatingCode: ratingScale.code,
          managerRatingLabel: ratingScale.label,
          managerSubmittedAt: new Date(),
          status: 'SUBMITTED_MANAGER',
        },
      });

      if (params.objectiveRatings && params.objectiveRatings.length > 0) {
        for (const objRating of params.objectiveRatings) {
          await tx.appraisalObjectiveScore.upsert({
            where: {
              appraisalId_objectiveId: {
                appraisalId: appraisal.id,
                objectiveId: objRating.objectiveId,
              },
            },
            create: {
              appraisalId: appraisal.id,
              objectiveId: objRating.objectiveId,
              managerRating: objRating.managerRating,
              managerComments: objRating.managerComments,
              achievementStatus: objRating.achievementStatus,
            },
            update: {
              managerRating: objRating.managerRating,
              managerComments: objRating.managerComments,
              achievementStatus: objRating.achievementStatus,
            },
          });
        }
      }

      await writeAudit(tx, params.auditCtx, {
        action: 'PERFORMANCE_MANAGER_APPRAISAL_SUBMITTED',
        targetType: 'PerformanceAppraisal',
        targetId: updated.id,
        outcome: 'SUCCESS',
        after: {
          employeeId: appraisal.employeeId,
          managerRatingCode: ratingScale.code,
          ratingLabel: ratingScale.label,
          status: updated.status,
        },
      });

      return {
        ...updated,
        managerStrengths: updated.managerStrengths && typeof updated.managerStrengths === 'string' ? JSON.parse(updated.managerStrengths) : updated.managerStrengths,
        managerImprovementAreas: updated.managerImprovementAreas && typeof updated.managerImprovementAreas === 'string' ? JSON.parse(updated.managerImprovementAreas) : updated.managerImprovementAreas,
      };
    });
  }

  async recordReviewMeeting(params: {
    appraisalId: string;
    meetingDate: string;
    meetingNotes: string;
    developmentAgreement: string;
    actorUserId: string;
    auditCtx: AuditContext;
  }) {
    const appraisal = await this.prisma.performanceAppraisal.findUniqueOrThrow({
      where: { id: params.appraisalId },
    });

    const updated = await this.prisma.performanceAppraisal.update({
      where: { id: appraisal.id },
      data: {
        reviewMeetingDate: new Date(params.meetingDate),
        reviewMeetingNotes: params.meetingNotes,
        developmentAgreement: params.developmentAgreement,
        status: 'MEETING_COMPLETED',
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'PERFORMANCE_REVIEW_MEETING_RECORDED',
      targetType: 'PerformanceAppraisal',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: { meetingDate: params.meetingDate, status: updated.status },
    });

    return updated;
  }

  async moderateAppraisal(params: {
    appraisalId: string;
    moderatedRatingCode: number;
    moderationNotes: string;
    moderatorUserId: string;
    auditCtx: AuditContext;
  }) {
    const appraisal = await this.prisma.performanceAppraisal.findUniqueOrThrow({
      where: { id: params.appraisalId },
      include: { cycle: true },
    });

    const ratingScale = await this.prisma.performanceRatingScale.findUniqueOrThrow({
      where: { code: params.moderatedRatingCode },
    });

    const updated = await this.prisma.performanceAppraisal.update({
      where: { id: appraisal.id },
      data: {
        moderatedRatingCode: ratingScale.code,
        moderationNotes: params.moderationNotes,
        moderatedById: params.moderatorUserId,
        moderatedAt: new Date(),
        status: 'HR_MODERATED',
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'PERFORMANCE_APPRAISAL_MODERATED',
      targetType: 'PerformanceAppraisal',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: { moderatedRatingCode: ratingScale.code, status: updated.status },
    });

    return updated;
  }

  async approveAppraisal(params: {
    appraisalId: string;
    approverUserId: string;
    auditCtx: AuditContext;
  }) {
    const appraisal = await this.prisma.performanceAppraisal.findUniqueOrThrow({
      where: { id: params.appraisalId },
      include: { cycle: true },
    });

    const finalRatingCode = appraisal.moderatedRatingCode || appraisal.managerRatingCode;
    const ratingScale = finalRatingCode
      ? await this.prisma.performanceRatingScale.findUnique({ where: { code: finalRatingCode } })
      : null;

    // Snapshot exact configuration at completion
    const configSnapshot = JSON.stringify({
      cycleTitle: appraisal.cycle.title,
      finalRatingCode,
      ratingLabel: ratingScale?.label,
      isNumeric: ratingScale?.isNumericScore,
      annualFormulaStatus: appraisal.cycle.annualFormulaStatus,
      completedAt: new Date().toISOString(),
    });

    const updated = await this.prisma.performanceAppraisal.update({
      where: { id: appraisal.id },
      data: {
        partnerApprovedById: params.approverUserId,
        partnerApprovedAt: new Date(),
        ratingConfigurationSnapshot: configSnapshot,
        status: 'PARTNER_APPROVED',
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'PERFORMANCE_APPRAISAL_APPROVED',
      targetType: 'PerformanceAppraisal',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: { status: updated.status, finalRatingCode },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // 4. Rating Aggregation & Unapproved Annual Formula Guardrail
  // ---------------------------------------------------------------------------

  async calculateCycleMetrics(cycleId: string) {
    const cycle = await this.prisma.performanceCycle.findUniqueOrThrow({
      where: { id: cycleId },
      include: { appraisals: true },
    });

    const totalAppraisals = cycle.appraisals.length;
    const completedAppraisals = cycle.appraisals.filter(
      (a) => a.status === 'PARTNER_APPROVED' || a.status === 'HR_MODERATED' || a.status === 'MEETING_COMPLETED'
    );

    // Filter rating counts
    const countsByRating: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const numericRatings: number[] = [];

    for (const app of completedAppraisals) {
      const code = app.moderatedRatingCode || app.managerRatingCode;
      if (code && countsByRating[code] !== undefined) {
        countsByRating[code]++;
        // CRITICAL INVARIANT: Rating 1 ("Too Early to Assess") is NOT a numeric score and MUST be excluded from averages!
        if (code >= 2 && code <= 6) {
          numericRatings.push(code);
        }
      }
    }

    const averageNumericScore =
      numericRatings.length > 0
        ? Math.round((numericRatings.reduce((a, b) => a + b, 0) / numericRatings.length) * 100) / 100
        : null;

    // Distribution Guidance comparison
    const guidanceObj = JSON.parse(cycle.distributionGuidance || '{}');
    const actualDistributionPercentages: Record<number, number> = {};
    const totalRated = completedAppraisals.length;

    for (let i = 1; i <= 6; i++) {
      actualDistributionPercentages[i] = totalRated > 0 ? Math.round((countsByRating[i] / totalRated) * 100) : 0;
    }

    // MANDATORY POLICY RULE (Decision Register D-21 Guardrail):
    // If formula status is not APPROVED, return null for composite score and keep status as PENDING_APPROVAL / PROPOSED.
    // If APPROVED by executive partner via Maker-Checker, calculate annualCompositeScore according to the active formula.
    let annualCompositeScore: number | null = null;
    let annualCompositeRatingCode: number | null = null;
    let annualCompositeRatingLabel: string | null = null;

    if (cycle.annualFormulaStatus === 'APPROVED' && numericRatings.length > 0) {
      const rounding = cycle.roundingMethod || 'NEAREST_HALF';
      let rawScore = averageNumericScore || 0;

      if (cycle.annualFormulaModel === 'QUARTERLY_WEIGHTED' && cycle.annualFormulaWeights) {
        try {
          const weights = JSON.parse(cycle.annualFormulaWeights);
          const weightValues = Object.values(weights).map(Number);
          const activeWeights = weightValues.slice(0, numericRatings.length);
          const totalActiveW = activeWeights.reduce((a, b) => a + b, 0);
          if (totalActiveW > 0) {
            rawScore = numericRatings.reduce((sum, r, idx) => {
              const w = activeWeights[idx] || (totalActiveW / numericRatings.length);
              return sum + (r * w) / totalActiveW;
            }, 0);
          }
        } catch {
          rawScore = averageNumericScore || 0;
        }
      }

      annualCompositeScore = this.applyRounding(rawScore, rounding);
      const ratingInfo = this.mapScoreToRating(annualCompositeScore);
      annualCompositeRatingCode = ratingInfo.code;
      annualCompositeRatingLabel = ratingInfo.label;
    }

    return {
      cycleId: cycle.id,
      cycleTitle: cycle.title,
      totalAppraisals,
      completedCount: completedAppraisals.length,
      ratingCounts: countsByRating,
      rating1ExcludedCount: countsByRating[1],
      averageNumericScore, // Strictly based on 2..6! Rating 1 excluded!
      actualDistributionPercentages,
      guidanceDistributionPercentages: guidanceObj,
      isDistributionMandatory: cycle.isDistributionMandatory, // Guidance only, never quota
      annualFormulaStatus: cycle.annualFormulaStatus, // "PENDING_APPROVAL", "PROPOSED", or "APPROVED"
      annualFormulaModel: cycle.annualFormulaModel || null,
      annualFormulaWeights: cycle.annualFormulaWeights ? JSON.parse(cycle.annualFormulaWeights) : null,
      roundingMethod: cycle.roundingMethod || 'NEAREST_HALF',
      annualCompositeScore, // null if PENDING_APPROVAL/PROPOSED; numeric score if APPROVED
      annualCompositeRatingCode,
      annualCompositeRatingLabel,
      notice:
        cycle.annualFormulaStatus === 'APPROVED'
          ? `Annual composite score calculated using approved ${cycle.annualFormulaModel} formula with ${cycle.roundingMethod} rounding.`
          : 'Rating 1 is non-numeric and excluded from averages. Annual composite formula is pending executive approval.',
    };
  }

  // Helper rounding method
  private applyRounding(score: number, method: string): number {
    switch (method) {
      case 'NEAREST_HALF':
        return Math.round(score * 2) / 2;
      case 'NEAREST_INTEGER':
        return Math.round(score);
      case 'FLOOR':
        return Math.floor(score * 10) / 10;
      case 'CEIL':
        return Math.ceil(score * 10) / 10;
      case 'TWO_DECIMALS':
      default:
        return Math.round(score * 100) / 100;
    }
  }

  // Helper score to rating mapper
  private mapScoreToRating(score: number): { code: number; label: string } {
    if (score < 1.5) return { code: 1, label: 'Too Early to Assess' };
    if (score < 2.5) return { code: 2, label: 'Unsatisfactory / Needs Significant Improvement' };
    if (score < 3.5) return { code: 3, label: 'Developing / Partially Meets Expectations' };
    if (score < 4.5) return { code: 4, label: 'Good / Fully Meets Expectations' };
    if (score < 5.5) return { code: 5, label: 'Very Good / Exceeds Expectations' };
    return { code: 6, label: 'Outstanding / Far Exceeds Expectations' };
  }

  // ---------------------------------------------------------------------------
  // 4b. Configurable Annual Composite Formula Engine (Decision Register D-21)
  // ---------------------------------------------------------------------------

  async proposeAnnualFormula(params: {
    cycleId: string;
    model: 'SIMPLE_AVERAGE' | 'QUARTERLY_WEIGHTED' | 'ANNUAL_ONLY' | 'HYBRID_SPLIT';
    weights?: Record<string, number>;
    roundingMethod?: 'TWO_DECIMALS' | 'NEAREST_HALF' | 'NEAREST_INTEGER' | 'FLOOR' | 'CEIL';
    minCyclesRequired?: number;
    proposerUserId: string;
    auditCtx: AuditContext;
  }) {
    const cycle = await this.prisma.performanceCycle.findUniqueOrThrow({
      where: { id: params.cycleId },
    });

    const allowedModels = ['SIMPLE_AVERAGE', 'QUARTERLY_WEIGHTED', 'ANNUAL_ONLY', 'HYBRID_SPLIT'];
    if (!allowedModels.includes(params.model)) {
      throw validation(`Invalid formula model: ${params.model}. Must be one of: ${allowedModels.join(', ')}`);
    }

    // Weight validation
    if (params.model === 'QUARTERLY_WEIGHTED') {
      if (!params.weights || Object.keys(params.weights).length === 0) {
        throw validation('QUARTERLY_WEIGHTED model requires weight percentages for each quarter (e.g. Q1..Q4).');
      }
      const sum = Object.values(params.weights).reduce((a, b) => a + Number(b), 0);
      if (Math.abs(sum - 100) > 0.01) {
        throw validation(`Quarterly formula weights must sum to exactly 100% (currently ${sum.toFixed(1)}%).`);
      }
    }

    if (params.model === 'HYBRID_SPLIT') {
      if (!params.weights || (!params.weights.quarterlyWeight && !params.weights.annualWeight)) {
        throw validation('HYBRID_SPLIT model requires quarterlyWeight and annualWeight summing to 100%.');
      }
      const qW = Number(params.weights.quarterlyWeight || 0);
      const aW = Number(params.weights.annualWeight || 0);
      if (Math.abs(qW + aW - 100) > 0.01) {
        throw validation(`Hybrid split weights must sum to exactly 100% (quarterly: ${qW}%, annual: ${aW}%).`);
      }
    }

    const updated = await this.prisma.performanceCycle.update({
      where: { id: cycle.id },
      data: {
        annualFormulaStatus: 'PROPOSED',
        annualFormulaModel: params.model,
        annualFormulaWeights: params.weights ? JSON.stringify(params.weights) : null,
        roundingMethod: params.roundingMethod || 'NEAREST_HALF',
        minCyclesRequired: params.minCyclesRequired || 1,
        formulaProposedById: params.proposerUserId,
        formulaProposedAt: new Date(),
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'PERFORMANCE_ANNUAL_FORMULA_PROPOSED',
      targetType: 'PerformanceCycle',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: {
        model: updated.annualFormulaModel,
        weights: params.weights,
        roundingMethod: updated.roundingMethod,
        status: updated.annualFormulaStatus,
      },
    });

    return {
      cycleId: updated.id,
      cycleTitle: updated.title,
      annualFormulaStatus: updated.annualFormulaStatus,
      annualFormulaModel: updated.annualFormulaModel,
      annualFormulaWeights: params.weights || null,
      roundingMethod: updated.roundingMethod,
      minCyclesRequired: updated.minCyclesRequired,
      formulaProposedById: updated.formulaProposedById,
      formulaProposedAt: updated.formulaProposedAt,
      notice: 'Annual composite formula proposal recorded. Awaiting Managing Partner Maker-Checker approval to activate.',
    };
  }

  async approveAnnualFormula(params: {
    cycleId: string;
    approverUserId: string;
    approverRole: string;
    auditCtx: AuditContext;
  }) {
    const cycle = await this.prisma.performanceCycle.findUniqueOrThrow({
      where: { id: params.cycleId },
    });

    if (cycle.annualFormulaStatus !== 'PROPOSED') {
      throw validation('No pending annual formula proposal found to approve for this cycle.');
    }

    // Maker-Checker Invariant: Proposer CANNOT approve their own formula proposal!
    if (cycle.formulaProposedById === params.approverUserId) {
      throw forbidden('Maker-Checker Violation: Author of the annual formula proposal cannot approve it.');
    }

    // Authority Check: Managing Partner or Operations Director only
    if (params.approverRole !== 'managing_partner' && params.approverRole !== 'operations_director') {
      throw forbidden('Access denied: Managing Partner or Operations Director approval required to activate annual composite formula.');
    }

    // Frozen snapshot update
    const currentSnapshot = JSON.parse(cycle.configurationSnapshot || '{}');
    const updatedSnapshot = {
      ...currentSnapshot,
      activatedFormula: {
        model: cycle.annualFormulaModel,
        weights: cycle.annualFormulaWeights ? JSON.parse(cycle.annualFormulaWeights) : null,
        roundingMethod: cycle.roundingMethod,
        minCyclesRequired: cycle.minCyclesRequired,
        approvedById: params.approverUserId,
        approvedAt: new Date().toISOString(),
      },
    };

    const updated = await this.prisma.performanceCycle.update({
      where: { id: cycle.id },
      data: {
        annualFormulaStatus: 'APPROVED',
        formulaApprovedById: params.approverUserId,
        formulaApprovedAt: new Date(),
        configurationSnapshot: JSON.stringify(updatedSnapshot),
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'PERFORMANCE_ANNUAL_FORMULA_APPROVED',
      targetType: 'PerformanceCycle',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: {
        model: updated.annualFormulaModel,
        weights: updated.annualFormulaWeights,
        status: updated.annualFormulaStatus,
        approvedById: updated.formulaApprovedById,
      },
    });

    return {
      cycleId: updated.id,
      cycleTitle: updated.title,
      annualFormulaStatus: updated.annualFormulaStatus,
      annualFormulaModel: updated.annualFormulaModel,
      annualFormulaWeights: updated.annualFormulaWeights ? JSON.parse(updated.annualFormulaWeights) : null,
      roundingMethod: updated.roundingMethod,
      formulaApprovedById: updated.formulaApprovedById,
      formulaApprovedAt: updated.formulaApprovedAt,
      notice: `Annual composite formula [${updated.annualFormulaModel}] successfully activated. Calculations are now live.`,
    };
  }

  async simulateAnnualFormulas(params: {
    cycleId: string;
    sampleScores?: number[];
    customWeights?: Record<string, number>;
    roundingMethod?: string;
  }) {
    const cycle = await this.prisma.performanceCycle.findUniqueOrThrow({
      where: { id: params.cycleId },
      include: { appraisals: true },
    });

    const rounding = params.roundingMethod || cycle.roundingMethod || 'NEAREST_HALF';

    // Collect base scores: use provided sample scores or completed appraisals
    let baseScores: number[] = [];
    if (params.sampleScores && params.sampleScores.length > 0) {
      baseScores = params.sampleScores.filter((s) => s >= 2 && s <= 6); // Exclude Rating 1
    } else {
      const completed = cycle.appraisals.filter(
        (a) => a.status === 'PARTNER_APPROVED' || a.status === 'HR_MODERATED' || a.status === 'MEETING_COMPLETED'
      );
      for (const app of completed) {
        const c = app.moderatedRatingCode || app.managerRatingCode;
        if (c && c >= 2 && c <= 6) baseScores.push(c);
      }
    }

    if (baseScores.length === 0) {
      baseScores = [3, 4, 4, 5]; // Baseline simulation default if no ratings yet
    }

    // 1. SIMPLE_AVERAGE
    const simpleRaw = baseScores.reduce((a, b) => a + b, 0) / baseScores.length;
    const simpleScore = this.applyRounding(simpleRaw, rounding);

    // 2. QUARTERLY_WEIGHTED (Default 15/20/25/40 or custom)
    const qWeights = params.customWeights || { Q1: 15, Q2: 20, Q3: 25, Q4: 40 };
    const wValues = Object.values(qWeights).map(Number);
    const sumW = wValues.reduce((a, b) => a + b, 0);
    const qWeightedRaw =
      baseScores.reduce((sum, s, idx) => {
        const w = wValues[idx % wValues.length] || (100 / baseScores.length);
        return sum + (s * w) / sumW;
      }, 0);
    const qWeightedScore = this.applyRounding(qWeightedRaw, rounding);

    // 3. ANNUAL_ONLY (100% on the final assessment)
    const annualOnlyRaw = baseScores[baseScores.length - 1];
    const annualOnlyScore = this.applyRounding(annualOnlyRaw, rounding);

    // 4. HYBRID_SPLIT (40% continuous + 60% year-end)
    const hybridRaw = simpleRaw * 0.4 + annualOnlyRaw * 0.6;
    const hybridScore = this.applyRounding(hybridRaw, rounding);

    return {
      cycleId: cycle.id,
      cycleTitle: cycle.title,
      sampleScoresUsed: baseScores,
      rating1Excluded: true,
      roundingMethod: rounding,
      modelsCompared: [
        {
          model: 'SIMPLE_AVERAGE',
          description: 'Arithmetic mean across all completed cycles (equal weight per quarter).',
          rawScore: Math.round(simpleRaw * 100) / 100,
          compositeScore: simpleScore,
          resultingRating: this.mapScoreToRating(simpleScore),
        },
        {
          model: 'QUARTERLY_WEIGHTED',
          description: 'Progressive weighting emphasizing later performance (e.g. Q1: 15%, Q2: 20%, Q3: 25%, Q4: 40%).',
          weights: qWeights,
          rawScore: Math.round(qWeightedRaw * 100) / 100,
          compositeScore: qWeightedScore,
          resultingRating: this.mapScoreToRating(qWeightedScore),
        },
        {
          model: 'ANNUAL_ONLY',
          description: '100% weighting on year-end review; quarterly reviews serve as coaching checkpoints.',
          rawScore: annualOnlyRaw,
          compositeScore: annualOnlyScore,
          resultingRating: this.mapScoreToRating(annualOnlyScore),
        },
        {
          model: 'HYBRID_SPLIT',
          description: 'Balanced split: 40% cumulative quarterly performance + 60% year-end comprehensive appraisal.',
          split: { quarterlyWeight: 40, annualWeight: 60 },
          rawScore: Math.round(hybridRaw * 100) / 100,
          compositeScore: hybridScore,
          resultingRating: this.mapScoreToRating(hybridScore),
        },
      ],
      currentActiveStatus: cycle.annualFormulaStatus,
    };
  }

  async getAnnualFormulaConfig(cycleId: string) {
    const cycle = await this.prisma.performanceCycle.findUniqueOrThrow({
      where: { id: cycleId },
    });

    return {
      cycleId: cycle.id,
      cycleTitle: cycle.title,
      annualFormulaStatus: cycle.annualFormulaStatus,
      annualFormulaModel: cycle.annualFormulaModel,
      annualFormulaWeights: cycle.annualFormulaWeights ? JSON.parse(cycle.annualFormulaWeights) : null,
      roundingMethod: cycle.roundingMethod,
      minCyclesRequired: cycle.minCyclesRequired,
      formulaProposedById: cycle.formulaProposedById,
      formulaProposedAt: cycle.formulaProposedAt,
      formulaApprovedById: cycle.formulaApprovedById,
      formulaApprovedAt: cycle.formulaApprovedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Peer Feedback & Privacy Protection
  // ---------------------------------------------------------------------------

  async requestPeerFeedback(params: {
    appraisalId: string;
    requesterId: string;
    peerEmployeeId: string;
    auditCtx: AuditContext;
  }) {
    const appraisal = await this.prisma.performanceAppraisal.findUniqueOrThrow({
      where: { id: params.appraisalId },
    });

    const feedback = await this.prisma.performancePeerFeedback.create({
      data: {
        appraisalId: appraisal.id,
        requesterId: params.requesterId,
        peerEmployeeId: params.peerEmployeeId,
        feedbackText: '',
        isIdentityRestrictedFromReviewee: true,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'PERFORMANCE_PEER_FEEDBACK_REQUESTED',
      targetType: 'PerformancePeerFeedback',
      targetId: feedback.id,
      outcome: 'SUCCESS',
      after: { appraisalId: appraisal.id, peerEmployeeId: params.peerEmployeeId },
    });

    return feedback;
  }

  async submitPeerFeedback(params: {
    feedbackId: string;
    peerEmployeeId: string;
    feedbackText: string;
    strengths?: string;
    improvementAreas?: string;
    auditCtx: AuditContext;
  }) {
    const feedback = await this.prisma.performancePeerFeedback.findUniqueOrThrow({
      where: { id: params.feedbackId },
    });

    if (feedback.peerEmployeeId !== params.peerEmployeeId) {
      throw forbidden('You can only submit peer feedback assigned to your employee account.');
    }

    const updated = await this.prisma.performancePeerFeedback.update({
      where: { id: feedback.id },
      data: {
        feedbackText: params.feedbackText,
        strengths: params.strengths,
        improvementAreas: params.improvementAreas,
        submittedAt: new Date(),
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'PERFORMANCE_PEER_FEEDBACK_SUBMITTED',
      targetType: 'PerformancePeerFeedback',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: { appraisalId: feedback.appraisalId },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // 6. Development Actions
  // ---------------------------------------------------------------------------

  async recordDevelopmentAction(params: {
    employeeId: string;
    appraisalId?: string;
    objective: string;
    actionDescription: string;
    targetDate: string;
    supportRequired?: string;
    linkedTrainingProgrammeId?: string;
    userId: string;
    auditCtx: AuditContext;
  }) {
    return await this.prisma.$transaction(async (tx) => {
      let plan = await tx.developmentPlan.findFirst({
        where: { employeeId: params.employeeId, status: 'ACTIVE' },
      });

      if (!plan) {
        plan = await tx.developmentPlan.create({
          data: {
            employeeId: params.employeeId,
            appraisalId: params.appraisalId,
            title: `Professional Development Plan (${new Date().getFullYear()})`,
            status: 'ACTIVE',
            createdById: params.userId,
          },
        });
      }

      const action = await tx.developmentAction.create({
        data: {
          developmentPlanId: plan.id,
          objective: params.objective,
          actionDescription: params.actionDescription,
          ownerEmployeeId: params.employeeId,
          supportRequired: params.supportRequired,
          targetDate: new Date(params.targetDate),
          linkedTrainingProgrammeId: params.linkedTrainingProgrammeId,
        },
      });

      await writeAudit(tx, params.auditCtx, {
        action: 'DEVELOPMENT_ACTION_RECORDED',
        targetType: 'DevelopmentAction',
        targetId: action.id,
        outcome: 'SUCCESS',
        after: { objective: action.objective, targetDate: action.targetDate },
      });

      return action;
    });
  }

  async completeDevelopmentAction(params: {
    actionId: string;
    evidence: string;
    actorUserId: string;
    auditCtx: AuditContext;
  }) {
    const action = await this.prisma.developmentAction.findUniqueOrThrow({
      where: { id: params.actionId },
    });

    const updated = await this.prisma.developmentAction.update({
      where: { id: action.id },
      data: {
        isCompleted: true,
        completedAt: new Date(),
        evidence: params.evidence,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'DEVELOPMENT_ACTION_COMPLETED',
      targetType: 'DevelopmentAction',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: { isCompleted: true, completedAt: updated.completedAt },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // 7. Performance Improvement Plan (PIP) & Capability Protections
  // ---------------------------------------------------------------------------

  async initiatePip(params: InitiatePipParams) {
    // Approved policy rule: 1 to 3 months duration maximum
    if (params.durationMonths < 1 || params.durationMonths > 3) {
      throw validation(`PIP duration must be between 1 and 3 months per approved policy limit (received ${params.durationMonths} months).`);
    }

    if (!params.smartTargets || params.smartTargets.length === 0) {
      throw validation('A PIP requires at least one documented SMART target with measurement metrics and due dates.');
    }

    const year = new Date().getFullYear();
    const count = await this.prisma.performanceImprovementPlan.count();
    const pipNumber = `PIP-${year}-${String(count + 1).padStart(4, '0')}`;

    return await this.prisma.$transaction(async (tx) => {
      const pip = await tx.performanceImprovementPlan.create({
        data: {
          pipNumber,
          employeeId: params.employeeId,
          lineManagerId: params.lineManagerId,
          hrLeadId: params.hrLeadId,
          triggerReason: params.triggerReason,
          durationMonths: params.durationMonths,
          startDate: new Date(params.startDate),
          endDate: new Date(params.endDate),
          baselineAssessment: params.baselineAssessment,
          smartTargets: JSON.stringify(params.smartTargets),
          supportAndTrainingNotes: params.supportAndTrainingNotes,
          status: 'ACTIVE',
          isCapabilityProcess: true, // Poor performance capability process (segregated from misconduct)
        },
      });

      // Initialize monthly check-in slots
      for (let m = 1; m <= params.durationMonths; m++) {
        const checkInDate = new Date(params.startDate);
        checkInDate.setMonth(checkInDate.getMonth() + m);

        await tx.pipCheckIn.create({
          data: {
            pipId: pip.id,
            checkInMonth: m,
            scheduledDate: checkInDate,
            managerReviewEvidence: 'Pending scheduled check-in',
            progressStatus: 'PARTIAL',
          },
        });
      }

      await writeAudit(tx, params.auditCtx, {
        action: 'PERFORMANCE_PIP_INITIATED',
        targetType: 'PerformanceImprovementPlan',
        targetId: pip.id,
        outcome: 'SUCCESS',
        after: {
          pipNumber: pip.pipNumber,
          employeeId: pip.employeeId,
          durationMonths: pip.durationMonths,
          triggerReason: pip.triggerReason,
          isCapabilityProcess: true,
        },
      });

      return pip;
    });
  }

  async acknowledgePip(params: {
    pipId: string;
    employeeId: string;
    comments?: string;
    refuseToSign?: boolean;
    refusalReason?: string;
    auditCtx: AuditContext;
  }) {
    const pip = await this.prisma.performanceImprovementPlan.findUniqueOrThrow({
      where: { id: params.pipId },
    });

    if (pip.employeeId !== params.employeeId) {
      throw forbidden('You can only sign or submit comments on your own assigned PIP.');
    }

    if (params.refuseToSign && (!params.refusalReason || params.refusalReason.trim().length === 0)) {
      throw validation('A documented refusal reason is required when registering refusal to sign a PIP.');
    }

    const updated = await this.prisma.performanceImprovementPlan.update({
      where: { id: pip.id },
      data: {
        employeeAcknowledgedAt: !params.refuseToSign ? new Date() : null,
        employeeRefusalToSign: params.refuseToSign ?? false,
        refusalReason: params.refusalReason,
        employeeComments: params.comments,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: params.refuseToSign ? 'PIP_REFUSAL_TO_SIGN_RECORDED' : 'PIP_ACKNOWLEDGED',
      targetType: 'PerformanceImprovementPlan',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: {
        pipNumber: pip.pipNumber,
        refused: updated.employeeRefusalToSign,
        acknowledged: Boolean(updated.employeeAcknowledgedAt),
      },
    });

    return updated;
  }

  async recordPipCheckIn(params: RecordPipCheckInParams) {
    const checkIn = await this.prisma.pipCheckIn.findFirstOrThrow({
      where: { pipId: params.pipId, checkInMonth: params.checkInMonth },
      include: { pip: true },
    });

    const updated = await this.prisma.pipCheckIn.update({
      where: { id: checkIn.id },
      data: {
        conductedDate: params.conductedDate ? new Date(params.conductedDate) : new Date(),
        managerReviewEvidence: params.managerReviewEvidence,
        progressStatus: params.progressStatus,
        employeeComments: params.employeeComments,
        actionAdjustments: params.actionAdjustments,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'PIP_MONTHLY_CHECK_IN_RECORDED',
      targetType: 'PipCheckIn',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: {
        pipNumber: checkIn.pip.pipNumber,
        month: updated.checkInMonth,
        progressStatus: updated.progressStatus,
      },
    });

    return updated;
  }

  async decidePipOutcome(params: {
    pipId: string;
    outcomeRecommendation: 'CLEARANCE' | 'FURTHER_REVIEW' | 'REFERRAL_TO_FAIR_HEARING';
    outcomeNotes: string;
    deciderUserId: string;
    auditCtx: AuditContext;
  }) {
    const pip = await this.prisma.performanceImprovementPlan.findUniqueOrThrow({
      where: { id: params.pipId },
    });

    // CRITICAL POLICY RULE:
    // PIP outcomes NEVER automatically terminate, issue final warnings, hold rewards or alter salary!
    // Must remain a capability recommendation decided by authorized human authority.
    const statusMap: Record<string, string> = {
      CLEARANCE: 'SUCCESSFUL_COMPLETION',
      FURTHER_REVIEW: 'EXTENDED',
      REFERRAL_TO_FAIR_HEARING: 'FORMAL_HEARING_REFERRED',
    };

    const newStatus = statusMap[params.outcomeRecommendation] || 'FURTHER_REVIEW';

    const updated = await this.prisma.performanceImprovementPlan.update({
      where: { id: pip.id },
      data: {
        status: newStatus,
        outcomeRecommendation: params.outcomeRecommendation,
        outcomeNotes: params.outcomeNotes,
        decidedById: params.deciderUserId,
        decidedAt: new Date(),
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'PIP_OUTCOME_DECIDED',
      targetType: 'PerformanceImprovementPlan',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: {
        pipNumber: pip.pipNumber,
        outcome: updated.outcomeRecommendation,
        newStatus: updated.status,
        decidedById: params.deciderUserId,
      },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // 8. Scoped Dashboards & Reports (Privacy-Safe)
  // ---------------------------------------------------------------------------

  async getPerformanceDashboard(userId: string, userRoles: string[]) {
    const isExecutive = userRoles.includes('managing_partner') || userRoles.includes('operations_director') || userRoles.includes('head_of_hr');
    const scope = isExecutive ? 'ORGANISATION' : userRoles.includes('line_manager') ? 'MANAGER' : 'EMPLOYEE';

    let employeeWhere: any = {};
    if (!isExecutive) {
      // Find employee record for current user
      const emp = await this.prisma.employee.findUnique({ where: { userId } });
      if (!emp) return { authorized: false, message: 'No employee record linked' };

      // Line manager view: only direct/indirect reports
      employeeWhere = {
        OR: [{ managerId: emp.id }, { id: emp.id }],
      };
    }

    const activeCycle = await this.prisma.performanceCycle.findFirst({
      where: { status: 'ACTIVE' },
      include: {
        appraisals: {
          where: { employee: employeeWhere },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
          },
        },
      },
    });

    const pips = await this.prisma.performanceImprovementPlan.findMany({
      where: { employee: employeeWhere },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const activePlanActions = await this.prisma.developmentAction.count({
      where: { developmentPlan: { employee: employeeWhere }, isCompleted: false },
    });

    const completedPlanActions = await this.prisma.developmentAction.count({
      where: { developmentPlan: { employee: employeeWhere }, isCompleted: true },
    });

    return {
      scope,
      activeCycle: activeCycle
        ? {
            id: activeCycle.id,
            title: activeCycle.title,
            periodEnd: activeCycle.periodEnd,
            totalAppraisalsScoped: activeCycle.appraisals.length,
            completedAppraisals: activeCycle.appraisals.filter((a) => a.status === 'PARTNER_APPROVED' || a.status === 'HR_MODERATED').length,
            pendingSelfAppraisal: activeCycle.appraisals.filter((a) => a.status === 'DRAFT_SELF').length,
            pendingManagerAppraisal: activeCycle.appraisals.filter((a) => a.status === 'SUBMITTED_SELF').length,
          }
        : null,
      pipSummary: {
        totalActivePips: pips.filter((p) => p.status === 'ACTIVE').length,
        referredToHearing: pips.filter((p) => p.status === 'FORMAL_HEARING_REFERRED').length,
        successfullyCompleted: pips.filter((p) => p.status === 'SUCCESSFUL_COMPLETION').length,
        scopedPips: pips.map((p) => ({
          pipNumber: p.pipNumber,
          employeeName: `${p.employee.firstName} ${p.employee.lastName}`,
          triggerReason: p.triggerReason,
          durationMonths: p.durationMonths,
          status: p.status,
          outcomeRecommendation: p.outcomeRecommendation,
        })),
      },
      developmentActions: {
        active: activePlanActions,
        completed: completedPlanActions,
      },
      privacySafeReporting: true,
    };
  }
}
