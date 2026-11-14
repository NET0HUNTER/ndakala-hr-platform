import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateMfaSecret(): string {
  const bytes = crypto.randomBytes(20);
  let secret = '';
  for (let i = 0; i < bytes.length; i++) {
    secret += BASE32_ALPHABET[bytes[i] % 32];
  }
  return secret;
}

function base32Decode(base32: string): Buffer {
  let bits = '';
  for (let i = 0; i < base32.length; i++) {
    const val = BASE32_ALPHABET.indexOf(base32[i].toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotp(secret: string, timeStep = 30, forTime = Math.floor(Date.now() / 1000)): string {
  const counter = Math.floor(forTime / timeStep);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, '0');
}

export function verifyTotp(secret: string, token: string, window = 1): boolean {
  if (!token || token.length !== 6 || !/^\d+$/.test(token)) return false;
  const now = Math.floor(Date.now() / 1000);
  for (let i = -window; i <= window; i++) {
    const expected = generateTotp(secret, 30, now + i * 30);
    if (expected === token) return true;
  }
  return false;
}
