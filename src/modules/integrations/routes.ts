import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { IntegrationService } from './service.js';
import { auditCtx } from '../employees/util.js';
import { IntegrationProvider } from './types.js';
import { decrypt, encrypt } from '../../core/crypto/vault.js';
import {
  acquireAppOnlyToken,
  acquireDelegatedToken,
  clearM365TokenCache,
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

  // 12. Microsoft 365 App-Only / Delegated OneDrive Connectivity Test
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

      if (cfg.delegatedRefreshToken) {
        await acquireDelegatedToken(cfg);
        try {
          const { siteId, driveId } = await resolveSharePointSiteAndDrive(cfg);
          return {
            connected: true,
            oauthTokenAcquired: true,
            mode: 'DELEGATED_ONEDRIVE',
            delegatedUserEmail: cfg.delegatedUserEmail || cfg.senderMailbox,
            onedriveConnected: true,
            siteId,
            driveId,
          };
        } catch (odErr: any) {
          return {
            connected: true,
            oauthTokenAcquired: true,
            mode: 'DELEGATED_ONEDRIVE',
            delegatedUserEmail: cfg.delegatedUserEmail || cfg.senderMailbox,
            onedriveConnected: false,
            onedriveMessage: odErr?.message || 'OneDrive lookup failed.',
          };
        }
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

  // 12B. Start Delegated OneDrive & Outlook OAuth2 Sign-In
  registerRoute(router, deps, {
    method: 'get',
    path: '/integrations/m365/oauth/start',
    auth: { permission: 'integrations.manage' },
    handler: async ({ deps }) => {
      const cfg = await getActiveM365Config(deps.prisma);
      if (!cfg) {
        throw new Error('Save Microsoft 365 Client ID and Client Secret first before connecting OneDrive.');
      }
      const redirectUri = `${cfg.appBaseUrl}/api/v1/integrations/m365/callback`;
      const stateNonce = crypto.randomBytes(12).toString('hex');
      const sig = crypto
        .createHmac('sha256', cfg.clientSecret)
        .update(stateNonce)
        .digest('hex')
        .slice(0, 24);
      const state = `${stateNonce}.${sig}`;
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: 'offline_access User.Read Files.ReadWrite Mail.Send Calendars.ReadWrite',
        state,
        prompt: 'select_account',
      });
      return {
        authorizeUrl: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`,
        redirectUri,
      };
    },
  });

  // 12C. Delegated OneDrive & Outlook OAuth2 Callback
  registerRoute(router, deps, {
    method: 'get',
    path: '/integrations/m365/callback',
    auth: 'public',
    handler: async ({ req, res, deps }) => {
      const code = String(req.query.code || '');
      const state = String(req.query.state || '');
      const errParam = String(req.query.error || '');
      const errDesc = String(req.query.error_description || '');

      if (errParam) {
        res.status(400).send(`<html><body style="font-family:sans-serif;padding:32px"><h3>Microsoft Sign-In Declined</h3><p>${errParam}: ${errDesc}</p><a href="/">Return to Ndakala HR Portal</a></body></html>`);
        return;
      }

      const cfg = await getActiveM365Config(deps.prisma);
      if (!cfg || !code) {
        res.status(400).send('<html><body style="font-family:sans-serif;padding:32px"><h3>Missing M365 Configuration or Authorization Code</h3><a href="/">Return to Ndakala HR Portal</a></body></html>');
        return;
      }

      // Verify HMAC state
      const [nonce, sig] = state.split('.');
      const expectedSig = nonce
        ? crypto.createHmac('sha256', cfg.clientSecret).update(nonce).digest('hex').slice(0, 24)
        : '';
      if (!nonce || sig !== expectedSig) {
        res.status(400).send('<html><body style="font-family:sans-serif;padding:32px"><h3>Invalid OAuth State Signature</h3><a href="/">Return to Ndakala HR Portal</a></body></html>');
        return;
      }

      const redirectUri = `${cfg.appBaseUrl}/api/v1/integrations/m365/callback`;
      const tokenResp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: 'offline_access User.Read Files.ReadWrite Mail.Send Calendars.ReadWrite',
        }).toString(),
      });

      const tokenJson = (await tokenResp.json()) as any;
      if (!tokenResp.ok || !tokenJson.access_token || !tokenJson.refresh_token) {
        res.status(400).send(`<html><body style="font-family:sans-serif;padding:32px"><h3>Token Exchange Failed</h3><pre>${JSON.stringify(tokenJson, null, 2)}</pre><a href="/">Return to Ndakala HR Portal</a></body></html>`);
        return;
      }

      const hdr = { Authorization: `Bearer ${tokenJson.access_token}` };
      const [meResp, driveResp] = await Promise.all([
        fetch('https://graph.microsoft.com/v1.0/me', { headers: hdr }).then((r) => r.json()).catch(() => ({})),
        fetch('https://graph.microsoft.com/v1.0/me/drive', { headers: hdr }).then((r) => r.json()).catch(() => ({})),
      ]);

      const userEmail = String((meResp as any)?.mail || (meResp as any)?.userPrincipalName || cfg.senderMailbox);
      const driveId = String((driveResp as any)?.id || '');

      // Persist encrypted delegatedRefreshToken + driveId into MICROSOFT_365 config
      const rec = await deps.prisma.integrationConfig.findUnique({ where: { provider: 'MICROSOFT_365' } });
      if (rec) {
        let existing: Record<string, any> = {};
        try {
          existing = JSON.parse(decrypt(rec.configPayloadEncrypted) || '{}');
        } catch {
          existing = {};
        }
        const merged = {
          ...existing,
          delegatedRefreshToken: tokenJson.refresh_token,
          delegatedUserEmail: userEmail,
          senderMailbox: userEmail,
          sharepointSiteId: 'ONEDRIVE_DELEGATED',
          ...(driveId ? { sharepointDriveId: driveId } : {}),
        };
        await deps.prisma.integrationConfig.update({
          where: { provider: 'MICROSOFT_365' },
          data: {
            configPayloadEncrypted: encrypt(JSON.stringify(merged)),
            status: 'ACTIVE',
            isEnabled: true,
          },
        });
        clearM365TokenCache();
      }

      res.send(`<html><body style="font-family:Inter,sans-serif;padding:40px;max-width:560px;margin:auto;color:#0f172a">
        <h2 style="color:#0088ff">OneDrive &amp; Outlook Connected!</h2>
        <p><strong>Account:</strong> ${userEmail}</p>
        <p><strong>OneDrive ID:</strong> <code>${driveId || 'Ready'}</code></p>
        <p>Your HR documents will now dual-write cleanly to your OneDrive alongside the AES-256 local vault.</p>
        <a href="/" style="display:inline-block;margin-top:16px;padding:10px 18px;background:#0088ff;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Return to Ndakala HR Portal</a>
      </body></html>`);
      return;
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
