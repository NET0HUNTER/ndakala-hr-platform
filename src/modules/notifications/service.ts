import type { Prisma, PrismaClient } from '@prisma/client';
import { getActiveM365Config, sendM365NotificationEmail } from '../m365/client.js';

export type Db = PrismaClient | Prisma.TransactionClient;

export interface NotifyInput {
  title: string;
  message: string;
  deepLink?: string;
  /** Idempotency key: the same logical reminder is never sent twice. */
  idempotencyKey: string;
}

/**
 * Resolves the target department shared mailbox or safe fallback inbox for a user,
 * then dispatches a Link-Only, Zero-PII, Zero-Attachment email via App-Only Microsoft Graph.
 */
export async function dispatchOutlookLinkNotification(
  prisma: PrismaClient,
  recipientUserId: string,
  input: { title: string; message: string; deepLink?: string; notificationId?: string },
): Promise<{ sent: boolean; recipientMailbox?: string; externalMessageId?: string; reason?: string }> {
  try {
    const m365 = await getActiveM365Config(prisma);
    if (!m365) return { sent: false, reason: 'M365 integration inactive' };

    const user = await prisma.user.findUnique({
      where: { id: recipientUserId },
      select: { email: true, departmentM365Email: true, departmentId: true },
    });
    if (!user) return { sent: false, reason: 'Recipient user not found' };

    let targetMailbox = user.departmentM365Email || '';
    if (!targetMailbox && user.departmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: user.departmentId },
        select: { sharedM365Mailbox: true },
      });
      if (dept?.sharedM365Mailbox) targetMailbox = dept.sharedM365Mailbox;
    }
    if (!targetMailbox) {
      targetMailbox = user.email;
    }
    if (!targetMailbox) return { sent: false, reason: 'No mailbox configured for user' };

    const result = await sendM365NotificationEmail(m365, {
      recipientMailbox: targetMailbox,
      subject: input.title,
      safeSummary: input.message,
      deepLink: input.deepLink,
    });

    if (result.sent && input.notificationId && result.externalMessageId) {
      await prisma.notification
        .update({
          where: { id: input.notificationId },
          data: { externalMessageId: result.externalMessageId },
        })
        .catch(() => {});
    }

    return result;
  } catch (err: any) {
    return { sent: false, reason: err?.message || 'Outlook dispatch error' };
  }
}

/** Idempotent in-app notification to a single user + optional Outlook link dispatch. */
export async function notifyUser(db: Db, recipientUserId: string, input: NotifyInput): Promise<boolean> {
  const key = input.idempotencyKey.slice(0, 190);
  const existing = await db.notification.findUnique({ where: { idempotencyKey: key } });
  if (existing) return false;
  const created = await db.notification.create({
    data: {
      recipientUserId,
      title: input.title.slice(0, 100),
      message: input.message.slice(0, 500),
      channel: 'IN_APP',
      status: 'DELIVERED',
      attempts: 1,
      lastAttemptAt: new Date(),
      idempotencyKey: key,
      deepLink: input.deepLink,
    },
  });

  // Fire Outlook link-only notification when invoked with full PrismaClient outside a transaction
  if ('integrationConfig' in db && typeof (db as PrismaClient).integrationConfig?.findUnique === 'function') {
    await dispatchOutlookLinkNotification(db as PrismaClient, recipientUserId, {
      title: input.title,
      message: input.message,
      deepLink: input.deepLink,
      notificationId: created.id,
    });
  }

  return true;
}

/** Idempotent notification to every active holder of a role. Returns number created. */
export async function notifyRole(db: Db, roleKey: string, input: NotifyInput): Promise<number> {
  const assignments = await db.userRoleAssignment.findMany({
    where: { isActive: true, role: { key: roleKey }, user: { isActive: true } },
    select: { userId: true },
  });
  const userIds = [...new Set(assignments.map((a) => a.userId))];
  let created = 0;
  for (const userId of userIds) {
    if (await notifyUser(db, userId, { ...input, idempotencyKey: `${input.idempotencyKey}:${userId}` })) created++;
  }
  return created;
}
