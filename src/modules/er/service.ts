import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { writeAudit, type AuditContext } from '../../core/audit/audit.js';
import { encrypt, decrypt } from '../../core/crypto/vault.js';
import { forbidden, validation, notFound } from '../../core/errors/errors.js';

export interface CreateCaseParams {
  caseType: 'DISCIPLINARY' | 'GRIEVANCE' | 'HARASSMENT_DISCRIMINATION' | 'WHISTLEBLOWING';
  title: string;
  severity?: 'STANDARD' | 'HIGH' | 'CRITICAL';
  primaryHandlerId?: string;
  assignedInvestigatorId?: string;
  subjectEmployeeId?: string;
  complainantEmployeeId?: string;
  allegationSummary: string;
  policyClausesCited?: string;
  safetySupportMeasures?: string;
  intakeChannel?: string;
  userId?: string;
  auditCtx: AuditContext;
}

export interface AnonymousWhistleblowerParams {
  title: string;
  allegationSummary: string;
  policyClausesCited?: string;
  voluntaryContactName?: string;
  voluntaryContactEmail?: string;
  auditCtx: AuditContext;
}

export interface DeclareConflictParams {
  caseId: string;
  declaringUserId: string;
  natureOfConflict: string;
  reassignToUserId?: string;
  auditCtx: AuditContext;
}

export interface ScheduleHearingParams {
  caseId: string;
  scheduledDate: string;
  locationOrLink: string;
  companionAllowed?: boolean;
  companionName?: string;
  panelMemberUserIds: string[];
  schedulerUserId: string;
  auditCtx: AuditContext;
}

export interface IssueDecisionParams {
  caseId: string;
  findings: string;
  sanction?: string;
  sanctionDurationMonths?: number;
  appealDeadlineDays?: number;
  deciderUserId: string;
  auditCtx: AuditContext;
}

export interface SubmitAppealParams {
  caseId: string;
  grounds: string;
  appealOfficerId: string;
  appellantUserId: string;
  auditCtx: AuditContext;
}

export class ErService {
  constructor(private prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // Case-Level Access Authorization Enforcement
  // ---------------------------------------------------------------------------

  async assertCaseAccess(userId: string, userRoles: string[], caseId: string) {
    if (userRoles.includes('managing_partner')) {
      return true;
    }

    const erCase = await this.prisma.erCase.findUniqueOrThrow({
      where: { id: caseId },
    });

    if (erCase.primaryHandlerId === userId || erCase.assignedInvestigatorId === userId) {
      return true;
    }

    const access = await this.prisma.erCaseAccess.findFirst({
      where: {
        caseId,
        userId,
        revokedAt: null,
      },
    });

    if (access) {
      return true;
    }

    throw forbidden(
      'CaseAccessDenied: Generic case listing prohibited. User is not an authorized handler, investigator, panel member, or appeal officer for this case.'
    );
  }

  // ---------------------------------------------------------------------------
  // Case Management & Intake
  // ---------------------------------------------------------------------------

  async createCase(params: CreateCaseParams) {
    const year = new Date().getFullYear();
    const prefixMap: Record<string, string> = {
      DISCIPLINARY: 'DISC',
      GRIEVANCE: 'GRIEV',
      HARASSMENT_DISCRIMINATION: 'HARASS',
      WHISTLEBLOWING: 'WB',
    };
    const code = prefixMap[params.caseType] || 'CASE';
    const count = await this.prisma.erCase.count({ where: { caseType: params.caseType } });
    const caseNumber = `ER-${code}-${year}-${String(count + 1).padStart(4, '0')}`;

    return await this.prisma.$transaction(async (tx) => {
      const erCase = await tx.erCase.create({
        data: {
          caseNumber,
          caseType: params.caseType,
          title: params.title,
          severity: params.severity || 'STANDARD',
          primaryHandlerId: params.primaryHandlerId,
          assignedInvestigatorId: params.assignedInvestigatorId,
          subjectEmployeeId: params.subjectEmployeeId,
          complainantEmployeeId: params.complainantEmployeeId,
          allegationSummary: params.allegationSummary,
          policyClausesCited: params.policyClausesCited,
          safetySupportMeasures: params.safetySupportMeasures,
          intakeChannel: params.intakeChannel || 'PORTAL',
          antiRetaliationMonitoring: params.caseType === 'HARASSMENT_DISCRIMINATION' || params.caseType === 'WHISTLEBLOWING',
          createdById: params.userId,
        },
      });

      if (params.primaryHandlerId) {
        await tx.erCaseAccess.create({
          data: {
            caseId: erCase.id,
            userId: params.primaryHandlerId,
            role: 'HANDLER',
            grantedById: params.userId || params.primaryHandlerId,
          },
        });
      }

      if (params.assignedInvestigatorId) {
        await tx.erCaseAccess.create({
          data: {
            caseId: erCase.id,
            userId: params.assignedInvestigatorId,
            role: 'INVESTIGATOR',
            grantedById: params.userId || params.assignedInvestigatorId,
          },
        });
      }

      await tx.erCaseEvent.create({
        data: {
          caseId: erCase.id,
          eventType: 'INTAKE',
          description: `Case ${erCase.caseNumber} registered in ${erCase.caseType} workflow`,
          actorUserId: params.userId,
          correlationId: params.auditCtx.correlationId,
        },
      });

      await writeAudit(tx, params.auditCtx, {
        action: 'ER_CASE_CREATED',
        targetType: 'ErCase',
        targetId: erCase.id,
        outcome: 'SUCCESS',
        after: {
          caseNumber: erCase.caseNumber,
          caseType: erCase.caseType,
          severity: erCase.severity,
          primaryHandlerId: erCase.primaryHandlerId,
        },
      });

      return erCase;
    });
  }

  async submitAnonymousWhistleblower(params: AnonymousWhistleblowerParams) {
    const year = new Date().getFullYear();
    const count = await this.prisma.erCase.count({ where: { caseType: 'WHISTLEBLOWING' } });
    const caseNumber = `ER-WB-${year}-${String(count + 1).padStart(4, '0')}`;

    const randomHex = crypto.randomBytes(16).toString('hex').toUpperCase();
    const whistleblowerToken = `WB-${year}-${randomHex}`;

    let encryptedIdentity: string | null = null;
    if (params.voluntaryContactName || params.voluntaryContactEmail) {
      const rawIdentity = JSON.stringify({
        name: params.voluntaryContactName,
        email: params.voluntaryContactEmail,
      });
      encryptedIdentity = encrypt(rawIdentity);
    }

    const erCase = await this.prisma.erCase.create({
      data: {
        caseNumber,
        caseType: 'WHISTLEBLOWING',
        title: params.title,
        severity: 'HIGH',
        isAnonymous: true,
        whistleblowerToken,
        encryptedWhistleblowerIdentity: encryptedIdentity,
        intakeChannel: 'ANONYMOUS_INTAKE',
        allegationSummary: params.allegationSummary,
        policyClausesCited: params.policyClausesCited,
        antiRetaliationMonitoring: true,
      },
    });

    await this.prisma.erCaseEvent.create({
      data: {
        caseId: erCase.id,
        eventType: 'INTAKE',
        description: `Anonymous whistleblowing submission received and tracking token issued`,
        correlationId: params.auditCtx.correlationId,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'ER_WHISTLEBLOWER_SUBMITTED',
      targetType: 'ErCase',
      targetId: erCase.id,
      outcome: 'SUCCESS',
      after: {
        caseNumber: erCase.caseNumber,
        isAnonymous: true,
      },
    });

    return {
      caseNumber: erCase.caseNumber,
      trackingToken: whistleblowerToken,
      message: 'Your report has been securely registered. Save your tracking token to inspect updates or reply securely.',
    };
  }

  async trackAnonymousWhistleblower(token: string) {
    const erCase = await this.prisma.erCase.findUnique({
      where: { whistleblowerToken: token },
      include: {
        events: {
          select: {
            eventType: true,
            description: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!erCase) {
      throw notFound('Whistleblower report with specified token');
    }

    return {
      caseNumber: erCase.caseNumber,
      status: erCase.status,
      submittedAt: erCase.createdAt,
      antiRetaliationMonitoring: erCase.antiRetaliationMonitoring,
      timeline: erCase.events,
    };
  }

  async grantCaseAccess(params: {
    caseId: string;
    userId: string;
    role: 'HANDLER' | 'INVESTIGATOR' | 'PANEL_MEMBER' | 'APPEAL_OFFICER' | 'OBSERVER';
    grantedById: string;
    auditCtx: AuditContext;
  }) {
    const erCase = await this.prisma.erCase.findUniqueOrThrow({
      where: { id: params.caseId },
    });

    const access = await this.prisma.erCaseAccess.upsert({
      where: {
        caseId_userId: {
          caseId: erCase.id,
          userId: params.userId,
        },
      },
      create: {
        caseId: erCase.id,
        userId: params.userId,
        role: params.role,
        grantedById: params.grantedById,
      },
      update: {
        role: params.role,
        revokedAt: null,
        revocationReason: null,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'ER_CASE_ACCESS_GRANTED',
      targetType: 'ErCaseAccess',
      targetId: access.id,
      outcome: 'SUCCESS',
      after: { caseNumber: erCase.caseNumber, userId: params.userId, role: params.role },
    });

    return access;
  }

  async declareConflictOfInterest(params: DeclareConflictParams) {
    const erCase = await this.prisma.erCase.findUniqueOrThrow({
      where: { id: params.caseId },
    });

    return await this.prisma.$transaction(async (tx) => {
      const conflict = await tx.erConflictDeclaration.create({
        data: {
          caseId: erCase.id,
          userId: params.declaringUserId,
          natureOfConflict: params.natureOfConflict,
          handlerReassignedToId: params.reassignToUserId,
        },
      });

      await tx.erCaseAccess.updateMany({
        where: {
          caseId: erCase.id,
          userId: params.declaringUserId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revocationReason: `Conflict of interest declared: ${params.natureOfConflict}`,
        },
      });

      if (params.reassignToUserId) {
        await tx.erCase.update({
          where: { id: erCase.id },
          data: {
            primaryHandlerId: params.reassignToUserId,
          },
        });

        await tx.erCaseAccess.upsert({
          where: {
            caseId_userId: {
              caseId: erCase.id,
              userId: params.reassignToUserId,
            },
          },
          create: {
            caseId: erCase.id,
            userId: params.reassignToUserId,
            role: 'HANDLER',
            grantedById: params.declaringUserId,
          },
          update: {
            role: 'HANDLER',
            revokedAt: null,
          },
        });
      }

      await tx.erCaseEvent.create({
        data: {
          caseId: erCase.id,
          eventType: 'REASSIGNED_CONFLICT',
          description: `Handler conflict declared and case reassigned to prevent procedural bias`,
          actorUserId: params.declaringUserId,
          correlationId: params.auditCtx.correlationId,
        },
      });

      await writeAudit(tx, params.auditCtx, {
        action: 'ER_CONFLICT_DECLARED',
        targetType: 'ErConflictDeclaration',
        targetId: conflict.id,
        outcome: 'SUCCESS',
        after: {
          caseNumber: erCase.caseNumber,
          declaringUserId: params.declaringUserId,
          reassignedTo: params.reassignToUserId,
        },
      });

      return conflict;
    });
  }

  async scheduleHearing(params: ScheduleHearingParams) {
    const erCase = await this.prisma.erCase.findUniqueOrThrow({
      where: { id: params.caseId },
    });

    const hearing = await this.prisma.erHearing.create({
      data: {
        caseId: erCase.id,
        scheduledDate: new Date(params.scheduledDate),
        locationOrLink: params.locationOrLink,
        companionAllowed: params.companionAllowed ?? true,
        companionName: params.companionName,
        panelMemberUserIds: JSON.stringify(params.panelMemberUserIds),
        status: 'SCHEDULED',
      },
    });

    for (const panelUserId of params.panelMemberUserIds) {
      await this.prisma.erCaseAccess.upsert({
        where: {
          caseId_userId: {
            caseId: erCase.id,
            userId: panelUserId,
          },
        },
        create: {
          caseId: erCase.id,
          userId: panelUserId,
          role: 'PANEL_MEMBER',
          grantedById: params.schedulerUserId,
        },
        update: {
          role: 'PANEL_MEMBER',
          revokedAt: null,
        },
      });
    }

    await this.prisma.erCase.update({
      where: { id: erCase.id },
      data: { status: 'HEARING' },
    });

    await this.prisma.erCaseEvent.create({
      data: {
        caseId: erCase.id,
        eventType: 'HEARING_HELD',
        description: `Formal hearing scheduled for ${params.scheduledDate}`,
        actorUserId: params.schedulerUserId,
        correlationId: params.auditCtx.correlationId,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'ER_HEARING_SCHEDULED',
      targetType: 'ErHearing',
      targetId: hearing.id,
      outcome: 'SUCCESS',
      after: { caseNumber: erCase.caseNumber, scheduledDate: hearing.scheduledDate },
    });

    return hearing;
  }

  async uploadCaseEvidence(params: {
    caseId: string;
    documentId: string;
    category: string;
    title: string;
    isRestrictedMedical?: boolean;
    uploadedById: string;
    auditCtx: AuditContext;
  }) {
    const erCase = await this.prisma.erCase.findUniqueOrThrow({
      where: { id: params.caseId },
    });

    const count = await this.prisma.erEvidenceDocument.count({
      where: { caseId: erCase.id, title: params.title },
    });

    const evidence = await this.prisma.erEvidenceDocument.create({
      data: {
        caseId: erCase.id,
        documentId: params.documentId,
        category: params.category,
        title: params.title,
        version: count + 1,
        isRestrictedMedical: params.isRestrictedMedical ?? false,
        uploadedById: params.uploadedById,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'ER_EVIDENCE_ATTACHED',
      targetType: 'ErEvidenceDocument',
      targetId: evidence.id,
      outcome: 'SUCCESS',
      after: {
        caseNumber: erCase.caseNumber,
        category: evidence.category,
        isMedical: evidence.isRestrictedMedical,
      },
    });

    return evidence;
  }

  async issueDecision(params: IssueDecisionParams) {
    const erCase = await this.prisma.erCase.findUniqueOrThrow({
      where: { id: params.caseId },
    });

    const appealDeadline = new Date();
    appealDeadline.setDate(appealDeadline.getDate() + (params.appealDeadlineDays || 7));

    const decision = await this.prisma.erCaseDecision.create({
      data: {
        caseId: erCase.id,
        findings: params.findings,
        sanction: params.sanction,
        sanctionDurationMonths: params.sanctionDurationMonths,
        appealDeadline,
        decidedById: params.deciderUserId,
      },
    });

    await this.prisma.erCase.update({
      where: { id: erCase.id },
      data: { status: 'OUTCOME_PENDING' },
    });

    await this.prisma.erCaseEvent.create({
      data: {
        caseId: erCase.id,
        eventType: 'DECISION_ISSUED',
        description: `Formal findings and sanction determination recorded by authorized officer`,
        actorUserId: params.deciderUserId,
        correlationId: params.auditCtx.correlationId,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'ER_DECISION_ISSUED',
      targetType: 'ErCaseDecision',
      targetId: decision.id,
      outcome: 'SUCCESS',
      after: {
        caseNumber: erCase.caseNumber,
        sanction: decision.sanction,
        appealDeadline: decision.appealDeadline,
      },
    });

    return decision;
  }

  async submitAppeal(params: SubmitAppealParams) {
    const erCase = await this.prisma.erCase.findUniqueOrThrow({
      where: { id: params.caseId },
    });

    return await this.prisma.$transaction(async (tx) => {
      const appeal = await tx.erAppeal.create({
        data: {
          caseId: erCase.id,
          grounds: params.grounds,
          appealOfficerId: params.appealOfficerId,
          status: 'PENDING',
        },
      });

      await tx.erCaseAccess.upsert({
        where: {
          caseId_userId: {
            caseId: erCase.id,
            userId: params.appealOfficerId,
          },
        },
        create: {
          caseId: erCase.id,
          userId: params.appealOfficerId,
          role: 'APPEAL_OFFICER',
          grantedById: params.appellantUserId,
        },
        update: {
          role: 'APPEAL_OFFICER',
          revokedAt: null,
        },
      });

      await tx.erCase.update({
        where: { id: erCase.id },
        data: { status: 'APPEAL' },
      });

      await tx.erCaseEvent.create({
        data: {
          caseId: erCase.id,
          eventType: 'APPEAL_FILED',
          description: `Formal appeal lodged on documented procedural or substantive grounds`,
          actorUserId: params.appellantUserId,
          correlationId: params.auditCtx.correlationId,
        },
      });

      await writeAudit(tx, params.auditCtx, {
        action: 'ER_APPEAL_FILED',
        targetType: 'ErAppeal',
        targetId: appeal.id,
        outcome: 'SUCCESS',
        after: { caseNumber: erCase.caseNumber, appealOfficerId: appeal.appealOfficerId },
      });

      return appeal;
    });
  }

  async reviewAppeal(params: {
    appealId: string;
    outcome: 'UPHELD' | 'OVERTURNED' | 'MODIFIED';
    comments: string;
    reviewerUserId: string;
    auditCtx: AuditContext;
  }) {
    const appeal = await this.prisma.erAppeal.findUniqueOrThrow({
      where: { id: params.appealId },
      include: { case: true },
    });

    if (appeal.appealOfficerId !== params.reviewerUserId) {
      throw forbidden('Forbidden: Only the designated appeal officer can decide this appeal.');
    }

    const updated = await this.prisma.erAppeal.update({
      where: { id: appeal.id },
      data: {
        status: params.outcome,
        outcome: params.comments,
        decidedAt: new Date(),
      },
    });

    await this.prisma.erCase.update({
      where: { id: appeal.caseId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: params.reviewerUserId,
        closureSummary: `Appeal concluded: ${params.outcome} - ${params.comments}`,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'ER_APPEAL_DECIDED',
      targetType: 'ErAppeal',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: {
        caseNumber: appeal.case.caseNumber,
        outcome: updated.outcome,
        status: updated.status,
      },
    });

    return updated;
  }
}
