import { PrismaClient } from '@prisma/client';
import { writeAudit, type AuditContext } from '../../core/audit/audit.js';
import { forbidden, validation, conflict } from '../../core/errors/errors.js';

export interface CreatePolicyParams {
  code: string;
  title: string;
  owner: string;
  targetAudience: string;
  category: string;
  initialVersionSummary: string;
  effectiveDate: string;
  reviewDate?: string;
  sourceReference: string;
  auditCtx: AuditContext;
}

export interface PublishPolicyParams {
  versionId: string;
  approverId: string;
  auditCtx: AuditContext;
}

export interface AcknowledgePolicyParams {
  acknowledgementId: string;
  employeeId: string;
  ipAddress?: string;
  userAgent?: string;
  evidenceDocumentId?: string;
  auditCtx: AuditContext;
}

export interface RefusePolicyParams {
  acknowledgementId: string;
  employeeId: string;
  refusalReason: string;
  auditCtx: AuditContext;
}

export class GovernanceService {
  constructor(private prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // 1. Policy Register and Version Acknowledgement
  // ---------------------------------------------------------------------------

  async createPolicy(params: CreatePolicyParams) {
    const existing = await this.prisma.policyDocument.findUnique({
      where: { code: params.code },
    });
    if (existing) {
      throw conflict(`Policy with code ${params.code} already exists`);
    }

    const policy = await this.prisma.policyDocument.create({
      data: {
        code: params.code,
        title: params.title,
        owner: params.owner,
        targetAudience: params.targetAudience,
        category: params.category,
        versions: {
          create: {
            versionNumber: '1.0',
            contentSummary: params.initialVersionSummary,
            effectiveDate: new Date(params.effectiveDate),
            reviewDate: params.reviewDate ? new Date(params.reviewDate) : null,
            status: 'DRAFT',
            sourceReference: params.sourceReference,
            isImmutable: false,
            createdById: params.auditCtx.userId,
          },
        },
      },
      include: {
        versions: true,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'POLICY_DRAFT_CREATED',
      targetType: 'PolicyDocument',
      targetId: policy.id,
      outcome: 'SUCCESS',
      after: { code: policy.code, title: policy.title, version: '1.0' },
    });

    return policy;
  }

  async createNewVersion(policyId: string, params: {
    versionNumber: string;
    contentSummary: string;
    effectiveDate: string;
    reviewDate?: string;
    sourceReference: string;
    auditCtx: AuditContext;
  }) {
    const policy = await this.prisma.policyDocument.findUniqueOrThrow({
      where: { id: policyId },
    });

    const existingVersion = await this.prisma.policyVersion.findUnique({
      where: {
        policyId_versionNumber: {
          policyId,
          versionNumber: params.versionNumber,
        },
      },
    });
    if (existingVersion) {
      throw conflict(`Version ${params.versionNumber} already exists for policy ${policy.code}`);
    }

    const version = await this.prisma.policyVersion.create({
      data: {
        policyId,
        versionNumber: params.versionNumber,
        contentSummary: params.contentSummary,
        effectiveDate: new Date(params.effectiveDate),
        reviewDate: params.reviewDate ? new Date(params.reviewDate) : null,
        status: 'DRAFT',
        sourceReference: params.sourceReference,
        isImmutable: false,
        createdById: params.auditCtx.userId,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'POLICY_VERSION_DRAFTED',
      targetType: 'PolicyVersion',
      targetId: version.id,
      outcome: 'SUCCESS',
      after: { policyCode: policy.code, versionNumber: version.versionNumber },
    });

    return version;
  }

  async publishPolicyVersion(params: PublishPolicyParams) {
    const version = await this.prisma.policyVersion.findUniqueOrThrow({
      where: { id: params.versionId },
      include: { policy: true },
    });

    if (version.status === 'PUBLISHED') {
      throw validation(`Policy version ${version.versionNumber} is already published.`);
    }

    // Maker-Checker Segregation of Duties: Author cannot approve their own version draft
    if (version.createdById && version.createdById === params.approverId) {
      throw forbidden('Maker-Checker Violation: Author cannot approve and publish their own policy version.');
    }

    return await this.prisma.$transaction(
      async (tx) => {
        // 1. Supersede any currently published version of this policy
        await tx.policyVersion.updateMany({
          where: {
            policyId: version.policyId,
            status: 'PUBLISHED',
            id: { not: version.id },
          },
          data: {
            status: 'SUPERSEDED',
          },
        });

        // 2. Mark this version as PUBLISHED and IMMUTABLE
        const published = await tx.policyVersion.update({
          where: { id: version.id },
          data: {
            status: 'PUBLISHED',
            isImmutable: true,
            publishedAt: new Date(),
            publishedById: params.approverId,
            approvedAt: new Date(),
            approvedById: params.approverId,
          },
        });

        // 3. Assign exact version acknowledgements to active workforce
        const audienceQuery: any = { isActive: true, status: { in: ['ACTIVE', 'PROBATION', 'ONBOARDING'] } };
        const employees = await tx.employee.findMany({
          where: audienceQuery,
          select: { id: true },
        });

        if (employees.length > 0) {
          await tx.policyAcknowledgement.createMany({
            data: employees.map((emp) => ({
              policyVersionId: published.id,
              employeeId: emp.id,
              status: 'PENDING',
            })),
          });
        }

        await writeAudit(tx, params.auditCtx, {
          action: 'POLICY_VERSION_PUBLISHED',
          targetType: 'PolicyVersion',
          targetId: published.id,
          outcome: 'SUCCESS',
          after: {
            policyCode: version.policy.code,
            versionNumber: published.versionNumber,
            audienceCount: employees.length,
            isImmutable: true,
          },
        });

        return { published, audienceCount: employees.length };
      },
      { timeout: 15000, maxWait: 10000 }
    );
  }

  async acknowledgePolicy(params: AcknowledgePolicyParams) {
    const ack = await this.prisma.policyAcknowledgement.findUniqueOrThrow({
      where: { id: params.acknowledgementId },
      include: { policyVersion: { include: { policy: true } } },
    });

    if (ack.employeeId !== params.employeeId) {
      throw forbidden('Forbidden: You can only submit your own policy acknowledgement.');
    }

    if (ack.status === 'ACKNOWLEDGED') {
      return ack; // Idempotent
    }

    const updated = await this.prisma.policyAcknowledgement.update({
      where: { id: ack.id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        ipAddress: params.ipAddress || '127.0.0.1',
        userAgent: params.userAgent || 'Enterprise-Portal',
        evidenceDocumentId: params.evidenceDocumentId,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'POLICY_ACKNOWLEDGED',
      targetType: 'PolicyAcknowledgement',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: {
        policyCode: ack.policyVersion.policy.code,
        versionAccepted: ack.policyVersion.versionNumber,
        acknowledgedAt: updated.acknowledgedAt,
      },
    });

    return updated;
  }

  async refusePolicy(params: RefusePolicyParams) {
    const ack = await this.prisma.policyAcknowledgement.findUniqueOrThrow({
      where: { id: params.acknowledgementId },
      include: { policyVersion: { include: { policy: true } } },
    });

    if (ack.employeeId !== params.employeeId) {
      throw forbidden('Forbidden: You can only record refusal for your own assignment.');
    }

    const updated = await this.prisma.policyAcknowledgement.update({
      where: { id: ack.id },
      data: {
        status: 'REFUSED',
        refusalReason: params.refusalReason,
        hrFollowUpNotes: 'HR policy consultation required to discuss employee reservation.',
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'POLICY_ACKNOWLEDGEMENT_REFUSED',
      targetType: 'PolicyAcknowledgement',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: {
        policyCode: ack.policyVersion.policy.code,
        version: ack.policyVersion.versionNumber,
        reason: params.refusalReason,
      },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // 2. Training Administration (not an LMS)
  // ---------------------------------------------------------------------------

  async createTrainingProgramme(params: {
    code: string;
    name: string;
    category: string;
    recurrence?: string;
    dueDaysAfterAssignment?: number;
    description?: string;
    provider?: string;
    decisionReference?: string;
    auditCtx: AuditContext;
  }) {
    // Open Decision D-15 / D-16: The source policy text typo "14c days" must remain an open decision!
    const isTypoFlagged =
      params.decisionReference === 'D-15' ||
      params.decisionReference === 'D-16' ||
      params.description?.includes('14c') ||
      params.code.includes('14C');

    const programme = await this.prisma.trainingProgramme.create({
      data: {
        code: params.code,
        name: params.name,
        category: params.category,
        recurrence: params.recurrence,
        dueDaysAfterAssignment: params.dueDaysAfterAssignment,
        isOpenDecisionTypo: isTypoFlagged,
        decisionReference: params.decisionReference,
        description: params.description,
        provider: params.provider,
        status: 'ACTIVE',
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'TRAINING_PROGRAMME_CREATED',
      targetType: 'TrainingProgramme',
      targetId: programme.id,
      outcome: 'SUCCESS',
      after: { code: programme.code, name: programme.name, isOpenDecisionTypo: isTypoFlagged },
    });

    return programme;
  }

  async assignTraining(params: {
    programmeId: string;
    employeeId: string;
    dueDate: string;
    auditCtx: AuditContext;
  }) {
    const programme = await this.prisma.trainingProgramme.findUniqueOrThrow({
      where: { id: params.programmeId },
    });

    const assignment = await this.prisma.trainingAssignment.create({
      data: {
        programmeId: programme.id,
        employeeId: params.employeeId,
        dueDate: new Date(params.dueDate),
        status: 'ASSIGNED',
      },
      include: {
        programme: true,
        employee: true,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'TRAINING_ASSIGNED',
      targetType: 'TrainingAssignment',
      targetId: assignment.id,
      outcome: 'SUCCESS',
      after: { programmeCode: programme.code, employeeId: params.employeeId, dueDate: params.dueDate },
    });

    return assignment;
  }

  async completeTraining(params: {
    assignmentId: string;
    scorePercent?: number;
    passed?: boolean;
    evidenceDocumentId?: string;
    certificateNumber?: string;
    remedialAction?: string;
    auditCtx: AuditContext;
  }) {
    const assignment = await this.prisma.trainingAssignment.findUniqueOrThrow({
      where: { id: params.assignmentId },
      include: { programme: true },
    });

    const passed = params.passed ?? (params.scorePercent !== undefined ? params.scorePercent >= 80 : true);

    const updated = await this.prisma.trainingAssignment.update({
      where: { id: assignment.id },
      data: {
        status: passed ? 'COMPLETED' : 'REMEDIAL_REQUIRED',
        completedAt: new Date(),
        scorePercent: params.scorePercent,
        passed,
        evidenceDocumentId: params.evidenceDocumentId,
        certificateNumber: params.certificateNumber,
        remedialAction: !passed ? params.remedialAction || 'Mandatory re-sit and coaching session required' : null,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'TRAINING_COMPLETED',
      targetType: 'TrainingAssignment',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: {
        programmeCode: assignment.programme.code,
        passed,
        scorePercent: params.scorePercent,
      },
    });

    return updated;
  }

  async recordPhishingSimulation(params: {
    campaignName: string;
    simulationDate: string;
    employeeId: string;
    payloadType: string;
    clickedLink: boolean;
    submittedCredentials: boolean;
    reportedPhish: boolean;
    auditCtx: AuditContext;
  }) {
    return await this.prisma.$transaction(async (tx) => {
      const remedialRequired = params.submittedCredentials;

      const record = await tx.phishingSimulationRecord.create({
        data: {
          campaignName: params.campaignName,
          simulationDate: new Date(params.simulationDate),
          employeeId: params.employeeId,
          payloadType: params.payloadType,
          clickedLink: params.clickedLink,
          submittedCredentials: params.submittedCredentials,
          reportedPhish: params.reportedPhish,
          remedialTrainingAssigned: remedialRequired,
        },
      });

      if (remedialRequired) {
        const cyberProg = await tx.trainingProgramme.findFirst({
          where: { category: 'CYBERSECURITY_INDUCTION' },
        });

        if (cyberProg) {
          const dueIn7Days = new Date();
          dueIn7Days.setDate(dueIn7Days.getDate() + 7);
          await tx.trainingAssignment.create({
            data: {
              programmeId: cyberProg.id,
              employeeId: params.employeeId,
              dueDate: dueIn7Days,
              status: 'ASSIGNED',
              remedialNotes: `Automated remedial training triggered: clicked link & submitted credentials in simulation "${params.campaignName}"`,
            },
          });
        }
      }

      await writeAudit(tx, params.auditCtx, {
        action: 'PHISHING_SIMULATION_RECORDED',
        targetType: 'PhishingSimulationRecord',
        targetId: record.id,
        outcome: 'SUCCESS',
        after: {
          campaign: params.campaignName,
          employeeId: params.employeeId,
          submittedCredentials: params.submittedCredentials,
          remedialAssigned: remedialRequired,
        },
      });

      return record;
    });
  }

  async logSecurityCommunication(params: {
    subject: string;
    channel: string;
    audience: string;
    reference?: string;
    sentById: string;
    auditCtx: AuditContext;
  }) {
    const log = await this.prisma.securityCommunicationLog.create({
      data: {
        subject: params.subject,
        channel: params.channel,
        audience: params.audience,
        reference: params.reference,
        sentById: params.sentById,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'SECURITY_COMMUNICATION_LOGGED',
      targetType: 'SecurityCommunicationLog',
      targetId: log.id,
      outcome: 'SUCCESS',
      after: { subject: log.subject, audience: log.audience },
    });

    return log;
  }
}
