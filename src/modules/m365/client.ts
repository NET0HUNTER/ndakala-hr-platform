import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { decrypt } from '../../core/crypto/vault.js';
import type {
  M365AppConfig,
  SharePointUploadResult,
  SharePointVerificationResult,
  M365MailDispatchResult,
  M365CalendarEventResult,
} from './types.js';

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

const tokenCache = new Map<string, CachedToken>();

export function clearM365TokenCache(): void {
  tokenCache.clear();
}

function assertAllowedM365Endpoint(urlStr: string, kind: 'login' | 'graph'): string {
  const parsed = new URL(urlStr);
  const host = parsed.hostname.toLowerCase();
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.ALLOW_TEST_M365_ENDPOINT === 'true';

  if (isTestEnv && (host === '127.0.0.1' || host === 'localhost' || host === '::1')) {
    return urlStr.replace(/\/+$/, '');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Security violation: M365 ${kind} endpoint must use HTTPS`);
  }

  const allowedHosts =
    kind === 'login'
      ? new Set(['login.microsoftonline.com', 'login.microsoft.com'])
      : new Set(['graph.microsoft.com']);

  if (!allowedHosts.has(host)) {
    throw new Error(`SSRF protection: blocked disallowed M365 ${kind} host '${host}'`);
  }

  return urlStr.replace(/\/+$/, '');
}

export async function getActiveM365Config(db: PrismaClient): Promise<M365AppConfig | null> {
  const rec = await db.integrationConfig.findUnique({ where: { provider: 'MICROSOFT_365' } });
  if (!rec || rec.status !== 'ACTIVE') return null;

  let settings: Record<string, any> = {};
  const decryptedPayload = decrypt(rec.configPayloadEncrypted);
  if (decryptedPayload) {
    try {
      settings = JSON.parse(decryptedPayload);
    } catch {
      settings = {};
    }
  }

  const webhookFallbackSecret = decrypt(rec.webhookSecretEncrypted) || '';
  const clientSecret = String(settings.clientSecret || webhookFallbackSecret || '').trim();
  const tenantId = String(settings.tenantId || '').trim();
  const clientId = String(settings.clientId || '').trim();
  const sharepointSiteUrl = String(settings.sharepointSiteUrl || rec.outboundUrl || '').trim();

  if (!tenantId || !clientId || !clientSecret) return null;

  return {
    enabled: true,
    tenantId,
    clientId,
    clientSecret,
    sharepointSiteUrl,
    sharepointSiteId: settings.sharepointSiteId ? String(settings.sharepointSiteId) : undefined,
    sharepointDriveId: settings.sharepointDriveId ? String(settings.sharepointDriveId) : undefined,
    senderMailbox: String(settings.senderMailbox || process.env.M365_SENDER_MAILBOX || 'noreply@company.com'),
    appBaseUrl: String(settings.appBaseUrl || process.env.APP_BASE_URL || 'https://ndakalahr.duckdns.org').replace(/\/+$/, ''),
    loginBaseUrl: settings.loginBaseUrl ? String(settings.loginBaseUrl) : (process.env.M365_LOGIN_BASE_URL || undefined),
    graphBaseUrl: settings.graphBaseUrl ? String(settings.graphBaseUrl) : (process.env.M365_GRAPH_BASE_URL || undefined),
  };
}

export async function acquireAppOnlyToken(config: M365AppConfig): Promise<string> {
  const loginBase = assertAllowedM365Endpoint(
    config.loginBaseUrl || 'https://login.microsoftonline.com',
    'login',
  );
  const cacheKey = `${loginBase}:${config.tenantId}:${config.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const tokenUrl = `${loginBase}/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Microsoft Entra App-Only token failure (${resp.status}): ${errText.slice(0, 240)}`);
  }

  const data = (await resp.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('Microsoft Entra token response missing access_token');
  }

  const ttlMs = ((data.expires_in || 3600) * 1000);
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + ttlMs,
  });

  return data.access_token;
}

async function graphRequest(
  config: M365AppConfig,
  relativePath: string,
  init: RequestInit = {},
): Promise<Response> {
  const graphBase = assertAllowedM365Endpoint(
    config.graphBaseUrl || 'https://graph.microsoft.com/v1.0',
    'graph',
  );
  const token = await acquireAppOnlyToken(config);
  const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  const url = cleanPath.startsWith('/v1.0') || cleanPath.startsWith('/beta')
    ? `${graphBase.replace(/\/v1\.0$/, '')}${cleanPath}`
    : `${graphBase}${cleanPath}`;

  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
}

export async function resolveSharePointSiteAndDrive(
  config: M365AppConfig,
): Promise<{ siteId: string; driveId: string }> {
  let siteId = config.sharepointSiteId;
  let driveId = config.sharepointDriveId;

  if (!siteId && config.sharepointSiteUrl) {
    const u = new URL(config.sharepointSiteUrl);
    const sitePath = u.pathname.replace(/\/+$/, '') || '/sites/NdakalaPeopleHR';
    const resp = await graphRequest(config, `/sites/${u.hostname}:${sitePath}`);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`SharePoint site lookup failed (${resp.status}): ${text.slice(0, 200)}`);
    }
    const siteJson = (await resp.json()) as { id?: string };
    if (!siteJson.id) throw new Error('SharePoint site response did not include id');
    siteId = siteJson.id;
  }

  if (!siteId) {
    throw new Error('SharePoint Site ID or Site URL is required');
  }

  if (!driveId) {
    const resp = await graphRequest(config, `/sites/${encodeURIComponent(siteId)}/drive`);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`SharePoint default drive lookup failed (${resp.status}): ${text.slice(0, 200)}`);
    }
    const driveJson = (await resp.json()) as { id?: string };
    if (!driveJson.id) throw new Error('SharePoint drive response did not include id');
    driveId = driveJson.id;
  }

  return { siteId, driveId };
}

export async function ensureSharePointFolder(
  config: M365AppConfig,
  driveId: string,
  folderPath: string,
): Promise<void> {
  const segments = folderPath.split('/').map((s) => s.trim()).filter(Boolean);
  let currentPath = '';

  for (const seg of segments) {
    const nextPath = currentPath ? `${currentPath}/${seg}` : seg;
    const encodedNext = nextPath.split('/').map(encodeURIComponent).join('/');
    const checkResp = await graphRequest(config, `/drives/${encodeURIComponent(driveId)}/root:/${encodedNext}`);
    if (checkResp.status === 404) {
      const parentEndpoint = currentPath
        ? `/drives/${encodeURIComponent(driveId)}/root:/${currentPath.split('/').map(encodeURIComponent).join('/')}:/children`
        : `/drives/${encodeURIComponent(driveId)}/root/children`;
      await graphRequest(config, parentEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: seg,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename',
        }),
      });
    }
    currentPath = nextPath;
  }
}

export function resolveSharePointFolderForCategory(
  category: string,
  folderName?: string | null,
  employeeNumber?: string | null,
): string {
  const cleanFolder = (folderName || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  if (category === 'EMPLOYEE') {
    return employeeNumber ? `02-Employee-Files/${employeeNumber}` : '02-Employee-Files/General';
  }
  if (category === 'TEMPLATE') {
    return '03-HR-Forms-Templates';
  }
  if (category === 'ER_EVIDENCE' || category === 'MEDICAL' || category === 'PAYROLL' || category === 'PRIVACY_DSR') {
    return `04-Restricted-HR-Vault/${category}`;
  }
  return cleanFolder ? `01-Organization-Files/${cleanFolder}` : '01-Organization-Files/General';
}

export async function uploadFileToSharePoint(
  config: M365AppConfig,
  folderPath: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<SharePointUploadResult> {
  const { siteId, driveId } = await resolveSharePointSiteAndDrive(config);
  await ensureSharePointFolder(config, driveId, folderPath);

  const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, '_');
  const fullRelative = `${folderPath}/${safeFileName}`.split('/').map(encodeURIComponent).join('/');

  const resp = await graphRequest(config, `/drives/${encodeURIComponent(driveId)}/root:/${fullRelative}:/content`, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
    },
    body: new Uint8Array(buffer),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`SharePoint upload failed (${resp.status}): ${errText.slice(0, 240)}`);
  }

  const item = (await resp.json()) as {
    id?: string;
    eTag?: string;
    webUrl?: string;
    size?: number;
    file?: { hashes?: { sha256Hash?: string } };
  };

  if (!item.id) {
    throw new Error('SharePoint upload succeeded without returning DriveItem id');
  }

  return {
    siteId,
    driveId,
    itemId: item.id,
    eTag: item.eTag,
    webUrl: item.webUrl,
    size: item.size ?? buffer.length,
    sha256Hash: item.file?.hashes?.sha256Hash,
  };
}

export async function downloadSharePointFile(
  config: M365AppConfig,
  driveId: string,
  itemId: string,
): Promise<Buffer> {
  const resp = await graphRequest(
    config,
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
  );
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`SharePoint download failed (${resp.status}): ${errText.slice(0, 200)}`);
  }
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

export async function verifySharePointItem(
  config: M365AppConfig,
  driveId: string,
  itemId: string,
  expectedSize: number,
  expectedSha256?: string,
): Promise<SharePointVerificationResult> {
  const resp = await graphRequest(
    config,
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,size,eTag,file`,
  );
  if (resp.status === 404) {
    return { exists: false, sizeMatch: false, checksumMatch: false, reason: 'Remote SharePoint DriveItem not found (404)' };
  }
  if (!resp.ok) {
    return { exists: false, sizeMatch: false, checksumMatch: false, reason: `Graph status ${resp.status}` };
  }
  const item = (await resp.json()) as {
    id?: string;
    size?: number;
    eTag?: string;
    file?: { hashes?: { sha256Hash?: string } };
  };
  const remoteSize = typeof item.size === 'number' ? item.size : -1;
  const sizeMatch = remoteSize === expectedSize;
  const remoteSha = item.file?.hashes?.sha256Hash?.toLowerCase();
  const checksumMatch = remoteSha && expectedSha256 ? remoteSha === expectedSha256.toLowerCase() : sizeMatch;

  return {
    exists: Boolean(item.id),
    sizeMatch,
    checksumMatch,
    remoteSize,
    remoteETag: item.eTag,
    reason: !sizeMatch ? `Size mismatch (local=${expectedSize}, remote=${remoteSize})` : undefined,
  };
}

function buildLinkOnlyHtml(title: string, summaryLine: string, fullLink: string): string {
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return [
    '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;padding:20px;border:1px solid #e2e8f0;border-radius:8px;">',
    '<p style="color:#1d4ed8;font-weight:700;font-size:13px;margin:0 0 8px;">NDAKALA ADVISORY LLP — HR PORTAL NOTICE</p>',
    `<h2 style="color:#0f172a;font-size:18px;margin:0 0 12px;">${esc(title)}</h2>`,
    `<p style="color:#334155;font-size:14px;line-height:1.5;margin:0 0 16px;">${esc(summaryLine)}</p>`,
    '<p style="color:#475569;font-size:12px;margin:0 0 16px;">For privacy protection on shared department mailboxes, no personal data or document attachments are included in this email. Sign in with your individual account and TOTP authenticator to view details.</p>',
    `<a href="${esc(fullLink)}" style="display:inline-block;background:#1e3a8a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Open in Ndakala HR Portal</a>`,
    '</div>',
  ].join('');
}

/**
 * Link-only, ZERO-PII, ZERO-attachment Outlook dispatch.
 * Routes from noreply@ndakalaadvisory.co.ke to recipient's departmentM365Email (or safe fallback).
 */
export async function sendM365NotificationEmail(
  config: M365AppConfig,
  params: {
    recipientMailbox: string;
    subject: string;
    safeSummary: string;
    deepLink?: string | null;
  },
): Promise<M365MailDispatchResult> {
  const linkPath = params.deepLink && params.deepLink.startsWith('/') ? params.deepLink : '/';
  const fullLink = `${config.appBaseUrl}${linkPath}`;
  const html = buildLinkOnlyHtml(params.subject, params.safeSummary, fullLink);

  const payload = {
    message: {
      subject: `[Ndakala HR] ${params.subject}`,
      body: {
        contentType: 'HTML',
        content: html,
      },
      toRecipients: [
        {
          emailAddress: { address: params.recipientMailbox },
        },
      ],
      attachments: [], // Enforced zero attachments so shared department mailboxes never leak files
    },
    saveToSentItems: false,
  };

  const resp = await graphRequest(
    config,
    `/users/${encodeURIComponent(config.senderMailbox)}/sendMail`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    return {
      sent: false,
      recipientMailbox: params.recipientMailbox,
      reason: `Graph sendMail failed (${resp.status}): ${errText.slice(0, 200)}`,
    };
  }

  return {
    sent: true,
    externalMessageId: resp.headers.get('request-id') || crypto.randomUUID(),
    recipientMailbox: params.recipientMailbox,
  };
}

/**
 * Shared-mailbox safe calendar helper:
 * Creates an informational All-Day event with showAs: 'free' on the department calendar.
 * NEVER sets 'oof' busy status and NEVER calls MailboxSettings automaticRepliesSetting.
 */
export async function createSharedCalendarFreeEvent(
  config: M365AppConfig,
  params: {
    sharedMailbox: string;
    subject: string;
    startDate: string; // YYYY-MM-DD
    endDateInclusive: string; // YYYY-MM-DD
  },
): Promise<M365CalendarEventResult> {
  // Microsoft Graph requires all-day end date to be exclusive (day after endDateInclusive)
  const startDt = new Date(`${params.startDate.slice(0, 10)}T00:00:00Z`);
  const endDt = new Date(`${params.endDateInclusive.slice(0, 10)}T00:00:00Z`);
  endDt.setUTCDate(endDt.getUTCDate() + 1);
  const startIso = `${startDt.toISOString().slice(0, 10)}T00:00:00`;
  const endIso = `${endDt.toISOString().slice(0, 10)}T00:00:00`;

  const payload = {
    subject: params.subject,
    isAllDay: true,
    showAs: 'free', // Critical: non-blocking on shared department calendars
    isReminderOn: false,
    start: { dateTime: startIso, timeZone: 'Africa/Nairobi' },
    end: { dateTime: endIso, timeZone: 'Africa/Nairobi' },
    body: {
      contentType: 'Text',
      content: 'Informational team availability marker created by Ndakala HR Portal (OOF auto-reply unaffected).',
    },
  };

  const resp = await graphRequest(
    config,
    `/users/${encodeURIComponent(params.sharedMailbox)}/events`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    return {
      created: false,
      mailbox: params.sharedMailbox,
      showAs: 'free',
      isAllDay: true,
      reason: `Graph event failed (${resp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const created = (await resp.json()) as { id?: string };
  return {
    created: true,
    eventId: created.id,
    mailbox: params.sharedMailbox,
    showAs: 'free',
    isAllDay: true,
  };
}
