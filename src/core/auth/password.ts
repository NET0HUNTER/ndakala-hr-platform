import crypto from 'node:crypto';
import { validation } from '../errors/errors.js';
import { timingSafeEqualString } from '../crypto/vault.js';

const ITERATIONS = 100_000;
const KEY_LEN = 64;
const DIGEST = 'sha512';
const PREFIX = 'pbkdf2:sha512';

export function assertPasswordPolicy(password: string): void {
  if (!password || password.length < 8) {
    throw validation('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    throw validation('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    throw validation('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    throw validation('Password must contain at least one digit');
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    throw validation('Password must contain at least one special character');
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LEN, DIGEST, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${PREFIX}:${ITERATIONS}:${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export async function verifyPassword(storedHash: string, candidate: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== PREFIX) {
    return false;
  }
  const iterations = parseInt(parts[2], 10);
  const salt = parts[3];
  const expectedHash = parts[4];

  return new Promise((resolve) => {
    crypto.pbkdf2(candidate, salt, iterations, KEY_LEN, DIGEST, (err, derivedKey) => {
      if (err) return resolve(false);
      const computedHash = derivedKey.toString('hex');
      resolve(timingSafeEqualString(computedHash, expectedHash));
    });
  });
}
