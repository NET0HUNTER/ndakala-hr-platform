import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { IntegrationService } from './service.js';
import { auditCtx } from '../employees/util.js';
import { IntegrationProvider } from './types.js';
import {
  acquireAppOnlyToken,
  getActiveM365Config,
  resolveSharePointFolderForCategory,
  resolveSharePointSiteAndDrive,
  sendM365NotificationEmail,
  uploadFileToSharePoint,
} from '../m365/client.js';
import { localFileExists, readFile as readLocalEncryptedFile } from '../../core/storage/storage.js';

export function createIntegrationsRouter(deps: AppDeps): Router {
  const router = Router();
  const service = new IntegrationService(deps.prisma);

  // 1. List Approved Boundary Profiles
  registerRoute(router, deps, {
    method: 'get',
    path: '/integrations/profiles',
    auth: { permission: 'integrations.view' },
    handler: async () => {
      return service.getApprovedBoundaryProfiles();
    },
  });

  // 2. List Configured Integrations
  registerRoute(router, deps, {
    method: 'get',
    path: '/integrations/configs',
    auth: { permission: 'integrations.view' },
    handler: async () => {
      return service.listConfigurations();
    },
  });

  // 3. Get Specific Integration Config
  registerRoute(router, deps, {
    method: 'get',
    path: '/integrations/configs/:provider',
    auth: { permission: 'integrations.view' },
    handler: async ({ params }) => {
      return service.getConfiguration(params.provider as IntegrationProvider);
    },
  });

  // 4. Upsert Integration Config (Restricted to ICT Admin / Managing Partner)
  registerRoute(router, deps, {
    method: 'put',
    path: '/integrations/configs/:provider',
    auth: { permission: 'integrations.manage' },
    body: z.object({
      status: z.enum(['ACTIVE', 'TESTING', 'DISABLED', 'SUSPENDED']).optional(),
      isEnabled: z.boolean().optional(),
      webhookSecret: z.string().optional(),
      outboundUrl: z.string().url().optional(),
      configPayload: z.record(z.unknown()).optional(),
    }),
    handler: async ({ params, body, auth, req }) => {
      return service.upsertConfiguration(
        params.provider as IntegrationProvider,
        body,
        auditCtx(auth!, req)
      );
    },
  });

  // 5. Outbound SSRF Validation Endpoint
  registerRoute(router, deps, {
    method: 'post',
    path: '/integrations/ssrf-validate',
    auth: { permission: 'integrations.manage' },
    body: z.object({
      url: z.string(),
    }),
    handler: async ({ body }) => {
      return service.validateOutboundUrl(body.url);
    },
  });

  // 6. Inbound Webhook: LMS Completion Ingest
  registerRoute(router, deps, {
    method: 'post',
    path: '/integrations/webhooks/lms',
    auth: 'public',
    body: z.object({
      eventId: z.string(),
      timestamp: z.string(),
      employeeReference: z.string(),
      programCode: z.string(),
      programTitle: z.string(),
      completionDate: z.string(),
      scorePercentage: z.number().optional(),
      certificateReference: z.string().optional(),
      evidenceUrl: z.string().optional(),
    }),
    handler: async ({ body, req }) => {
      const rawBody = (req as any).rawBody || JSON.stringify(body);
      const headers = req.headers as Record<string, string>;
      const systemAudit = {
        userId: 'system:webhook:lms',
        email: 'system@ndakala.local',
        role: 'system',
        correlationId: req.requestId,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? null,
      };

      return service.handleLMSCompletionWebhook(body, rawBody, headers, systemAudit);
    },
  });

  // 7. Inbound Webhook: E-Signature Status Ingest
  registerRoute(router, deps, {
    method: 'post',
    path: '/integrations/webhooks/esignature',
    auth: 'public',
    body: z.object({
      eventId: z.string(),
      timestamp: z.string(),
      envelopeId: z.string(),
      documentTitle: z.string(),
      signerEmail: z.string().email(),
      status: z.enum(['COMPLETED', 'DECLINED', 'VOIDED']),
      signedAt: z.string(),
      documentSha256: z.string(),
      certificateMetadata: z.any().optional(),
    }),
    handler: async ({ body, req }) => {
      const rawBody = (req as any).rawBody || JSON.stringify(body);
      const headers = req.headers as Record<string, string>;
      const systemAudit = {
        userId: 'system:webhook:esignature',
        email: 'system@ndakala.local',
        role: 'system',
        correlationId: req.requestId,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? null,
      };

      return service.handleESignatureWebhook(body, rawBody, headers, systemAudit);
    },
  });

  // 8. Inbound Webhook: ATS Candidate Ingest
  registerRoute(router, deps, {
    method: 'post',
    path: '/integrations/webhooks/ats',
    auth: 'public',
    body: z.object({
      eventId: z.string(),
      timestamp: z.string(),
      requisitionNumber: z.string(),
      candidateReference: z.string(),
      candidateName: z.string(),
      candidateEmail: z.string().email(),
      applicationDate: z.string(),
      currentStage: z.string(),
      interviewFeedbackSummary: z.string().optional(),
    }),
    handler: async ({ body, req }) => {
      const rawBody = (req as any).rawBody || JSON.stringify(body);
      const headers = req.headers as Record<string, string>;
      const systemAudit = {
        userId: 'system:webhook:ats',
        email: 'system@ndakala.local',
        role: 'system',
        correlationId: req.requestId,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? null,
      };

      return service.handleATSCandidateWebhook(body, rawBody, headers, systemAudit);
    },
  });

  // 9. Forward Security Audit Event to SIEM (Test/Trigger Endpoint)
  registerRoute(router, deps, {
    method: 'post',
    path: '/integrations/siem/test',
    auth: { permission: 'integrations.manage' },
    body: z.object({
      severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('INFO'),
      eventType: z.string().default('SECURITY_CONFIGURATION_PROBE'),
      resourceType: z.string().default('INTEGRATION_GATEWAY'),
      action: z.string().default('PROBE_TEST'),
      outcome: z.enum(['SUCCESS', 'FAILURE', 'DENIED']).default('SUCCESS'),
      metadata: z.record(z.unknown()).default({}),
    }),
    handler: async ({ body, auth, req }) => {
      const envelope = {
        eventId: `SIEM-TEST-${Date.now()}`,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        facility: 'NDAKALA_HR_SECURITY' as const,
        severity: body.severity,
        eventType: body.eventType,
        actorUserId: auth?.userId,
        actorIp: req.ip,
        resourceType: body.resourceType,
        action: body.action,
        outcome: body.outcome,
        metadata: body.metadata,
      };

      return service.forwardSecurityEvent(envelope, auditCtx(auth!, req));
    },
  });

  // 10. Export Bank EFT Schedule (Strictly Prohibits Direct API Payment Initiation)
  registerRoute(router, deps, {
    method: 'post',
    path: '/integrations/bank-eft/export',
    auth: { permission: 'payroll.export' },
    body: z.object({
      payrollRunId: z.string(),
      bankFormat: z.enum(['KENYA_KBA_EFT', 'STANDARD_CSV']).default('KENYA_KBA_EFT'),
      sourceAccount: z.string().min(5),
      valueDate: z.string(),
    }),
    handler: async ({ body, auth, req }) => {
      return service.exportBankEFTSchedule(body, auditCtx(auth!, req));
    },
  });

  // 11. View Webhook Audit Logs
  registerRoute(router, deps, {
    method: 'get',
    path: '/integrations/logs',
    auth: { permission: 'integrations.view' },
    handler: async ({ req }) => {
      const provider = req.query.provider as IntegrationProvider | undefined;
      return service.listWebhookLogs(provider);
    },
  });

  // 12. Microsoft 365 App-Only Connectivity Test
  registerRoute(router, deps, {
    method: 'post',
    path: '/integrations/m365/test-connection',
    auth: { permission: 'integrations.manage' },
    handler: async ({ deps }) => {
      const cfg = await getActiveM365Config(deps.prisma);
      if (!cfg) {
        return {
          connected: false,
          mode: 'APP_ONLY_CLIENT_CREDENTIALS',
          message: 'Microsoft 365 integration is inactive or missing Tenant ID / Client ID / Client Secret.',
        };
      }
      const accessToken = await acquireAppOnlyToken(cfg);
      let grantedRoles: string[] = [];
      try {
        const parts = accessToken.split('.');
        if (parts.length >= 2) {
          const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (Array.isArray(decoded.roles)) grantedRoles = decoded.roles;
        }
      } catch {
        // non-JWT or opaque test token
      }

      try {
        const { siteId, driveId } = await resolveSharePointSiteAndDrive(cfg);
        return {
          connected: true,
          oauthTokenAcquired: true,
          grantedRoles,
          sharepointConnected: true,
          mode: 'APP_ONLY_CLIENT_CREDENTIALS',
          siteId,
          driveId,
          senderMailbox: cfg.senderMailbox,
        };
      } catch (spErr: any) {
        return {
          connected: true,
          oauthTokenAcquired: true,
          grantedRoles,
          sharepointConnected: false,
          sharepointMessage: spErr?.message || 'SharePoint site unavailable on this tenant.',
          mode: 'APP_ONLY_CLIENT_CREDENTIALS',
          senderMailbox: cfg.senderMailbox,
        };
      }
    },
  });

  // 13. Microsoft 365 Link-Only Zero-PII Mail Test
  registerRoute(router, deps, {
    method: 'post',
    path: '/integrations/m365/test-mail',
    auth: { permission: 'integrations.manage' },
    body: z.object({
      recipientMailbox: z.string().email(),
    }),
    handler: async ({ body, deps }) => {
      const cfg = await getActiveM365Config(deps.prisma);
      if (!cfg) {
        return { sent: false, reason: 'Microsoft 365 integration is not ACTIVE' };
      }
      return sendM365NotificationEmail(cfg, {
        recipientMailbox: body.recipientMailbox,
        subject: 'Microsoft 365 Integration Connectivity Verification',
        safeSummary:
          'Your Ndakala HR Portal link-only notification channel is active. Sign in with your individual account and TOTP MFA to inspect tasks.',
        deepLink: '/files',
      });
    },
  });

  // 14. Microsoft 365 SharePoint Bulk Dual-Write Sync for Unsynced Documents
  registerRoute(router, deps, {
    method: 'post',
    path: '/integrations/m365/sync-sharepoint',
    auth: { permission: 'integrations.manage' },
    handler: async ({ deps }) => {
      const cfg = await getActiveM365Config(deps.prisma);
      if (!cfg) {
        return { syncedCount: 0, skippedCount: 0, message: 'Microsoft 365 integration is not ACTIVE' };
      }
      const pendingDocs = await deps.prisma.documentRecord.findMany({
        where: { sharepointItemId: null, localStoragePurged: false },
        include: {
          folder: { select: { name: true } },
          employeeDocuments: { include: { employee: { select: { employeeNumber: true } } } },
        },
        take: 100,
      });

      let syncedCount = 0;
      let skippedCount = 0;
      for (const doc of pendingDocs) {
        if (!localFileExists(doc.storageKey)) {
          skippedCount++;
          continue;
        }
        const buf = readLocalEncryptedFile(doc.storageKey);
        const empNo = doc.employeeDocuments[0]?.employee?.employeeNumber || null;
        const spFolder = resolveSharePointFolderForCategory(doc.category, doc.folder?.name, empNo);
        const uploaded = await uploadFileToSharePoint(cfg, spFolder, doc.fileName, buf, doc.mimeType);
        await deps.prisma.documentRecord.update({
          where: { id: doc.id },
          data: {
            externalProvider: 'DUAL_WRITE_SHAREPOINT',
            sharepointSiteId: uploaded.siteId,
            sharepointDriveId: uploaded.driveId,
            sharepointItemId: uploaded.itemId,
            sharepointETag: uploaded.eTag || null,
            lastSyncedAt: new Date(),
          },
        });
        syncedCount++;
      }

      return { syncedCount, skippedCount };
    },
  });

  return router;
}
