import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../core/auth/session.js';
import { notFound, conflict, validation, forbidden } from '../../core/errors/errors.js';
import { postLedgerEntry } from './ledger.js';
import { notifyUser, notifyRole } from '../notifications/service.js';

export interface RecordAbsenceInput {
  employeeId: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
  reasonCategory: 'SICKNESS' | 'FAMILY_EMERGENCY' | 'UNNOTIFIED' | 'MEDICAL_APPOINTMENT' | 'OTHER';
  contactChannel: 'PHONE' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'RELATIVE';
  notes?: string | null;
}

export interface ScheduleExceptionInput {
  employeeId: string;
  exceptionType: 'REMOTE_WORK' | 'ROSTER_SHIFT' | 'REST_DAY_SWAP';
  startDate: string;
  endDate: string;
  reason: string;
}

/**
 * Records an unexpected employee absence (D-11).
 * NOTE: Absence is recorded for operational tracking and retrospective leave follow-up.
 * Per the BRS/FRS policy guardrail, absence abandonment does NOT trigger automatic
 * disciplinary sanctions or automatic termination without an investigation/hearing.
 */
export async function recordAbsence(
  prisma: PrismaClient,
  auth: AuthContext,
  input: RecordAbsenceInput,
) {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    include: { manager: { select: { id: true, userId: true } } },
  });
  if (!employee) throw notFound('Employee', input.employeeId);

  const startDate = new Date(input.startDate);
  const endDate = input.endDate ? new Date(input.endDate) : null;

  const absence = await prisma.absenceRecord.create({
    data: {
      employeeId: input.employeeId,
      startDate,
      endDate,
      reasonCategory: input.reasonCategory,
      contactChannel: input.contactChannel,
      reportedBy: auth.email,
      notes: input.notes,
      status: input.reasonCategory === 'UNNOTIFIED' ? 'INVESTIGATION_REQUIRED' : 'RECORDED',
    },
  });

  // Notify manager
  if (employee.manager?.userId) {
    await notifyUser(prisma, employee.manager.userId, {
      title: 'Unexpected Absence Notification',
      message: `${employee.firstName} ${employee.lastName} reported absence (${input.reasonCategory}) starting ${input.startDate}.`,
      deepLink: `/absences/${absence.id}`,
      idempotencyKey: `absence-notif:${absence.id}`,
    });
  }

  return absence;
}

/**
 * Runs monthly leave accrual for active employees on leave types configured for MONTHLY_ACCRUAL.
 * Accrues 1.75 days per month for Annual Leave (21 days / 12 months = 1.75 days/month per Kenya law & D-01).
 */
export async function runMonthlyAccrualJob(prisma: PrismaClient, asOf = new Date()) {
  const leaveYear = asOf.getFullYear();
  const month = asOf.getMonth() + 1; // 1-12

  const accruableTypes = await prisma.leaveType.findMany({
    where: {
      isActive: true,
      accrualMethod: 'MONTHLY_ACCRUAL',
    },
  });

  const activeEmployees = await prisma.employee.findMany({
    where: {
      status: { in: ['ACTIVE', 'PROBATION', 'ONBOARDING'] },
      isActive: true,
    },
  });

  let accrualsPosted = 0;

  for (const lt of accruableTypes) {
    // Default accrual rate: defaultEntitlementDays / 12, or statutory floor / 12
    const annualDays = lt.defaultEntitlementDays || lt.statutoryFloorDays || 21.0;
    const monthlyRate = Math.round((annualDays / 12) * 100) / 100;

    for (const emp of activeEmployees) {
      const sourceId = `accrual:${emp.id}:${lt.id}:${leaveYear}:${month}`;

      // Check if already accrued for this month
      const existing = await prisma.leaveLedgerEntry.findFirst({
        where: {
          sourceType: 'ACCRUAL_JOB',
          sourceId,
        },
      });

      if (!existing) {
        await prisma.$transaction(async (tx) => {
          await postLedgerEntry(tx, {
            employeeId: emp.id,
            leaveTypeId: lt.id,
            leaveYear,
            entryType: 'ACCRUAL',
            amountDays: monthlyRate,
            sourceType: 'ACCRUAL_JOB',
            sourceId,
            notes: `Monthly accrual for ${asOf.toLocaleString('default', { month: 'long' })} ${leaveYear} (${monthlyRate} days @ ${annualDays} days/yr)`,
            actorUserId: 'SYSTEM_ACCRUAL_JOB',
          });
        });
        accrualsPosted++;
      }
    }
  }

  return { accrualsPosted, leaveYear, month };
}
