/**
 * Phase 7: Integrations Control, Governance & Webhook Types
 * Strictly governs boundaries, data minimisation, and cryptographic verification
 * for all external partner/system connectors at Ndakala Advisory LLP.
 */

export type IntegrationProvider =
  | 'MICROSOFT_365'
  | 'SECURE_STORAGE'
  | 'SIEM_FORWARDER'
  | 'LEARNING_LMS'
  | 'ESIGNATURE'
  | 'BANK_EFT'
  | 'RECRUITMENT_ATS';

export type IntegrationStatus = 'ACTIVE' | 'TESTING' | 'DISABLED' | 'SUSPENDED';

export interface IntegrationBoundaryProfile {
  provider: IntegrationProvider;
  name: string;
  businessPurpose: string;
  systemOwner: string;
  lawfulPurpose: string;
  dataMinimisationSummary: string;
  authenticationMethod: string;
  scopes: string[];
  vendorProcessorObligations: string;
  retentionPolicy: string;
  rollbackProcedure: string;
  isOutboundAllowed: boolean;
  isInboundWebhookAllowed: boolean;
  disallowedActions: string[];
}

export interface WebhookVerificationOptions {
  secret: string;
  signatureHeader?: string;
  timestampHeader?: string;
  nonceHeader?: string;
  maxTimestampDriftSec?: number; // default 300s (5 minutes)
}

export interface WebhookVerificationResult {
  isValid: boolean;
  reason?: string;
  computedSignature?: string;
}

export interface SSRFCheckResult {
  allowed: boolean;
  reason?: string;
  resolvedIp?: string;
}

export interface LMSCompletionWebhookPayload {
  eventId: string;
  timestamp: string;
  employeeReference: string; // e.g. "NDK-001" or employee email
  programCode: string;
  programTitle: string;
  completionDate: string;
  scorePercentage?: number;
  certificateReference?: string;
  evidenceUrl?: string;
}

export interface ESignatureWebhookPayload {
  eventId: string;
  timestamp: string;
  envelopeId: string;
  documentTitle: string;
  signerEmail: string;
  status: 'COMPLETED' | 'DECLINED' | 'VOIDED';
  signedAt: string;
  documentSha256: string;
  certificateMetadata?: {
    certId: string;
    caProvider: string;
    signatureAlgorithm: string;
    ipAddress?: string;
  };
}

export interface ATSCandidateWebhookPayload {
  eventId: string;
  timestamp: string;
  requisitionNumber: string;
  candidateReference: string;
  candidateName: string;
  candidateEmail: string;
  applicationDate: string;
  currentStage: string;
  interviewFeedbackSummary?: string;
}

export interface SIEMSecurityEventEnvelope {
  eventId: string;
  timestamp: string;
  environment: string;
  facility: 'NDAKALA_HR_SECURITY';
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  eventType: string;
  actorUserId?: string;
  actorIp?: string;
  resourceType: string;
  resourceId?: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  metadata: Record<string, unknown>;
  checksumSha256: string;
}

export interface BankEFTScheduleExportOptions {
  payrollRunId: string;
  bankFormat: 'KENYA_KBA_EFT' | 'STANDARD_CSV';
  sourceAccount: string;
  valueDate: string;
}
