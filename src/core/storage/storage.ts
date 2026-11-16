import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validation, forbidden } from '../errors/errors.js';
import { getMasterKey } from '../crypto/vault.js';

const STORAGE_ROOT = path.resolve(process.cwd(), 'secure_storage');
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
const ENC_MAGIC = Buffer.from('NDKENC01', 'ascii'); // 8-byte binary AES-256-GCM magic header
const ENC_IV_BYTES = 12;
const ENC_TAG_BYTES = 16;

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

export function encryptFileBuffer(plainBuffer: Buffer): Buffer {
  const iv = crypto.randomBytes(ENC_IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ENC_MAGIC, iv, tag, ciphertext]);
}

export function decryptFileBuffer(storedBuffer: Buffer): Buffer {
  if (
    storedBuffer.length >= ENC_MAGIC.length + ENC_IV_BYTES + ENC_TAG_BYTES &&
    storedBuffer.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)
  ) {
    const ivStart = ENC_MAGIC.length;
    const tagStart = ivStart + ENC_IV_BYTES;
    const dataStart = tagStart + ENC_TAG_BYTES;
    const iv = storedBuffer.subarray(ivStart, tagStart);
    const tag = storedBuffer.subarray(tagStart, dataStart);
    const ciphertext = storedBuffer.subarray(dataStart);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getMasterKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
  // Transparent backward-compatibility fallback for legacy unencrypted files
  return storedBuffer;
}

export function isEncryptedFileBuffer(storedBuffer: Buffer): boolean {
  return (
    storedBuffer.length >= ENC_MAGIC.length + ENC_IV_BYTES + ENC_TAG_BYTES &&
    storedBuffer.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)
  );
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

  const encryptedEnvelope = encryptFileBuffer(buffer);
  fs.writeFileSync(storagePath, encryptedEnvelope, { mode: 0o600 });
  return { storageKey, storagePath, checksumSha256 };
}

export function localFileExists(storageKey: string): boolean {
  if (!storageKey) return false;
  const safeKey = path.basename(storageKey);
  const fullPath = path.join(STORAGE_ROOT, safeKey);
  return fullPath.startsWith(STORAGE_ROOT) && fs.existsSync(fullPath);
}

export function purgeLocalFile(storageKey: string): boolean {
  const safeKey = path.basename(storageKey);
  const fullPath = path.join(STORAGE_ROOT, safeKey);
  if (!fullPath.startsWith(STORAGE_ROOT)) {
    throw forbidden('Invalid storage path calculation');
  }
  if (!fs.existsSync(fullPath)) return false;
  fs.unlinkSync(fullPath);
  return true;
}

export function readFile(storageKey: string): Buffer {
  const safeKey = path.basename(storageKey);
  const fullPath = path.join(STORAGE_ROOT, safeKey);
  if (!fs.existsSync(fullPath)) {
    throw validation('Requested file does not exist in local encrypted storage');
  }
  const raw = fs.readFileSync(fullPath);
  return decryptFileBuffer(raw);
}

/**
 * Generates an HMAC-signed, time-bound download/inline-preview token valid for e.g. 5 minutes.
 * Optionally binds actorUserId so tokens cannot be replayed by another employee.
 */
export function generateSignedDownloadToken(
  documentId: string,
  ttlSeconds = 300,
  actorUserId?: string,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const boundActor = actorUserId || '';
  const payload = boundActor ? `${documentId}:${expiresAt}:${boundActor}` : `${documentId}:${expiresAt}`;
  const secret = process.env.DOWNLOAD_TOKEN_SECRET || 'ndakala-document-token-secret-2026';
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(
    JSON.stringify({ documentId, expiresAt, actorUserId: boundActor || undefined, hmac }),
  ).toString('base64url');
}

export function verifySignedDownloadToken(
  token: string,
  expectedActorUserId?: string,
): { documentId: string; actorUserId?: string } {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    const { documentId, expiresAt, actorUserId, hmac } = parsed;

    if (!documentId || !expiresAt || !hmac) {
      throw forbidden('Malformed download token');
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > expiresAt) {
      throw forbidden('Download link has expired');
    }

    if (actorUserId && expectedActorUserId && actorUserId !== expectedActorUserId) {
      throw forbidden('Download token does not belong to current authenticated actor');
    }

    const payload = actorUserId ? `${documentId}:${expiresAt}:${actorUserId}` : `${documentId}:${expiresAt}`;
    const secret = process.env.DOWNLOAD_TOKEN_SECRET || 'ndakala-document-token-secret-2026';
    const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      throw forbidden('Invalid download token signature');
    }

    return { documentId, actorUserId };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AppError') throw err;
    throw forbidden('Invalid or corrupted download token');
  }
}
