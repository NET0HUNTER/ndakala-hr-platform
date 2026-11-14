import { PrismaClient } from '@prisma/client';
import { redactSensitiveData } from './redact.js';

export interface AuditContext {
  userId?: string | null;
  email?: string | null;
  role?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

export interface AuditEntryInput {
  action: string;
  targetType: string;
  targetId?: string | null;
  outcome: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(
  prisma: PrismaClient | any,
  ctx: AuditContext,
  entry: AuditEntryInput,
): Promise<void> {
  const beforeJson = entry.before !== undefined ? JSON.stringify(redactSensitiveData(entry.before)) : null;
  const afterJson = entry.after !== undefined ? JSON.stringify(redactSensitiveData(entry.after)) : null;

  await prisma.auditLog.create({
    data: {
      actorUserId: ctx.userId ?? null,
      actorEmail: ctx.email ?? null,
      actorRole: ctx.role ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      outcome: entry.outcome,
      reason: entry.reason ?? null,
      correlationId: ctx.correlationId ?? null,
      before: beforeJson,
      after: afterJson,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });
}
