import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PREFIX = 'enc:v1:';

function getMasterKey(): Buffer {
  const envKey = process.env.ENCRYPTION_MASTER_KEY?.trim();
  if (envKey) {
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) return Buffer.from(envKey, 'hex');
    if (Buffer.byteLength(envKey, 'utf8') === 32) return Buffer.from(envKey, 'utf8');
    return crypto.createHash('sha256').update(envKey, 'utf8').digest();
  }
  // Safe default seed for development/test; in production ENCRYPTION_MASTER_KEY must be set
  return crypto.createHash('sha256').update('ndakala-hr-development-master-key-seed-2026').digest();
}

export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  if (!ciphertext.startsWith(PREFIX)) return ciphertext; // Not encrypted

  const parts = ciphertext.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted payload format');

  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
