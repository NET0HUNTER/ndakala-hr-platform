import { PrismaClient } from '@prisma/client';
import { writeAudit, type AuditContext } from '../../core/audit/audit.js';
import { forbidden, validation } from '../../core/errors/errors.js';

export interface CreateRequisitionParams {
  departmentId: string;
  positionTitle: string;
  gradeId?: string;
  locationId?: string;
  headcount?: number;
  reason: string;
  vacancyDuration: string;
  proposedStartDate?: string;
  reportingToPosition?: string;
  jobDescription: string;
  keyResponsibilities: string;
  requiredSkills: string;
  objectives?: string;
  teamChallenges?: string;
  budgetContext?: string;
  userId: string;
  auditCtx: AuditContext;
}

export interface ReviewRequisitionParams {
  requisitionId: string;
  stage: 'LINE_MANAGER' | 'HR' | 'GM';
  decision: 'APPROVE' | 'REJECT';
  comments?: string;
  reviewerId: string;
  auditCtx: AuditContext;
}

export interface SubmitSurveyParams {
  requisitionId?: string;
  candidateRef?: string;
  hiringManagerId: string;
  roleClarityRating?: number;
  processSpeedRating?: number;
  candidateQualityRating?: number;
  communicationRating?: number;
  overallExperienceRating?: number;
  comments?: string;
  auditCtx: AuditContext;
}

export interface RequestTransferParams {
  employeeId: string;
  proposedDepartmentId: string;
  proposedPositionId: string;
  proposedLocationId?: string;
  proposedManagerId?: string;
  reason: string;
  compensationGradeReviewNotes?: string;
  handoverRequired?: boolean;
  handoverNotes?: string;
  effectiveDate: string;
  leaveBalanceCarryOverPolicy?: string;
  requestedById: string;
  auditCtx: AuditContext;
}

export class WorkforceService {
  constructor(private prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // 1. Staff Requisitions (Form 1)
  // ---------------------------------------------------------------------------

  async createRequisition(params: CreateRequisitionParams) {
    const year = new Date().getFullYear();
    const count = await this.prisma.staffRequisition.count();
    const requisitionNumber = `REQ-${year}-${String(count + 1).padStart(4, '0')}`;

    const requisition = await this.prisma.staffRequisition.create({
      data: {
        requisitionNumber,
        departmentId: params.departmentId,
        positionTitle: params.positionTitle,
        gradeId: params.gradeId,
        locationId: params.locationId,
        headcount: params.headcount || 1,
        reason: params.reason,
        vacancyDuration: params.vacancyDuration,
        proposedStartDate: params.proposedStartDate ? new Date(params.proposedStartDate) : null,
        reportingToPosition: params.reportingToPosition,
        jobDescription: params.jobDescription,
        keyResponsibilities: params.keyResponsibilities,
        requiredSkills: params.requiredSkills,
        objectives: params.objectives,
        teamChallenges: params.teamChallenges,
        budgetContext: params.budgetContext,
        status: 'SUBMITTED',
        currentStage: 'LINE_MANAGER',
        createdById: params.userId,
      },
      include: {
        department: true,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'STAFF_REQUISITION_CREATED',
      targetType: 'StaffRequisition',
      targetId: requisition.id,
      outcome: 'SUCCESS',
      after: {
        requisitionNumber: requisition.requisitionNumber,
        positionTitle: requisition.positionTitle,
        department: requisition.department.name,
      },
    });

    return requisition;
  }

  async reviewRequisition(params: ReviewRequisitionParams) {
    const req = await this.prisma.staffRequisition.findUniqueOrThrow({
      where: { id: params.requisitionId },
    });

    // Maker-Checker Segregation of Duties: Creator cannot approve their own requisition
    if (req.createdById === params.reviewerId) {
      throw forbidden('Maker-Checker Violation: Initiator cannot approve their own staff requisition.');
    }

    if (params.decision === 'REJECT') {
      const rejected = await this.prisma.staffRequisition.update({
        where: { id: req.id },
        data: {
          status: 'REJECTED',
          rejectionReason: params.comments || 'Requisition rejected by reviewer',
        },
      });

      await writeAudit(this.prisma, params.auditCtx, {
        action: 'STAFF_REQUISITION_REJECTED',
        targetType: 'StaffRequisition',
        targetId: rejected.id,
        outcome: 'SUCCESS',
        after: { stage: params.stage, comments: params.comments },
      });

      return rejected;
    }

    // Step through approval chain: LINE_MANAGER -> HR -> GM
    let nextStage = '';
    let nextStatus = '';
    const updateData: any = {};

    if (params.stage === 'LINE_MANAGER') {
      nextStage = 'HR';
      nextStatus = 'LINE_MANAGER_APPROVED';
      updateData.lineManagerApprovedAt = new Date();
      updateData.lineManagerApprovedById = params.reviewerId;
    } else if (params.stage === 'HR') {
      nextStage = 'GM';
      nextStatus = 'HR_APPROVED';
      updateData.hrApprovedAt = new Date();
      updateData.hrApprovedById = params.reviewerId;
    } else if (params.stage === 'GM') {
      nextStage = 'APPROVED';
      nextStatus = 'GM_APPROVED';
      updateData.gmApprovedAt = new Date();
      updateData.gmApprovedById = params.reviewerId;
    }

    updateData.currentStage = nextStage;
    updateData.status = nextStatus;

    const updated = await this.prisma.staffRequisition.update({
      where: { id: req.id },
      data: updateData,
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: `STAFF_REQUISITION_APPROVED_${params.stage}`,
      targetType: 'StaffRequisition',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: { newStatus: nextStatus, nextStage },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // 2. Post-Recruitment Survey (Form 2) & Null-Safe Analytics
  // ---------------------------------------------------------------------------

  async submitRecruitmentSurvey(params: SubmitSurveyParams) {
    const ratings = [
      params.roleClarityRating,
      params.processSpeedRating,
      params.candidateQualityRating,
      params.communicationRating,
      params.overallExperienceRating,
    ];

    for (const r of ratings) {
      if (r !== undefined && r !== null && (r < 1 || r > 5)) {
        throw validation('Survey ratings must be between 1 and 5');
      }
    }

    const survey = await this.prisma.postRecruitmentSurvey.create({
      data: {
        requisitionId: params.requisitionId,
        candidateRef: params.candidateRef || `CAND-${Math.floor(1000 + Math.random() * 9000)}`,
        hiringManagerId: params.hiringManagerId,
        roleClarityRating: params.roleClarityRating,
        processSpeedRating: params.processSpeedRating,
        candidateQualityRating: params.candidateQualityRating,
        communicationRating: params.communicationRating,
        overallExperienceRating: params.overallExperienceRating,
        comments: params.comments,
        privacySafe: true,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'RECRUITMENT_SURVEY_SUBMITTED',
      targetType: 'PostRecruitmentSurvey',
      targetId: survey.id,
      outcome: 'SUCCESS',
      after: { requisitionId: survey.requisitionId, candidateRef: survey.candidateRef },
    });

    return survey;
  }

  async getRecruitmentSurveyMetrics() {
    const surveys = await this.prisma.postRecruitmentSurvey.findMany();

    if (surveys.length === 0) {
      return {
        totalSurveys: 0,
        averageRoleClarity: null,
        averageProcessSpeed: null,
        averageCandidateQuality: null,
        averageCommunication: null,
        averageOverallExperience: null,
        privacySafeComments: [],
      };
    }

    const calcAvg = (getter: (s: any) => number | null | undefined): number | null => {
      const validValues = surveys.map(getter).filter((v): v is number => typeof v === 'number' && !isNaN(v));
      if (validValues.length === 0) return null;
      const sum = validValues.reduce((a, b) => a + b, 0);
      return Math.round((sum / validValues.length) * 100) / 100;
    };

    return {
      totalSurveys: surveys.length,
      averageRoleClarity: calcAvg((s) => s.roleClarityRating),
      averageProcessSpeed: calcAvg((s) => s.processSpeedRating),
      averageCandidateQuality: calcAvg((s) => s.candidateQualityRating),
      averageCommunication: calcAvg((s) => s.communicationRating),
      averageOverallExperience: calcAvg((s) => s.overallExperienceRating),
      privacySafeComments: surveys
        .filter((s) => Boolean(s.comments))
        .map((s) => ({
          candidateRef: s.candidateRef,
          comments: s.comments,
          submittedAt: s.completedAt,
        })),
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Employee Transfer & Blocked Carry-Over Policy Guardrail
  // ---------------------------------------------------------------------------

  async requestTransfer(params: RequestTransferParams) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: params.employeeId },
      include: { department: true, position: true },
    });

    if (!['ACTIVE', 'PROBATION'].includes(employee.status)) {
      throw validation(`Cannot transfer employee with status: ${employee.status}`);
    }

    // MANDATORY POLICY RULE ENFORCEMENT:
    // Transfer leave carry-over rule must be configurable and blocked from activation until legal/HR validation
    // confirms the source policy's five-day cap and treatment of excess balances. Do not forfeit balances automatically!
    if (params.leaveBalanceCarryOverPolicy && params.leaveBalanceCarryOverPolicy.includes('FIVE_DAY_CAP')) {
      throw validation(
        'Transfer leave carry-over 5-day cap rule is pending legal/HR policy validation (D-04). ' +
        'Automatic forfeiture of accrued leave balances is prohibited by Kenya Employment Act §28.'
      );
    }

    const year = new Date().getFullYear();
    const count = await this.prisma.employeeTransfer.count();
    const transferNumber = `TRF-${year}-${String(count + 1).padStart(4, '0')}`;

    const transfer = await this.prisma.employeeTransfer.create({
      data: {
        transferNumber,
        employeeId: employee.id,
        currentDepartmentId: employee.departmentId || '',
        currentPositionId: employee.positionId || '',
        currentLocationId: employee.locationId,
        currentManagerId: employee.managerId,
        proposedDepartmentId: params.proposedDepartmentId,
        proposedPositionId: params.proposedPositionId,
        proposedLocationId: params.proposedLocationId,
        proposedManagerId: params.proposedManagerId,
        reason: params.reason,
        compensationGradeReviewNotes: params.compensationGradeReviewNotes,
        handoverRequired: params.handoverRequired ?? true,
        handoverNotes: params.handoverNotes,
        effectiveDate: new Date(params.effectiveDate),
        leaveBalanceCarryOverPolicy: 'BLOCKED_PENDING_CONFIRMATION',
        status: 'PENDING_APPROVAL',
        createdById: params.requestedById,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'EMPLOYEE_TRANSFER_REQUESTED',
      targetType: 'EmployeeTransfer',
      targetId: transfer.id,
      outcome: 'SUCCESS',
      after: {
        transferNumber: transfer.transferNumber,
        employeeId: transfer.employeeId,
        proposedDepartmentId: transfer.proposedDepartmentId,
        effectiveDate: transfer.effectiveDate,
      },
    });

    return transfer;
  }

  async reviewTransfer(params: {
    transferId: string;
    decision: 'APPROVE' | 'REJECT';
    comments?: string;
    reviewerId: string;
    auditCtx: AuditContext;
  }) {
    const transfer = await this.prisma.employeeTransfer.findUniqueOrThrow({
      where: { id: params.transferId },
      include: { employee: true },
    });

    // Maker-Checker: Submitter cannot approve their own transfer proposal
    if (transfer.createdById === params.reviewerId) {
      throw forbidden('Maker-Checker Violation: Initiator cannot approve their own transfer request.');
    }

    if (params.decision === 'REJECT') {
      const rejected = await this.prisma.employeeTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'REJECTED',
          rejectionReason: params.comments || 'Transfer rejected by authority',
        },
      });

      await writeAudit(this.prisma, params.auditCtx, {
        action: 'EMPLOYEE_TRANSFER_REJECTED',
        targetType: 'EmployeeTransfer',
        targetId: rejected.id,
        outcome: 'SUCCESS',
        after: { comments: params.comments },
      });

      return rejected;
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Approve Transfer
      const approved = await tx.employeeTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: params.reviewerId,
        },
      });

      // 2. If effective date <= now, execute transfer and update Employee
      const isEffectiveNow = new Date(transfer.effectiveDate) <= new Date();
      if (isEffectiveNow) {
        await tx.reportingAssignmentHistory.updateMany({
          where: {
            employeeId: transfer.employeeId,
            effectiveTo: null,
          },
          data: {
            effectiveTo: new Date(),
            reason: `Internal Transfer ${transfer.transferNumber}: ${transfer.reason}`,
          },
        });

        await tx.reportingAssignmentHistory.create({
          data: {
            employeeId: transfer.employeeId,
            departmentId: transfer.proposedDepartmentId,
            positionId: transfer.proposedPositionId,
            managerId: transfer.proposedManagerId,
            effectiveFrom: new Date(),
            reason: `Transfer ${transfer.transferNumber}`,
            changedById: params.reviewerId,
          },
        });

        await tx.employee.update({
          where: { id: transfer.employeeId },
          data: {
            departmentId: transfer.proposedDepartmentId,
            positionId: transfer.proposedPositionId,
            locationId: transfer.proposedLocationId,
            managerId: transfer.proposedManagerId,
          },
        });
      }

      // 3. Create ICT Mover Access Change Task
      const moverRequest = await tx.ictAccessRequest.create({
        data: {
          employeeId: transfer.employeeId,
          requestType: 'MOVER',
          accessProfile: 'DEPARTMENT_TRANSFER',
          roleTitle: 'Transferred Specialist',
          status: 'PENDING',
          requestedById: params.reviewerId,
        },
      });

      await tx.employeeTransfer.update({
        where: { id: transfer.id },
        data: { ictMoverTaskId: moverRequest.id },
      });

      await writeAudit(tx, params.auditCtx, {
        action: 'EMPLOYEE_TRANSFER_APPROVED',
        targetType: 'EmployeeTransfer',
        targetId: approved.id,
        outcome: 'SUCCESS',
        after: {
          transferNumber: approved.transferNumber,
          isEffectiveNow,
          ictMoverTaskId: moverRequest.id,
        },
      });

      return { approved, moverRequest };
    }, { timeout: 15000, maxWait: 10000 });
  }
}
