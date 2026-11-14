import type { PrismaClient } from '@prisma/client';
import type { Db } from '../notifications/service.js';
import { notifyRole, notifyUser } from '../notifications/service.js';
import { applyChangeRequest } from './service.js';
import { addDays } from './util.js';

export interface LifecycleJobsResult {
  appliedChangeRequests: number;
  documentExceptionsCreated: number;
  probationRemindersSent: number;
  onboardingTasksEscalated: number;
}

/**
 * Runs deterministic lifecycle maintenance jobs:
 * 1. Applies approved change requests whose effective date has arrived.
 * 2. Scans for document expiration and opens document exceptions.
 * 3. Dispatches reminders before probation end to HR and supervisors.
 * 4. Escalates overdue onboarding tasks per configured escalation thresholds.
 */
export async function runLifecycleJobs(
  prisma: PrismaClient,
  asOf = new Date(),
): Promise<LifecycleJobsResult> {
  const result: LifecycleJobsResult = {
    appliedChangeRequests: 0,
    documentExceptionsCreated: 0,
    probationRemindersSent: 0,
    onboardingTasksEscalated: 0,
  };

  // 1. Apply Scheduled Change Requests
  const scheduledChanges = await prisma.employeeChangeRequest.findMany({
    where: {
      status: 'APPROVED_SCHEDULED',
      effectiveDate: { lte: asOf },
    },
    orderBy: { effectiveDate: 'asc' },
  });

  for (const cr of scheduledChanges) {
    await prisma.$transaction(async (tx) => {
      await applyChangeRequest(tx, cr.id, cr.reviewedById || cr.requestedById);
    });
    result.appliedChangeRequests++;
  }

  // 2. Scan Document Expirations and Create Exceptions
  const activeDocs = await prisma.employeeDocument.findMany({
    where: {
      status: 'ACTIVE',
      expiryDate: { not: null },
    },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
      documentRecord: { select: { fileName: true } },
    },
  });

  for (const doc of activeDocs) {
    if (!doc.expiryDate) continue;
    const isExpired = doc.expiryDate <= asOf;
    const leadDays = doc.reminderDaysBefore ?? 30;
    const isExpiringSoon = !isExpired && doc.expiryDate <= addDays(asOf, leadDays);

    if (isExpired || isExpiringSoon) {
      const exceptionType = isExpired ? 'EXPIRED' : 'EXPIRING_SOON';
      const dedupeKey = `${doc.id}:${exceptionType}:${doc.expiryDate.toISOString().slice(0, 10)}`;

      const existingException = await prisma.documentException.findUnique({
        where: { dedupeKey },
      });

      if (!existingException) {
        await prisma.documentException.create({
          data: {
            employeeDocumentId: doc.id,
            exceptionType,
            status: 'OPEN',
            dedupeKey,
          },
        });
        result.documentExceptionsCreated++;

        // Notify HR of exception
        await notifyRole(prisma, 'head_of_hr', {
          title: `Document ${exceptionType === 'EXPIRED' ? 'Expired' : 'Expiring Soon'}`,
          message: `${doc.documentType} (${doc.documentRecord.fileName}) for ${doc.employee.firstName} ${doc.employee.lastName} (${doc.employee.employeeNumber}) expires ${doc.expiryDate.toISOString().slice(0, 10)}.`,
          deepLink: `/employees/${doc.employeeId}/documents`,
          idempotencyKey: `notif:docexc:${dedupeKey}`,
        });
      }
    }
  }

  // 3. Probation End Reminders
  const activeProbations = await prisma.probationRecord.findMany({
    where: {
      decision: null,
      status: { in: ['IN_PROGRESS', 'OBJECTIVES_SET', 'ASSESSED'] },
      probationEndDate: { gte: asOf },
    },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
    },
  });

  for (const prob of activeProbations) {
    // Lead time 14 days before probation end
    const leadDate = addDays(asOf, 14);
    if (prob.probationEndDate <= leadDate) {
      const dedupeKey = `prob-remind:${prob.id}:${prob.probationEndDate.toISOString().slice(0, 10)}`;

      const notified = await notifyRole(prisma, 'head_of_hr', {
        title: 'Probation End Approaching - Human Decision Required',
        message: `Probation period for ${prob.employee.firstName} ${prob.employee.lastName} (${prob.employee.employeeNumber}) ends on ${prob.probationEndDate.toISOString().slice(0, 10)}. Complete assessment and record human decision.`,
        deepLink: `/probation/${prob.id}`,
        idempotencyKey: dedupeKey,
      });

      if (notified > 0) {
        result.probationRemindersSent++;
        await prisma.probationRecord.update({
          where: { id: prob.id },
          data: { reminderSentAt: asOf },
        });
      }
    }
  }

  // 4. Onboarding Overdue Task Escalation
  const overdueTasks = await prisma.onboardingTask.findMany({
    where: {
      status: 'PENDING',
      escalated: false,
      dueDate: { lt: asOf },
    },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
    },
  });

  for (const task of overdueTasks) {
    if (!task.dueDate) continue;
    const daysOverdue = Math.floor((asOf.getTime() - task.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const threshold = task.escalateAfterDaysOverdue ?? 0;

    if (daysOverdue >= threshold) {
      await prisma.onboardingTask.update({
        where: { id: task.id },
        data: {
          escalated: true,
          escalatedAt: asOf,
        },
      });
      result.onboardingTasksEscalated++;

      const targetRole = task.escalateToRoleKey || 'head_of_hr';
      await notifyRole(prisma, targetRole, {
        title: 'Onboarding Task Overdue Escalation',
        message: `Task '${task.taskTitle}' for ${task.employee.firstName} ${task.employee.lastName} is ${daysOverdue} day(s) overdue.`,
        deepLink: `/onboarding-tasks/${task.id}`,
        idempotencyKey: `task-esc:${task.id}:${daysOverdue}`,
      });
    }
  }

  return result;
}
