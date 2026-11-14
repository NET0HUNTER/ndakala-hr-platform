import type { Prisma, PrismaClient } from '@prisma/client';

export type Db = PrismaClient | Prisma.TransactionClient;

export interface NotifyInput {
  title: string;
  message: string;
  deepLink?: string;
  /** Idempotency key: the same logical reminder is never sent twice. */
  idempotencyKey: string;
}

/** Idempotent in-app notification to a single user. Returns true if newly created. */
export async function notifyUser(db: Db, recipientUserId: string, input: NotifyInput): Promise<boolean> {
  const key = input.idempotencyKey.slice(0, 190);
  const existing = await db.notification.findUnique({ where: { idempotencyKey: key } });
  if (existing) return false;
  await db.notification.create({
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
