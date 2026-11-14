import { PrismaClient } from '@prisma/client';
import { writeAudit, type AuditContext } from '../../core/audit/audit.js';
import { forbidden, validation, conflict } from '../../core/errors/errors.js';

export interface InitiateSeparationParams {
  employeeId: string;
  triggerType: string;
  reason: string;
  sensitiveReasonCategory?: string;
  noticeDate: string;
  intendedLastDay: string;
  effectiveDate: string;
  noticeServedDays: number;
  noticeRequiredDays?: number;
  noticeWaived?: boolean;
  payInLieuOfNotice?: boolean;
  initiatorUserId: string;
  auditCtx: AuditContext;
}

export interface UpdateClearanceItemParams {
  separationId: string;
  clearanceItemId: string;
  isCompleted: boolean;
  hasFinancialDeduction?: boolean;
  proposedDeductionAmount?: number;
  deductionLawfulBasis?: string;
  deductionApproved?: boolean;
  notes?: string;
  actorUserId: string;
  auditCtx: AuditContext;
}

export interface ConductExitInterviewParams {
  separationId: string;
  primaryReason: string;
  cultureRating?: number;
  managementRating?: number;
  compensationRating?: number;
  confidentialComments: string;
  interviewerUserId: string;
  auditCtx: AuditContext;
}

export class SeparationService {
  constructor(private prisma: PrismaClient) {}

  async initiateSeparation(params: InitiateSeparationParams) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: params.employeeId },
      include: {
        leaveBalances: {
          include: { leaveType: true },
        },
      },
    });

    const existing = await this.prisma.employeeSeparation.findUnique({
      where: { employeeId: employee.id },
    });
    if (existing && existing.status !== 'INITIATED') {
      throw conflict(`Separation process already active for employee ${employee.employeeNumber}`);
    }

    const annualBalance = employee.leaveBalances.find(
      (b) => b.leaveType.code === 'ANNUAL' && b.leaveYear === new Date().getFullYear()
    );
    const accruedDays = annualBalance ? Math.max(0, annualBalance.closingBalanceDays - annualBalance.pendingReservedDays) : 0.0;

    return await this.prisma.$transaction(async (tx) => {
      const separation = await tx.employeeSeparation.upsert({
        where: { employeeId: employee.id },
        create: {
          employeeId: employee.id,
          triggerType: params.triggerType,
          reason: params.reason,
          sensitiveReasonCategory: params.sensitiveReasonCategory,
          noticeDate: new Date(params.noticeDate),
          intendedLastDay: new Date(params.intendedLastDay),
          effectiveDate: new Date(params.effectiveDate),
          noticeServedDays: params.noticeServedDays,
          noticeRequiredDays: params.noticeRequiredDays,
          noticeWaived: params.noticeWaived ?? false,
          payInLieuOfNotice: params.payInLieuOfNotice ?? false,
          status: 'CLEARANCE_IN_PROGRESS',
          accruedLeaveDaysPayable: accruedDays,
          createdById: params.initiatorUserId,
        },
        update: {
          triggerType: params.triggerType,
          reason: params.reason,
          effectiveDate: new Date(params.effectiveDate),
          status: 'CLEARANCE_IN_PROGRESS',
          accruedLeaveDaysPayable: accruedDays,
        },
      });

      const checklistDefs = [
        { role: 'EMPLOYEE', key: 'RETURN_BADGE_KEYS', desc: 'Return physical security pass, office keys, and parking access transponder' },
        { role: 'EMPLOYEE', key: 'HANDOVER_NOTES', desc: 'Complete client engagement handover notes and submit file repository index' },
        { role: 'LINE_MANAGER', key: 'CLIENT_TRANSITION', desc: 'Confirm client portfolio, billing accounts, and ongoing engagements successfully transitioned' },
        { role: 'LINE_MANAGER', key: 'SIGNOFF', desc: 'Verify work handover completion and approve departmental release' },
        { role: 'ICT', key: 'DEACTIVATE_ACCESS', desc: 'Revoke Microsoft 365, email, VPN, client portals, and cloud tenant access' },
        { role: 'ICT', key: 'HARDWARE_RETURN', desc: 'Collect and verify company laptop, monitors, and perform remote mobile device wipe' },
        { role: 'FINANCE', key: 'SETTLE_IMPREST', desc: 'Verify complete settlement of petty cash, client disbursements, and outstanding travel advances' },
        { role: 'FINANCE', key: 'CORPORATE_CARD', desc: 'Collect, cancel, and reconcile corporate credit cards' },
        { role: 'HR', key: 'EXIT_INTERVIEW', desc: 'Conduct confidential exit interview and record feedback' },
        { role: 'HR', key: 'CERTIFICATE_SERVICE', desc: 'Prepare statutory Certificate of Service (Kenya Employment Act 2007 §51)' },
        { role: 'HR', key: 'FINAL_DUES_REVIEW', desc: 'Review accrued annual leave payout and final statutory payroll dues' },
      ];

      await tx.separationClearanceItem.createMany({
        data: checklistDefs.map((item) => ({
          separationId: separation.id,
          departmentRole: item.role,
          itemKey: item.key,
          description: item.desc,
          isCompleted: false,
        })),
      });

      await writeAudit(tx, params.auditCtx, {
        action: 'EMPLOYEE_SEPARATION_INITIATED',
        targetType: 'EmployeeSeparation',
        targetId: separation.id,
        outcome: 'SUCCESS',
        after: {
          employeeNumber: employee.employeeNumber,
          triggerType: separation.triggerType,
          effectiveDate: separation.effectiveDate,
          accruedLeavePayable: separation.accruedLeaveDaysPayable,
        },
      });

      return separation;
    }, { timeout: 15000, maxWait: 10000 });
  }

  async updateClearanceItem(params: UpdateClearanceItemParams) {
    const item = await this.prisma.separationClearanceItem.findUniqueOrThrow({
      where: { id: params.clearanceItemId },
      include: { separation: { include: { employee: true } } },
    });

    // MANDATORY POLICY RULE ENFORCEMENT:
    // Clearance tracks assets and accountability. It MUST NOT automatically block earned wages or statutory dues.
    // Any deduction/recovery requires lawful basis, evidence, approval and payroll review.
    if (params.hasFinancialDeduction && (!params.deductionLawfulBasis || params.deductionLawfulBasis.trim().length === 0)) {
      throw validation(
        'PolicyViolationError: Proposed clearance deduction requires a documented lawful basis (e.g. unreturned hardware agreement) and cannot automatically withhold statutory earned dues.'
      );
    }

    const updated = await this.prisma.separationClearanceItem.update({
      where: { id: item.id },
      data: {
        isCompleted: params.isCompleted,
        completedAt: params.isCompleted ? new Date() : null,
        completedById: params.isCompleted ? params.actorUserId : null,
        hasFinancialDeduction: params.hasFinancialDeduction ?? item.hasFinancialDeduction,
        proposedDeductionAmount: params.proposedDeductionAmount ?? item.proposedDeductionAmount,
        deductionLawfulBasis: params.deductionLawfulBasis ?? item.deductionLawfulBasis,
        deductionApproved: params.deductionApproved ?? item.deductionApproved,
        notes: params.notes ?? item.notes,
      },
    });

    const remaining = await this.prisma.separationClearanceItem.count({
      where: {
        separationId: item.separationId,
        isCompleted: false,
      },
    });

    if (remaining === 0) {
      await this.prisma.employeeSeparation.update({
        where: { id: item.separationId },
        data: { status: 'CLEARANCE_COMPLETE' },
      });
    }

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'SEPARATION_CLEARANCE_ITEM_UPDATED',
      targetType: 'SeparationClearanceItem',
      targetId: updated.id,
      outcome: 'SUCCESS',
      after: {
        itemKey: updated.itemKey,
        isCompleted: updated.isCompleted,
        hasDeduction: updated.hasFinancialDeduction,
        remainingIncomplete: remaining,
      },
    });

    return updated;
  }

  async conductExitInterview(params: ConductExitInterviewParams) {
    const separation = await this.prisma.employeeSeparation.findUniqueOrThrow({
      where: { id: params.separationId },
    });

    const interview = await this.prisma.exitInterview.upsert({
      where: { separationId: separation.id },
      create: {
        separationId: separation.id,
        conductedById: params.interviewerUserId,
        primaryReason: params.primaryReason,
        cultureRating: params.cultureRating,
        managementRating: params.managementRating,
        compensationRating: params.compensationRating,
        confidentialComments: params.confidentialComments,
        isRestricted: true,
      },
      update: {
        primaryReason: params.primaryReason,
        cultureRating: params.cultureRating,
        managementRating: params.managementRating,
        compensationRating: params.compensationRating,
        confidentialComments: params.confidentialComments,
      },
    });

    await this.prisma.separationClearanceItem.updateMany({
      where: {
        separationId: separation.id,
        itemKey: 'EXIT_INTERVIEW',
      },
      data: {
        isCompleted: true,
        completedAt: new Date(),
        completedById: params.interviewerUserId,
      },
    });

    await writeAudit(this.prisma, params.auditCtx, {
      action: 'EXIT_INTERVIEW_RECORDED',
      targetType: 'ExitInterview',
      targetId: interview.id,
      outcome: 'SUCCESS',
      after: {
        separationId: interview.separationId,
        primaryReason: interview.primaryReason,
        isRestricted: true,
      },
    });

    return interview;
  }

  async finalizeSeparation(params: {
    separationId: string;
    approverUserId: string;
    auditCtx: AuditContext;
  }) {
    const separation = await this.prisma.employeeSeparation.findUniqueOrThrow({
      where: { id: params.separationId },
      include: {
        employee: true,
        clearanceItems: true,
      },
    });

    const incomplete = separation.clearanceItems.filter((i) => !i.isCompleted);
    if (incomplete.length > 0) {
      throw validation(
        `Cannot finalize separation: ${incomplete.length} clearance items remain incomplete (${incomplete.map((i) => i.itemKey).join(', ')}).`
      );
    }

    const year = new Date().getFullYear();
    const count = await this.prisma.employeeSeparation.count({ where: { certificateOfServiceIssued: true } });
    const certificateNumber = `COS-${year}-${String(count + 1).padStart(4, '0')}`;

    return await this.prisma.$transaction(async (tx) => {
      const finalized = await tx.employeeSeparation.update({
        where: { id: separation.id },
        data: {
          status: 'EXITED',
          finalDuesApproved: true,
          payrollReviewedAt: new Date(),
          certificateOfServiceIssued: true,
          certificateNumber,
        },
      });

      // Update employee lifecycle status: Deactivate without deletion!
      await tx.employee.update({
        where: { id: separation.employeeId },
        data: {
          status: 'RESIGNED',
          isActive: false,
          deactivatedAt: new Date(),
          deactivationReason: `Separation completed: ${separation.triggerType} (${certificateNumber})`,
        },
      });

      await tx.reportingAssignmentHistory.updateMany({
        where: {
          employeeId: separation.employeeId,
          effectiveTo: null,
        },
        data: {
          effectiveTo: new Date(),
          reason: `Separation complete (${separation.triggerType})`,
        },
      });

      await tx.lifecycleEvent.create({
        data: {
          employeeId: separation.employeeId,
          eventType: 'EMPLOYEE_DEACTIVATED',
          effectiveDate: new Date(),
          sourceType: 'SEPARATION',
          sourceId: separation.id,
          actorUserId: params.approverUserId,
          reason: `Separation completed: ${separation.triggerType} (${certificateNumber})`,
          payload: JSON.stringify({
            triggerType: separation.triggerType,
            certificateNumber,
            effectiveDate: separation.effectiveDate,
          }),
        },
      });

      await writeAudit(tx, params.auditCtx, {
        action: 'EMPLOYEE_SEPARATION_FINALIZED',
        targetType: 'EmployeeSeparation',
        targetId: finalized.id,
        outcome: 'SUCCESS',
        after: {
          employeeNumber: separation.employee.employeeNumber,
          status: 'EXITED',
          certificateNumber,
          employeePreserved: true,
        },
      });

      return finalized;
    });
  }
}
