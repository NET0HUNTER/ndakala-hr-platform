export interface M365AppConfig {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sharepointSiteUrl: string;
  sharepointSiteId?: string;
  sharepointDriveId?: string;
  senderMailbox: string; // e.g. noreply@ndakalaadvisory.co.ke
  appBaseUrl: string;    // e.g. https://ndakalahr.duckdns.org
  loginBaseUrl?: string; // override strictly allowed in test mode only
  graphBaseUrl?: string; // override strictly allowed in test mode only
}

export interface SharePointUploadResult {
  siteId: string;
  driveId: string;
  itemId: string;
  eTag?: string;
  webUrl?: string;
  size: number;
  sha256Hash?: string;
}

export interface SharePointVerificationResult {
  exists: boolean;
  sizeMatch: boolean;
  checksumMatch: boolean;
  remoteSize?: number;
  remoteETag?: string;
  reason?: string;
}

export interface M365MailDispatchResult {
  sent: boolean;
  externalMessageId?: string;
  recipientMailbox: string;
  reason?: string;
}

export interface M365CalendarEventResult {
  created: boolean;
  eventId?: string;
  mailbox: string;
  showAs: 'free';
  isAllDay: true;
  reason?: string;
}

export interface ColdArchiveReport {
  checkedCount: number;
  archivedCount: number;
  skippedLegalHoldCount: number;
  skippedNoRemoteCount: number;
  skippedRemoteMismatchCount: number;
  archivedDocumentIds: string[];
  details: Array<{
    documentId: string;
    fileName: string;
    status: 'PURGED_LOCAL' | 'SKIPPED_LEGAL_HOLD' | 'SKIPPED_NO_SHAREPOINT' | 'SKIPPED_VERIFICATION_FAILED' | 'ERROR';
    reason?: string;
  }>;
}
