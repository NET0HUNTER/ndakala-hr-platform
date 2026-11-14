import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import type { PrismaClient } from '@prisma/client';
import {
  requestIdMiddleware,
  sessionAuthMiddleware,
  csrfMiddleware,
  errorHandler,
} from './core/http/middleware.js';
import type { AppDeps } from './core/http/context.js';
import { createOrganisationRouter } from './modules/organisation/routes.js';
import { createIdentityRouter } from './modules/identity/routes.js';
import { createConfigurationRouter } from './modules/configuration/routes.js';
import { createWorkflowRouter } from './modules/workflow/routes.js';
import { createDocumentsRouter } from './modules/documents/routes.js';
import { createNotificationsRouter } from './modules/notifications/routes.js';
import { createAuditRouter } from './modules/audit/routes.js';
import { createEmployeesRouter } from './modules/employees/routes.js';
import { createEmployeeSetupRouter } from './modules/employees/setup.routes.js';
import { createLeaveRouter } from './modules/leave/routes.js';
import { createGovernanceRouter } from './modules/governance/routes.js';
import { createWorkforceRouter } from './modules/workforce/routes.js';
import { createErRouter } from './modules/er/routes.js';
import { createSeparationRouter } from './modules/separation/routes.js';
import { createPerformanceRouter } from './modules/performance/routes.js';
import { createPayrollRouter } from './modules/payroll/routes.js';
import { createIntegrationsRouter } from './modules/integrations/routes.js';
import { createPrivacyRouter } from './modules/privacy/routes.js';
import { createTimeTrackerRouter } from './modules/timetracker/routes.js';
import { createReportsRouter } from './modules/reports/routes.js';
import { createWorkspaceRouter } from './modules/workspace/routes.js';

export function createApp(prisma: PrismaClient): Express {
  const deps: AppDeps = { prisma };
  const app = express();

  app.disable('x-powered-by');

  // 1. Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://cdn.tailwindcss.com',
            'https://unpkg.com',
          ],
          scriptSrcElem: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://cdn.tailwindcss.com',
            'https://unpkg.com',
          ],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      frameguard: { action: 'sameorigin' },
      xContentTypeOptions: true,
      referrerPolicy: { policy: 'no-referrer' },
      hsts: { maxAge: 31536000, includeSubDomains: true },
    }),
  );

  // 2. CORS
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id', 'Authorization'],
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    }),
  );

  // 3. Request Correlation ID
  app.use(requestIdMiddleware);

  // 4. Body & Cookie Parsing
  app.use(
    express.json({
      limit: '20mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(cookieParser());
  app.use(express.static('public'));

  // 5. Authentication & CSRF
  app.use(sessionAuthMiddleware(deps));
  app.use(csrfMiddleware);

  // 6. Health & Readiness Probes
  app.get('/api/v1/health', (_req, res) => {
    res.json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      service: 'Ndakala HR Platform',
      version: '1.0.0',
    });
  });

  app.get('/api/v1/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: 'READY',
        database: 'CONNECTED',
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({ status: 'NOT_READY', database: 'DISCONNECTED' });
    }
  });

  // Observability & Security Metrics Probe
  app.get('/api/v1/metrics', async (_req, res) => {
    try {
      const [activeSessions, auditCount, activeHolds, pendingDSRs, configuredIntegrations] = await Promise.all([
        prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }).catch(() => 0),
        prisma.auditLog.count().catch(() => 0),
        prisma.privacyLegalHold.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
        prisma.privacyDataSubjectRequest.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }).catch(() => 0),
        prisma.integrationConfig.count().catch(() => 0),
      ]);

      const mem = process.memoryUsage();
      res.json({
        status: 'HEALTHY',
        service: 'Ndakala HR Enterprise Platform',
        version: '1.0.0-phase7',
        environment: process.env.NODE_ENV || 'development',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        memory: {
          heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
          heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
          rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        },
        observability: {
          activeSessionsCount: activeSessions,
          totalAuditEventsRecorded: auditCount,
          activeLegalHoldsCount: activeHolds,
          pendingDSRCount: pendingDSRs,
          configuredIntegrationsCount: configuredIntegrations,
        },
        securityPosture: {
          authentication: 'Session Cookie (HttpOnly, SameSite=Lax) + CSRF Token',
          mfaCapabilities: 'TOTP RFC 6238 with AES-256-GCM Vault Storage',
          accountLockoutPolicy: '5 failed attempts -> 15 minute temporary lockout',
          ssrfProtection: 'ACTIVE (Subnet Blacklisting & Private IP Filtering)',
          dataProtection: 'Kenya DPA 2019 & GDPR Article 25 Compliant',
          disbursementPolicy: 'RESTRICTED_EFT_SCHEDULE_EXPORT_ONLY (Direct Payment API Strictly Forbidden)',
        },
      });
    } catch (err: any) {
      res.status(500).json({ status: 'ERROR', message: err.message });
    }
  });

  // 7. Mount Domain Modules
  const apiV1 = express.Router();
  apiV1.use(createOrganisationRouter(deps));
  apiV1.use(createIdentityRouter(deps));
  apiV1.use(createConfigurationRouter(deps));
  apiV1.use(createWorkflowRouter(deps));
  apiV1.use(createDocumentsRouter(deps));
  apiV1.use(createNotificationsRouter(deps));
  apiV1.use(createAuditRouter(deps));
  apiV1.use(createEmployeesRouter(deps));
  apiV1.use(createEmployeeSetupRouter(deps));
  apiV1.use(createLeaveRouter(deps));
  apiV1.use(createGovernanceRouter(deps));
  apiV1.use(createWorkforceRouter(deps));
  apiV1.use(createErRouter(deps));
  apiV1.use(createSeparationRouter(deps));
  apiV1.use(createPerformanceRouter(deps));
  apiV1.use(createPayrollRouter(deps));
  apiV1.use(createIntegrationsRouter(deps));
  apiV1.use(createPrivacyRouter(deps));
  apiV1.use(createTimeTrackerRouter(deps));
  apiV1.use(createReportsRouter(deps));
  apiV1.use(createWorkspaceRouter(deps));

  app.use('/api/v1', apiV1);

  // 8. Global Error Handler
  app.use(errorHandler);

  return app;
}
