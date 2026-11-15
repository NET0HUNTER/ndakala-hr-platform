import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  sessionId: string;
  csrfToken: string;
  mustChangePassword: boolean;
  roles: string[];
  permissions: Set<string>;
}

const sha256 = (str: string): string => crypto.createHash('sha256').update(str).digest('hex');

const DEFAULT_SESSION_TTL_HOURS = 168; // 7 days sliding session window

export async function createSession(
  prisma: PrismaClient,
  userId: string,
  ip?: string,
  userAgent?: string,
  ttlHours = DEFAULT_SESSION_TTL_HOURS,
): Promise<{ token: string; csrfToken: string; expiresAt: Date; sessionId: string }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      csrfToken,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt,
    },
  });

  return { token, csrfToken, expiresAt, sessionId: session.id };
}

export async function resolveSession(
  prisma: PrismaClient,
  token: string,
): Promise<AuthContext | null> {
  if (!token) return null;
  const hash = sha256(token);
  const now = new Date();

  const session = await prisma.session.findUnique({
    where: { tokenHash: hash },
    include: {
      user: {
        include: {
          roleAssignments: {
            where: {
              isActive: true,
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
            },
            include: {
              role: {
                include: {
                  permissions: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt <= now || !session.user.isActive) {
    return null;
  }

  // Slide session window forward and touch lastSeenAt every 5 minutes of activity
  if (now.getTime() - session.lastSeenAt.getTime() > 300_000) {
    const slidingExpiresAt = new Date(now.getTime() + DEFAULT_SESSION_TTL_HOURS * 3600 * 1000);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt: now,
        expiresAt: slidingExpiresAt > session.expiresAt ? slidingExpiresAt : session.expiresAt,
      },
    });
  }

  const roleKeys: string[] = [];
  const permissions = new Set<string>();

  for (const assignment of session.user.roleAssignments) {
    roleKeys.push(assignment.role.key);
    for (const p of assignment.role.permissions) {
      permissions.add(p.permissionKey);
    }
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    sessionId: session.id,
    csrfToken: session.csrfToken,
    mustChangePassword: session.user.mustChangePassword,
    roles: roleKeys,
    permissions,
  };
}

export async function revokeSession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
