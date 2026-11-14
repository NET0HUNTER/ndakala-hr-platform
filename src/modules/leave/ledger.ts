import type { Prisma, PrismaClient } from '@prisma/client';
import { conflict, notFound, validation } from '../../core/errors/errors.js';

export type Db = PrismaClient | Prisma.TransactionClient;

export type LedgerEntryType =
  | 'OPENING_BALANCE'
  | 'ACCRUAL'
  | 'LEAVE_TAKEN'
  | 'ADJUSTMENT'
  | 'REVERSAL'
  | 'CARRY_FORWARD'
  | 'EXPIRY'
  | 'ENCASHMENT';

export interface PostLedgerInput {
  employeeId: string;
  leaveTypeId: string;
  leaveYear: number;
  entryType: LedgerEntryType;
  amountDays: number; // positive = credit, negative = debit
  sourceType: 'LEAVE_REQUEST' | 'ACCRUAL_JOB' | 'MANUAL_ADJUSTMENT' | 'YEAR_END_CLOSE';
  sourceId?: string | null;
  policyVersionId?: string | null;
  notes?: string | null;
  calculationDetails?: Record<string, unknown> | null;
  actorUserId: string;
}

export interface ReversalInput {
  ledgerEntryId: string;
  reason: string;
  actorUserId: string;
}

export interface BalanceReconciliation {
  employeeId: string;
  leaveTypeId: string;
  leaveYear: number;
  ledgerSum: number;
  projectedClosingBalance: number;
  difference: number;
  isReconciled: boolean;
  entryCount: number;
}

/**
 * Posts an immutable, append-only entry to LeaveLedgerEntry and atomically
 * updates the materialised LeaveBalance projection.
 *
 * Invariants:
 * 1. Posted ledger entries are NEVER edited or deleted.
 * 2. Running balance reflects the exact running cumulative sum of amountDays.
 * 3. Negative balances are rejected unless explicitly allowed by leave type configuration.
 */
export async function postLedgerEntry(db: Db, input: PostLedgerInput) {
  const leaveType = await db.leaveType.findUnique({
    where: { id: input.leaveTypeId },
  });
  if (!leaveType) throw notFound('LeaveType', input.leaveTypeId);

  // Fetch or initialize the LeaveBalance for this employee, leave type, and year
  let balance = await db.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_leaveYear: {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        leaveYear: input.leaveYear,
      },
    },
  });

  if (!balance) {
    balance = await db.leaveBalance.create({
      data: {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        leaveYear: input.leaveYear,
        entitlementDays: 0,
        accruedDays: 0,
        takenDays: 0,
        pendingReservedDays: 0,
        adjustedDays: 0,
        carriedForwardDays: 0,
        closingBalanceDays: 0,
      },
    });
  }

  const currentClosing = balance.closingBalanceDays;
  const newClosing = currentClosing + input.amountDays;

  // Enforce negative balance policy guardrail
  if (newClosing < 0) {
    const isAllowed = leaveType.negativeBalancePolicy === 'ALLOWED_WITH_LIMIT';
    const limit = leaveType.maxNegativeBalanceDays || 0;
    if (!isAllowed || Math.abs(newClosing) > limit) {
      throw validation(
        `Leave ledger policy violation: Insufficient balance. Requested deduction would result in balance (${newClosing.toFixed(
          2,
        )} days). Minimum permitted balance: -${limit.toFixed(2)} days.`,
      );
    }
  }

  // Round days to 2 decimal places to avoid floating point drift
  const roundedAmount = Math.round(input.amountDays * 100) / 100;
  const roundedRunning = Math.round(newClosing * 100) / 100;

  // 1. Append immutable row to LeaveLedgerEntry
  const entry = await db.leaveLedgerEntry.create({
    data: {
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      leaveYear: input.leaveYear,
      entryType: input.entryType,
      amountDays: roundedAmount,
      runningBalanceDays: roundedRunning,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      policyVersionId: input.policyVersionId ?? null,
      notes: input.notes ?? null,
      calculationDetails: input.calculationDetails ? JSON.stringify(input.calculationDetails) : null,
      actorUserId: input.actorUserId,
    },
  });

  // 2. Update materialised LeaveBalance columns
  const updates: Record<string, unknown> = {
    closingBalanceDays: roundedRunning,
  };

  switch (input.entryType) {
    case 'OPENING_BALANCE':
      updates.entitlementDays = { increment: roundedAmount };
      break;
    case 'ACCRUAL':
      updates.accruedDays = { increment: roundedAmount };
      break;
    case 'LEAVE_TAKEN':
      // amountDays is negative for taken leave
      updates.takenDays = { increment: Math.abs(roundedAmount) };
      break;
    case 'ADJUSTMENT':
    case 'REVERSAL':
      updates.adjustedDays = { increment: roundedAmount };
      break;
    case 'CARRY_FORWARD':
      updates.carriedForwardDays = { increment: roundedAmount };
      break;
    case 'EXPIRY':
    case 'ENCASHMENT':
      updates.adjustedDays = { increment: roundedAmount }; // Deductions
      break;
  }

  const updatedBalance = await db.leaveBalance.update({
    where: { id: balance.id },
    data: updates as any,
  });

  return { entry, balance: updatedBalance };
}

/**
 * Reverses a previously posted ledger entry by appending an equal and opposite REVERSAL entry.
 * Guarantees that historical posted records remain strictly immutable.
 */
export async function reverseLedgerEntry(db: Db, input: ReversalInput) {
  const original = await db.leaveLedgerEntry.findUnique({
    where: { id: input.ledgerEntryId },
  });
  if (!original) throw notFound('LeaveLedgerEntry', input.ledgerEntryId);

  if (original.entryType === 'REVERSAL') {
    throw conflict('Cannot reverse a ledger entry that is already a reversal');
  }

  // Check if already reversed
  const existingReversal = await db.leaveLedgerEntry.findFirst({
    where: {
      sourceType: original.sourceType,
      sourceId: original.id,
      entryType: 'REVERSAL',
    },
  });
  if (existingReversal) {
    throw conflict(`Ledger entry '${original.id}' has already been reversed by entry '${existingReversal.id}'`);
  }

  // Reverse amount: if original was -5.0 (taken), reversal is +5.0 (credit back)
  const reversalAmount = -original.amountDays;

  return postLedgerEntry(db, {
    employeeId: original.employeeId,
    leaveTypeId: original.leaveTypeId,
    leaveYear: original.leaveYear,
    entryType: 'REVERSAL',
    amountDays: reversalAmount,
    sourceType: original.sourceType as any,
    sourceId: original.id,
    notes: `Reversal of entry ${original.id}. Reason: ${input.reason}`,
    actorUserId: input.actorUserId,
  });
}

/**
 * Reconciles LeaveBalance projections against the authoritative LeaveLedgerEntry ledger.
 * Sums all posted entries and checks against closingBalanceDays.
 */
export async function reconcileLeaveBalances(
  db: Db,
  employeeId: string,
  leaveYear: number,
  leaveTypeId?: string,
): Promise<BalanceReconciliation[]> {
  const whereType: any = { employeeId, leaveYear };
  if (leaveTypeId) whereType.leaveTypeId = leaveTypeId;

  const balances = await db.leaveBalance.findMany({
    where: whereType,
    include: { leaveType: { select: { code: true, name: true } } },
  });

  const reconciliations: BalanceReconciliation[] = [];

  for (const b of balances) {
    const entries = await db.leaveLedgerEntry.findMany({
      where: {
        employeeId: b.employeeId,
        leaveTypeId: b.leaveTypeId,
        leaveYear: b.leaveYear,
      },
    });

    const sum = entries.reduce((acc, e) => acc + e.amountDays, 0);
    const roundedSum = Math.round(sum * 100) / 100;
    const diff = Math.round(Math.abs(roundedSum - b.closingBalanceDays) * 100) / 100;

    reconciliations.push({
      employeeId: b.employeeId,
      leaveTypeId: b.leaveTypeId,
      leaveYear: b.leaveYear,
      ledgerSum: roundedSum,
      projectedClosingBalance: b.closingBalanceDays,
      difference: diff,
      isReconciled: diff === 0,
      entryCount: entries.length,
    });
  }

  return reconciliations;
}
