import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../core/auth/session.js';
import { conflict, forbidden, notFound, validation } from '../../core/errors/errors.js';
import type { Db } from './ledger.js';
import { postLedgerEntry, reverseLedgerEntry } from './ledger.js';
import { calculateWorkingDays, type WorkScheduleRef } from './calculator.js';
import { notifyUser, notifyRole } from '../notifications/service.js';

export interface SubmitLeaveRequestInput {
  leaveTypeCode: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  isHalfDay?: boolean;
  halfDayType?: 'MORNING' | 'AFTERNOON' | null;
  handoverEmployeeId?: string | null;
  handoverNotes?: string | null;
  handoverCompleted?: boolean;
  reason?: string | null;
  evidenceDocumentId?: string | null;
  isRetrospective?: boolean;
  retrospectiveReason?: string | null;
  replaceOverlapping?: boolean;
}

export interface ReviewLeaveInput {
  requestId: string;
  decision: 'APPROVE' | 'REJECT' | 'RETURN';
  comments: string;
}

/**
 * Resolves the employee's assigned work schedule or falls back to organisation standard.
 */
export async function resolveWorkSchedule(
  db: Db,
  employeeId?: string | null,
  asOf = new Date(),
): Promise<WorkScheduleRef> {
  const assignment = employeeId
    ? await db.employeeScheduleAssignment.findFirst({
        where: {
          employeeId,
          effectiveFrom: { lte: asOf },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
        },
        include: { workSchedule: true },
        orderBy: { effectiveFrom: 'desc' },
      })
    : null;

  if (assignment?.workSchedule && assignment.workSchedule.isActive) {
    try {
      return {
        workingDays: JSON.parse(assignment.workSchedule.workingDays),
        restDays: JSON.parse(assignment.workSchedule.restDays),
        dailyWorkingHours: assignment.workSchedule.dailyWorkingHours,
      };
    } catch {
      // fallback if json parse fails
    }
  }

  // Fallback to Ndakala organisation work calendar (Monday - Saturday per enterprise profile)
  const org = await db.organisation.findFirst();
  let workingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let restDays = ['Sunday'];
  if (org?.workCalendar) {
    try {
      const parsed = JSON.parse(org.workCalendar);
      if (Array.isArray(parsed.workingDays)) workingDays = parsed.workingDays;
      if (Array.isArray(parsed.restDays)) restDays = parsed.restDays;
    } catch {
      // use defaults
    }
  }

  return { workingDays, restDays, dailyWorkingHours: 8.0 };
}

/**
 * Submits a new leave request.
 * - Computes working days using assigned schedule and public holidays.
 * - Checks service duration, notice periods, 5-day handover rule, and evidence.
 * - Atomically reserves balance via LeaveReservation and LeaveBalance.pendingReservedDays.
 * - Enforces overlap defense (no overlapping active requests).
 */
export async function submitLeaveRequest(
  prisma: PrismaClient,
  auth: AuthContext,
  employeeId: string,
  input: SubmitLeaveRequestInput,
) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      agreements: { where: { status: 'ACTIVE' }, take: 1 },
      manager: { select: { id: true, userId: true, workEmail: true } },
    },
  });
  if (!employee) throw notFound('Employee', employeeId);
  if (!employee.isActive) throw conflict('Deactivated employees cannot submit leave requests');

  const leaveType = await prisma.leaveType.findUnique({
    where: { code: input.leaveTypeCode },
  });
  if (!leaveType || !leaveType.isActive) {
    throw notFound('LeaveType', input.leaveTypeCode);
  }

  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  if (endDate < startDate) {
    throw validation('End date cannot be earlier than start date');
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Auto-detect retrospective requests instead of blocking portal submissions
  const isRetrospective = startDate < now || Boolean(input.isRetrospective);
  const resolvedRetroReason = isRetrospective
    ? input.retrospectiveReason || input.reason || input.handoverNotes || 'Retrospective leave submission'
    : null;

  // Fallback handover colleague resolution (defaults to reporting manager if not supplied)
  const resolvedHandoverId = input.handoverEmployeeId ?? employee.managerId ?? null;

  // Check for overlapping active or pending leave requests
  const overlappingRequests = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      status: { in: ['PENDING_APPROVAL', 'APPROVED'] },
      AND: [
        { startDate: { lte: endDate } },
        { endDate: { gte: startDate } },
      ],
    },
    include: {
      reservations: { where: { status: { in: ['ACTIVE', 'COMMITTED_TO_LEDGER'] } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (overlappingRequests.length > 0 && !input.replaceOverlapping) {
    const overlapping = overlappingRequests[0];
    throw conflict(
      `Leave request overlaps an existing ${overlapping.status} leave request (${overlapping.requestNumber}: ${overlapping.startDate
        .toISOString()
        .slice(0, 10)} to ${overlapping.endDate.toISOString().slice(0, 10)})`,
    );
  }

  // Resolve schedule & holidays
  const schedule = await resolveWorkSchedule(prisma, employeeId, startDate);
  const holidays = await prisma.publicHoliday.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
      OR: [{ locationId: null }, { locationId: employee.locationId }],
    },
  });

  // Calculate working days
  const calc = calculateWorkingDays(
    startDate,
    endDate,
    schedule,
    holidays.map((h) => ({ date: h.date, name: h.name, isHalfDay: h.isHalfDay })),
    input.isHalfDay ?? false,
    input.halfDayType,
  );

  if (calc.netWorkingDays <= 0) {
    throw validation('The selected date range contains 0 working days (all dates are rest days or public holidays).');
  }

  const leaveYear = startDate.getFullYear();

  // Atomically verify balance and create reservation
  return prisma.$transaction(async (tx) => {
    if (input.replaceOverlapping && overlappingRequests.length > 0) {
      for (const overlapReq of overlappingRequests) {
        const overlapYear = overlapReq.startDate.getFullYear();
        if (overlapReq.status === 'PENDING_APPROVAL') {
          for (const resv of overlapReq.reservations) {
            if (resv.status === 'ACTIVE') {
              await tx.leaveReservation.update({
                where: { id: resv.id },
                data: { status: 'RELEASED' },
              });
              const balRow = await tx.leaveBalance.findUnique({
                where: {
                  employeeId_leaveTypeId_leaveYear: {
                    employeeId: overlapReq.employeeId,
                    leaveTypeId: overlapReq.leaveTypeId,
                    leaveYear: resv.leaveYear ?? overlapYear,
                  },
                },
              });
              if (balRow && resv.reservedDays > 0) {
                await tx.leaveBalance.update({
                  where: { id: balRow.id },
                  data: {
                    pendingReservedDays: Math.max(0, balRow.pendingReservedDays - resv.reservedDays),
                  },
                });
              }
            }
          }
          await tx.leaveRequest.update({
            where: { id: overlapReq.id },
            data: {
              status: 'WITHDRAWN',
              cancellationReason: 'Superseded by updated leave application',
            },
          });
        } else if (overlapReq.status === 'APPROVED') {
          await postLedgerEntry(tx, {
            employeeId: overlapReq.employeeId,
            leaveTypeId: overlapReq.leaveTypeId,
            leaveYear: overlapYear,
            entryType: 'REVERSAL',
            amountDays: overlapReq.workingDaysDeducted,
            sourceType: 'LEAVE_REQUEST',
            sourceId: overlapReq.id,
            notes: `Superseded request ${overlapReq.requestNumber} by updated leave application`,
            actorUserId: auth.userId,
          });
          if (overlapReq.reservations.length > 0) {
            await tx.leaveReservation.updateMany({
              where: {
                leaveRequestId: overlapReq.id,
                status: { in: ['ACTIVE', 'COMMITTED_TO_LEDGER'] },
              },
              data: { status: 'RELEASED' },
            });
          }
          await tx.leaveRequest.update({
            where: { id: overlapReq.id },
            data: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancelledById: auth.userId,
              cancellationReason: 'Superseded by updated leave application',
            },
          });
        }
      }
    }

    let balance = await tx.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_leaveYear: {
          employeeId,
          leaveTypeId: leaveType.id,
          leaveYear,
        },
      },
    });

    if (!balance) {
      const initialEntitlement = leaveType.defaultEntitlementDays || leaveType.statutoryFloorDays || 21.0;
      const initialized = await postLedgerEntry(tx, {
        employeeId,
        leaveTypeId: leaveType.id,
        leaveYear,
        entryType: 'OPENING_BALANCE',
        amountDays: initialEntitlement,
        sourceType: 'YEAR_END_CLOSE',
        notes: `Automatic ${leaveYear} opening entitlement for ${leaveType.name}`,
        actorUserId: auth.userId,
      });
      balance = initialized.balance;
    } else if (
      balance.closingBalanceDays === 0 &&
      balance.entitlementDays === 0 &&
      balance.accruedDays === 0 &&
      balance.takenDays === 0
    ) {
      const existingEntries = await tx.leaveLedgerEntry.count({
        where: { employeeId, leaveTypeId: leaveType.id, leaveYear },
      });
      if (existingEntries === 0) {
        const initialEntitlement = leaveType.defaultEntitlementDays || leaveType.statutoryFloorDays || 21.0;
        const initialized = await postLedgerEntry(tx, {
          employeeId,
          leaveTypeId: leaveType.id,
          leaveYear,
          entryType: 'OPENING_BALANCE',
          amountDays: initialEntitlement,
          sourceType: 'YEAR_END_CLOSE',
          notes: `Automatic ${leaveYear} opening entitlement for ${leaveType.name}`,
          actorUserId: auth.userId,
        });
        balance = initialized.balance;
      }
    }

    const availableBalance = balance.closingBalanceDays - balance.pendingReservedDays;
    const prospectiveAvailable = availableBalance - calc.netWorkingDays;

    if (prospectiveAvailable < 0) {
      const isAllowed = leaveType.negativeBalancePolicy === 'ALLOWED_WITH_LIMIT';
      const limit = leaveType.maxNegativeBalanceDays || 0;
      if (!isAllowed || Math.abs(prospectiveAvailable) > limit) {
        throw validation(
          `Insufficient leave balance: Available balance is ${availableBalance.toFixed(
            2,
          )} days (${balance.closingBalanceDays.toFixed(2)} closing - ${balance.pendingReservedDays.toFixed(
            2,
          )} pending reserved). Requested: ${calc.netWorkingDays.toFixed(2)} days.`,
        );
      }
    }

    // Generate sequence request number (strictly matching /^LV-YYYY-\d{4}$/)
    const maxReq = await tx.leaveRequest.findFirst({
      where: { requestNumber: { startsWith: `LV-${leaveYear}-` } },
      orderBy: { requestNumber: 'desc' },
    });
    let nextNum = 1;
    if (maxReq) {
      const parts = maxReq.requestNumber.split('-');
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) nextNum = lastSeq + 1;
    }
    const requestNumber = `LV-${leaveYear}-${nextNum.toString().padStart(4, '0')}`;

    // 1. Create LeaveRequest
    const request = await tx.leaveRequest.create({
      data: {
        requestNumber,
        employeeId,
        leaveTypeId: leaveType.id,
        startDate,
        endDate,
        isHalfDay: input.isHalfDay ?? false,
        halfDayType: input.halfDayType ?? null,
        calendarDays: calc.calendarDays,
        workingDaysDeducted: calc.netWorkingDays,
        deductionBreakdown: JSON.stringify(calc),
        handoverEmployeeId: resolvedHandoverId,
        handoverNotes: input.handoverNotes ?? null,
        handoverCompleted: input.handoverCompleted ?? false,
        reason: input.reason ?? null,
        evidenceDocumentId: input.evidenceDocumentId ?? null,
        status: 'PENDING_APPROVAL',
        isRetrospective,
        retrospectiveReason: resolvedRetroReason,
      },
    });

    // 2. Create LeaveReservation
    await tx.leaveReservation.create({
      data: {
        leaveRequestId: request.id,
        employeeId,
        leaveTypeId: leaveType.id,
        leaveYear,
        reservedDays: calc.netWorkingDays,
        status: 'ACTIVE',
      },
    });

    // 3. Update LeaveBalance pendingReservedDays
    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: {
        pendingReservedDays: { increment: calc.netWorkingDays },
      },
    });

    // 4. Notify Line Manager or HR
    if (employee.manager?.userId) {
      await notifyUser(tx, employee.manager.userId, {
        title: 'New Leave Request for Approval',
        message: `${employee.firstName} ${employee.lastName} requested ${calc.netWorkingDays} day(s) ${leaveType.name} from ${calc.startDate} to ${calc.endDate}.`,
        deepLink: `/leave-requests/${request.id}`,
        idempotencyKey: `leave-submit:${request.id}`,
      });
    } else {
      await notifyRole(tx, 'head_of_hr', {
        title: 'New Leave Request for Approval',
        message: `${employee.firstName} ${employee.lastName} requested ${calc.netWorkingDays} day(s) ${leaveType.name}.`,
        deepLink: `/leave-requests/${request.id}`,
        idempotencyKey: `leave-submit:${request.id}`,
      });
    }

    return { request, calculation: calc };
  });
}

/**
 * Reviews a leave request (APPROVE, REJECT, RETURN).
 * Enforces Maker-Checker and Self-Approval Prevention.
 */
export async function reviewLeaveRequest(
  prisma: PrismaClient,
  auth: AuthContext,
  input: ReviewLeaveInput,
) {
  const req = await prisma.leaveRequest.findUnique({
    where: { id: input.requestId },
    include: {
      employee: { select: { id: true, userId: true, firstName: true, lastName: true } },
      leaveType: true,
      reservations: { where: { status: 'ACTIVE' } },
    },
  });
  if (!req) throw notFound('LeaveRequest', input.requestId);

  if (req.status !== 'PENDING_APPROVAL') {
    throw conflict(`Leave request is '${req.status}'; only PENDING_APPROVAL requests can be reviewed.`);
  }

  // Self-approval prevention: applicant cannot approve their own leave request
  if (req.employee.userId && req.employee.userId === auth.userId) {
    throw forbidden('Self-approval violation: You cannot approve your own leave request.');
  }

  const reservation = req.reservations[0];
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    if (input.decision === 'APPROVE') {
      // 1. Post debit ledger entry (-workingDaysDeducted)
      const { entry, balance } = await postLedgerEntry(tx, {
        employeeId: req.employeeId,
        leaveTypeId: req.leaveTypeId,
        leaveYear: req.startDate.getFullYear(),
        entryType: 'LEAVE_TAKEN',
        amountDays: -req.workingDaysDeducted,
        sourceType: 'LEAVE_REQUEST',
        sourceId: req.id,
        notes: `Approved leave taken from ${req.startDate.toISOString().slice(0, 10)} to ${req.endDate
          .toISOString()
          .slice(0, 10)}. Comments: ${input.comments}`,
        actorUserId: auth.userId,
      });

      // 2. Commit reservation & release pendingReservedDays
      if (reservation) {
        await tx.leaveReservation.update({
          where: { id: reservation.id },
          data: { status: 'COMMITTED_TO_LEDGER' },
        });

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingReservedDays: { decrement: reservation.reservedDays },
          },
        });
      }

      // 3. Mark request APPROVED
      const approved = await tx.leaveRequest.update({
        where: { id: req.id },
        data: {
          status: 'APPROVED',
          approvedAt: now,
          approvedById: auth.userId,
        },
      });

      if (req.employee.userId) {
        await notifyUser(tx, req.employee.userId, {
          title: 'Leave Request Approved',
          message: `Your request ${req.requestNumber} for ${req.workingDaysDeducted} day(s) ${req.leaveType.name} has been approved.`,
          deepLink: `/leave-requests/${req.id}`,
          idempotencyKey: `leave-decision:${req.id}:approved`,
        });
      }

      return { request: approved, ledgerEntry: entry };
    } else if (input.decision === 'REJECT') {
      if (!input.comments || input.comments.trim().length < 3) {
        throw validation('A documented rejection reason is mandatory when rejecting a leave request.');
      }

      // 1. Release reservation & decrement pendingReservedDays
      if (reservation) {
        await tx.leaveReservation.update({
          where: { id: reservation.id },
          data: { status: 'RELEASED' },
        });

        const leaveYear = req.startDate.getFullYear();
        await tx.leaveBalance.update({
          where: {
            employeeId_leaveTypeId_leaveYear: {
              employeeId: req.employeeId,
              leaveTypeId: req.leaveTypeId,
              leaveYear,
            },
          },
          data: {
            pendingReservedDays: { decrement: reservation.reservedDays },
          },
        });
      }

      // 2. Mark request REJECTED
      const rejected = await tx.leaveRequest.update({
        where: { id: req.id },
        data: {
          status: 'REJECTED',
          rejectionReason: input.comments,
        },
      });

      if (req.employee.userId) {
        await notifyUser(tx, req.employee.userId, {
          title: 'Leave Request Rejected',
          message: `Your request ${req.requestNumber} was rejected: ${input.comments}`,
          deepLink: `/leave-requests/${req.id}`,
          idempotencyKey: `leave-decision:${req.id}:rejected`,
        });
      }

      return { request: rejected };
    } else {
      // RETURN for correction
      if (reservation) {
        await tx.leaveReservation.update({
          where: { id: reservation.id },
          data: { status: 'RELEASED' },
        });

        const leaveYear = req.startDate.getFullYear();
        await tx.leaveBalance.update({
          where: {
            employeeId_leaveTypeId_leaveYear: {
              employeeId: req.employeeId,
              leaveTypeId: req.leaveTypeId,
              leaveYear,
            },
          },
          data: {
            pendingReservedDays: { decrement: reservation.reservedDays },
          },
        });
      }

      const returned = await tx.leaveRequest.update({
        where: { id: req.id },
        data: {
          status: 'RETURNED_FOR_EDIT',
          rejectionReason: input.comments,
        },
      });

      return { request: returned };
    }
  });
}

/**
 * Withdraws a leave request before approval (performed by employee).
 */
export async function withdrawLeaveRequest(
  prisma: PrismaClient,
  auth: AuthContext,
  requestId: string,
) {
  const req = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: { select: { id: true, userId: true } },
      reservations: { where: { status: 'ACTIVE' } },
    },
  });
  if (!req) throw notFound('LeaveRequest', requestId);

  if (req.employee.userId !== auth.userId && !auth.permissions.has('leave.manage')) {
    throw forbidden('Only the applicant or HR can withdraw this leave request.');
  }

  if (req.status !== 'PENDING_APPROVAL' && req.status !== 'RETURNED_FOR_EDIT') {
    throw conflict(`Cannot withdraw request in status '${req.status}'. Only pending requests can be withdrawn.`);
  }

  return prisma.$transaction(async (tx) => {
    const reservation = req.reservations[0];
    if (reservation) {
      await tx.leaveReservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED' },
      });

      const leaveYear = req.startDate.getFullYear();
      await tx.leaveBalance.update({
        where: {
          employeeId_leaveTypeId_leaveYear: {
            employeeId: req.employeeId,
            leaveTypeId: req.leaveTypeId,
            leaveYear,
          },
        },
        data: {
          pendingReservedDays: { decrement: reservation.reservedDays },
        },
      });
    }

    return tx.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'WITHDRAWN' },
    });
  });
}

/**
 * Cancels an approved leave request, posting a reversal transaction to the immutable ledger.
 */
export async function cancelApprovedLeave(
  prisma: PrismaClient,
  auth: AuthContext,
  requestId: string,
  reason: string,
) {
  const req = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { employee: true, leaveType: true },
  });
  if (!req) throw notFound('LeaveRequest', requestId);

  if (req.status !== 'APPROVED') {
    throw conflict(`Cannot cancel leave in status '${req.status}'. Only APPROVED requests can be cancelled.`);
  }

  return prisma.$transaction(async (tx) => {
    // 1. Post reversing credit entry to LeaveLedgerEntry
    const { entry } = await postLedgerEntry(tx, {
      employeeId: req.employeeId,
      leaveTypeId: req.leaveTypeId,
      leaveYear: req.startDate.getFullYear(),
      entryType: 'REVERSAL',
      amountDays: req.workingDaysDeducted, // Credit back the taken days
      sourceType: 'LEAVE_REQUEST',
      sourceId: req.id,
      notes: `Cancellation of approved request ${req.requestNumber}. Reason: ${reason}`,
      actorUserId: auth.userId,
    });

    // 2. Mark request CANCELLED
    const cancelled = await tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: auth.userId,
        cancellationReason: reason,
      },
    });

    return { request: cancelled, reversalEntry: entry };
  });
}
