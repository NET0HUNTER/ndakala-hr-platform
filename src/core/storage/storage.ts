import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validation, forbidden } from '../errors/errors.js';

const STORAGE_ROOT = path.resolve(process.cwd(), 'secure_storage');
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.msi', '.com', '.scr', '.pif',
  '.jar', '.py', '.php', '.asp', '.aspx', '.jsp', '.bin', '.dll', '.so',
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/plain',
  'text/csv',
]);

export function initStorage(): void {
  if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true, mode: 0o700 });
  }
}

export function validateUploadFile(fileName: string, mimeType: string, sizeBytes: number): void {
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw validation(`File size exceeds maximum allowed limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`);
  }

  const ext = path.extname(fileName).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw validation(`Security restriction: file extension '${ext}' is strictly prohibited`);
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw validation(`Unsupported MIME type: '${mimeType}'. Supported formats: PDF, PNG, JPEG, WEBP, DOCX, XLSX, CSV, TXT`);
  }
}

export function storeFile(
  buffer: Buffer,
  fileName: string,
): { storageKey: string; storagePath: string; checksumSha256: string } {
  initStorage();

  const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const safeExt = path.extname(fileName).toLowerCase();
  const storageKey = `${Date.now()}_${crypto.randomUUID()}${safeExt}`;
  const storagePath = path.join(STORAGE_ROOT, storageKey);

  // Prevent directory traversal
  if (!storagePath.startsWith(STORAGE_ROOT)) {
    throw forbidden('Invalid storage path calculation');
  }

  fs.writeFileSync(storagePath, buffer, { mode: 0o600 });
  return { storageKey, storagePath, checksumSha256 };
}

export function readFile(storageKey: string): Buffer {
  const safeKey = path.basename(storageKey);
  const fullPath = path.join(STORAGE_ROOT, safeKey);
  if (!fs.existsSync(fullPath)) {
    throw validation('Requested file does not exist in storage');
  }
  return fs.readFileSync(fullPath);
}

/**
 * Generates an HMAC-signed, time-bound download token valid for e.g. 5 minutes.
 */
export function generateSignedDownloadToken(documentId: string, ttlSeconds = 300): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${documentId}:${expiresAt}`;
  const secret = process.env.DOWNLOAD_TOKEN_SECRET || 'ndakala-document-token-secret-2026';
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ documentId, expiresAt, hmac })).toString('base64url');
}

export function verifySignedDownloadToken(token: string): { documentId: string } {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    const { documentId, expiresAt, hmac } = parsed;

    if (!documentId || !expiresAt || !hmac) {
      throw forbidden('Malformed download token');
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > expiresAt) {
      throw forbidden('Download link has expired');
    }

    const payload = `${documentId}:${expiresAt}`;
    const secret = process.env.DOWNLOAD_TOKEN_SECRET || 'ndakala-document-token-secret-2026';
    const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      throw forbidden('Invalid download token signature');
    }

    return { documentId };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AppError') throw err;
    throw forbidden('Invalid or corrupted download token');
  }
}
