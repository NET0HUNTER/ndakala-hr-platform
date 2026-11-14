import { Router } from 'express';
import { z } from 'zod';
import { registerRoute } from '../../core/http/route.js';
import type { AppDeps } from '../../core/http/context.js';
import { IntegrationService } from './service.js';
import { auditCtx } from '../employees/util.js';
import { IntegrationProvider } from './types.js';

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

  return router;
}
