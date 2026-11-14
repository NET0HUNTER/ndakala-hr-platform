import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import {
  unauthenticated,
  forbidden,
  notFound,
  conflict,
  validation,
} from '../../core/errors/errors.js';
import { hashPassword, verifyPassword, assertPasswordPolicy } from '../../core/auth/password.js';
import { createSession, revokeSession } from '../../core/auth/session.js';
import { generateMfaSecret, verifyTotp } from '../../core/auth/mfa.js';
import { encrypt, decrypt } from '../../core/crypto/vault.js';
import { assertNotSelfRoleAssignment } from '../../core/permissions/rbac.js';
import { writeAudit } from '../../core/audit/audit.js';

async function findLinkedEmployeeId(
  prisma: AppDeps['prisma'],
  userId: string,
  email: string,
): Promise<string | null> {
  const emp = await prisma.employee.findFirst({
    where: { OR: [{ userId }, { workEmail: email }] },
    select: { id: true },
  });
  return emp?.id ?? null;
}

export function createIdentityRouter(deps: AppDeps): Router {
  const router = Router();

  // 1. Auth Login
  registerRoute(router, deps, {
    method: 'post',
    path: '/auth/login',
    auth: 'public',
    body: z.object({
      email: z.string().email().toLowerCase(),
      password: z.string(),
      mfaCode: z.string().optional(),
    }),
    handler: async ({ body, req, res, deps }) => {
      const user = await deps.prisma.user.findUnique({
        where: { email: body.email },
      });

      const auditCtx = {
        userId: user?.id,
        email: body.email,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        correlationId: req.requestId,
      };

      if (!user) {
        await writeAudit(deps.prisma, auditCtx, {
          action: 'AUTH_LOGIN_FAILED',
          targetType: 'User',
          outcome: 'FAILURE',
          reason: 'User not found',
        });
        throw unauthenticated('Invalid email or password');
      }

      // Check account lockout
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        await writeAudit(deps.prisma, auditCtx, {
          action: 'AUTH_LOGIN_BLOCKED',
          targetType: 'User',
          targetId: user.id,
          outcome: 'BLOCKED',
          reason: 'Account locked due to consecutive failed attempts',
        });
        throw forbidden('Account is temporarily locked due to failed login attempts. Please contact IT administrator.');
      }

      const isValidPassword = await verifyPassword(user.passwordHash, body.password);
      if (!isValidPassword || !user.isActive) {
        const nextAttempts = user.failedLoginAttempts + 1;
        const lockAccount = nextAttempts >= 5;
        const lockUntil = lockAccount ? new Date(Date.now() + 15 * 60 * 1000) : null;

        await deps.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: lockAccount ? 0 : nextAttempts,
            lockedUntil: lockUntil,
          },
        });

        await writeAudit(deps.prisma, auditCtx, {
          action: 'AUTH_LOGIN_FAILED',
          targetType: 'User',
          targetId: user.id,
          outcome: 'FAILURE',
          reason: !user.isActive ? 'Account deactivated' : 'Invalid password',
        });

        throw unauthenticated('Invalid email or password');
      }

      // Reset failed attempts on valid password
      if (user.failedLoginAttempts > 0) {
        await deps.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });
      }

      // MFA Verification if enabled
      if (user.mfaEnabled && user.mfaSecret) {
        const decryptedSecret = decrypt(user.mfaSecret);
        if (!decryptedSecret) throw new Error('Corrupted MFA secret');

        if (!body.mfaCode) {
          return { mfaRequired: true, message: 'MFA code is required to complete authentication' };
        }

        const isValidMfa = verifyTotp(decryptedSecret, body.mfaCode);
        if (!isValidMfa) {
          await writeAudit(deps.prisma, auditCtx, {
            action: 'AUTH_MFA_FAILED',
            targetType: 'User',
            targetId: user.id,
            outcome: 'FAILURE',
            reason: 'Invalid TOTP code',
          });
          throw unauthenticated('Invalid MFA verification code');
        }
      }

      // Create session
      const { token, csrfToken, expiresAt, sessionId } = await createSession(
        deps.prisma,
        user.id,
        req.ip,
        req.get('user-agent'),
      );

      res.cookie('hr_sid', token, {
        httpOnly: true,
        secure: req.secure || req.get('x-forwarded-proto') === 'https',
        sameSite: 'lax',
        path: '/',
        expires: expiresAt,
      });

      await writeAudit(deps.prisma, auditCtx, {
        action: 'AUTH_LOGIN_SUCCESS',
        targetType: 'User',
        targetId: user.id,
        outcome: 'SUCCESS',
      });

      const employeeId = await findLinkedEmployeeId(deps.prisma, user.id, user.email);

      return {
        token,
        csrfToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          mustChangePassword: user.mustChangePassword,
          employeeId,
        },
      };
    },
  });

  // 1b. Public Organization Login Branding (non-sensitive display label)
  registerRoute(router, deps, {
    method: 'get',
    path: '/auth/branding',
    auth: 'public',
    handler: async ({ deps }) => {
      let logoLabel = 'People';
      let orgName = 'Ndakala Advisory LLP';
      try {
        const org = await deps.prisma.organisation.findFirst({
          select: { legalName: true, tradingName: true },
        });
        if (org?.tradingName || org?.legalName) orgName = org.tradingName || org.legalName;
        const wsCfg = await deps.prisma.policyConfiguration.findFirst({
          where: { code: 'NDAKALA_WORKSPACE_DATA', status: 'ACTIVE' },
          orderBy: { version: 'desc' },
        });
        if (wsCfg?.values) {
          const parsed = JSON.parse(wsCfg.values);
          if (typeof parsed?.ORG_LOGO_LABEL === 'string' && parsed.ORG_LOGO_LABEL.trim()) {
            logoLabel = parsed.ORG_LOGO_LABEL.trim();
          }
        }
      } catch {
        // fallback cleanly to defaults
      }
      return { orgName, logoLabel };
    },
  });

  // 1c. Public Self-Service Password Recovery Request (Non-enumerating + Audit Logged)
  registerRoute(router, deps, {
    method: 'post',
    path: '/auth/forgot-password',
    auth: 'public',
    body: z.object({
      email: z.string().email().toLowerCase(),
    }),
    handler: async ({ body, req, deps }) => {
      const user = await deps.prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true, email: true, isActive: true },
      });

      await writeAudit(
        deps.prisma,
        {
          userId: user?.id,
          email: body.email,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          correlationId: req.requestId,
        },
        {
          action: 'AUTH_PASSWORD_RESET_REQUESTED',
          targetType: 'User',
          targetId: user?.id,
          outcome: user && user.isActive ? 'SUCCESS' : 'FAILURE',
          reason:
            user && user.isActive
              ? 'Self-service login recovery request submitted'
              : 'Recovery requested for unknown or inactive account',
        },
      );

      return {
        accepted: true,
        message:
          'If an active Ndakala Advisory account matches that email, IT & HR Security have logged your recovery request and will dispatch reset instructions.',
      };
    },
  });

  // 2. Auth Logout
  registerRoute(router, deps, {
    method: 'post',
    path: '/auth/logout',
    auth: 'session',
    handler: async ({ auth, req, res, deps }) => {
      await revokeSession(deps.prisma, auth.sessionId);
      res.clearCookie('hr_sid', { path: '/' });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, correlationId: req.requestId },
        {
          action: 'AUTH_LOGOUT',
          targetType: 'Session',
          targetId: auth.sessionId,
          outcome: 'SUCCESS',
        },
      );
      return { message: 'Logged out successfully' };
    },
  });

  // 3. Current User Context (returns HTTP 200 with authenticated: false when logged out to prevent spurious 401 console errors)
  registerRoute(router, deps, {
    method: 'get',
    path: '/auth/me',
    auth: 'public',
    handler: async ({ req, deps }) => {
      if (!req.auth) {
        return {
          authenticated: false,
          user: null,
          roles: [],
          permissions: [],
          csrfToken: null,
        };
      }
      const user = await deps.prisma.user.findUnique({
        where: { id: req.auth.userId },
        select: {
          id: true,
          email: true,
          name: true,
          mfaEnabled: true,
          mustChangePassword: true,
          departmentId: true,
          positionId: true,
        },
      });
      const employeeId = user
        ? await findLinkedEmployeeId(deps.prisma, user.id, user.email)
        : null;
      return {
        authenticated: true,
        user: user ? { ...user, employeeId } : null,
        roles: req.auth.roles,
        permissions: Array.from(req.auth.permissions),
        csrfToken: req.auth.csrfToken,
      };
    },
  });

  // 4. MFA Setup & Activation
  registerRoute(router, deps, {
    method: 'post',
    path: '/auth/mfa/setup',
    auth: 'session',
    handler: async ({ auth }) => {
      const secret = generateMfaSecret();
      return {
        secret,
        otpauthUrl: `otpauth://totp/NdakalaHR:${encodeURIComponent(auth.email)}?secret=${secret}&issuer=NdakalaAdvisory`,
      };
    },
  });

  registerRoute(router, deps, {
    method: 'post',
    path: '/auth/mfa/activate',
    auth: 'session',
    body: z.object({
      secret: z.string().min(16),
      code: z.string().length(6),
    }),
    handler: async ({ auth, body, deps, req }) => {
      const isValid = verifyTotp(body.secret, body.code);
      if (!isValid) throw validation('Invalid verification code');

      const encryptedSecret = encrypt(body.secret);
      await deps.prisma.user.update({
        where: { id: auth.userId },
        data: { mfaEnabled: true, mfaSecret: encryptedSecret },
      });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, correlationId: req.requestId },
        {
          action: 'AUTH_MFA_ACTIVATED',
          targetType: 'User',
          targetId: auth.userId,
          outcome: 'SUCCESS',
        },
      );

      return { success: true, message: 'MFA successfully activated' };
    },
  });

  // 5. Users List
  registerRoute(router, deps, {
    method: 'get',
    path: '/users',
    auth: { permission: 'users.view' },
    handler: async ({ deps }) => {
      const now = new Date();
      return deps.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          mfaEnabled: true,
          departmentId: true,
          positionId: true,
          createdAt: true,
          roleAssignments: {
            where: {
              isActive: true,
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
            },
            include: {
              role: { select: { key: true, name: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    },
  });

  // 6. Users Create
  registerRoute(router, deps, {
    method: 'post',
    path: '/users',
    auth: { permission: 'users.manage' },
    body: z.object({
      email: z.string().email().toLowerCase(),
      name: z.string().min(2),
      password: z.string().min(8),
      departmentId: z.string().uuid().optional(),
      positionId: z.string().uuid().optional(),
    }),
    handler: async ({ body, auth, req, deps }) => {
      assertPasswordPolicy(body.password);
      const exists = await deps.prisma.user.findUnique({ where: { email: body.email } });
      if (exists) throw conflict(`User with email '${body.email}' already exists`);

      const passwordHash = await hashPassword(body.password);
      const user = await deps.prisma.user.create({
        data: {
          email: body.email,
          name: body.name,
          passwordHash,
          departmentId: body.departmentId,
          positionId: body.positionId,
          mustChangePassword: true,
        },
        select: { id: true, email: true, name: true, isActive: true },
      });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'USER_CREATE',
          targetType: 'User',
          targetId: user.id,
          outcome: 'SUCCESS',
          after: user,
        },
      );

      return user;
    },
  });

  // 7. Role Assignment (With strict anti-self-elevation check!)
  registerRoute(router, deps, {
    method: 'post',
    path: '/users/:id/roles',
    auth: { permission: 'roles.manage' },
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      roleKey: z.string(),
      effectiveFrom: z.string().datetime().optional(),
      effectiveTo: z.string().datetime().optional(),
    }),
    handler: async ({ params, body, auth, req, deps }) => {
      // SECURITY CHECK: A user cannot assign roles to themselves!
      assertNotSelfRoleAssignment(auth.userId, params.id);

      const targetUser = await deps.prisma.user.findUnique({ where: { id: params.id } });
      if (!targetUser) throw notFound('User', params.id);

      const role = await deps.prisma.role.findUnique({ where: { key: body.roleKey } });
      if (!role) throw notFound('Role', body.roleKey);

      const assignment = await deps.prisma.userRoleAssignment.create({
        data: {
          userId: params.id,
          roleId: role.id,
          assignedById: auth.userId,
          effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
          effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : undefined,
        },
      });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'USER_ROLE_ASSIGNED',
          targetType: 'UserRoleAssignment',
          targetId: assignment.id,
          outcome: 'SUCCESS',
          after: { targetUserId: params.id, roleKey: body.roleKey },
        },
      );

      return assignment;
    },
  });

  // 8. User Deactivation (Cannot deactivate own account)
  registerRoute(router, deps, {
    method: 'patch',
    path: '/users/:id/deactivate',
    auth: { permission: 'users.manage' },
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ params, auth, req, deps }) => {
      if (params.id === auth.userId) {
        throw forbidden('Security violation: users cannot deactivate their own account');
      }

      const user = await deps.prisma.user.update({
        where: { id: params.id },
        data: { isActive: false },
        select: { id: true, email: true, isActive: true },
      });

      // Revoke all active sessions of deactivated user immediately
      await deps.prisma.session.updateMany({
        where: { userId: params.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await writeAudit(
        deps.prisma,
        { userId: auth.userId, email: auth.email, role: auth.roles[0], correlationId: req.requestId },
        {
          action: 'USER_DEACTIVATE',
          targetType: 'User',
          targetId: params.id,
          outcome: 'SUCCESS',
        },
      );

      return user;
    },
  });

  // 9. Roles List
  registerRoute(router, deps, {
    method: 'get',
    path: '/roles',
    auth: { permission: 'roles.view' },
    handler: async ({ deps }) => {
      return deps.prisma.role.findMany({
        include: {
          permissions: {
            include: { permission: true },
          },
        },
        orderBy: { name: 'asc' },
      });
    },
  });

  return router;
}
