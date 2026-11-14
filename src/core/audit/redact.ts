const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'newpassword',
  'currentpassword',
  'secret',
  'mfasecret',
  'token',
  'csrftoken',
  'tokenhash',
  'encryptionkey',
  'apikey',
  'authorization',
  'cookie',
  'creditcard',
  'cvv',
]);

export function redactSensitiveData(obj: unknown, depth = 0): unknown {
  if (depth > 10 || obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // If it looks like a bearer token or basic auth
    if (/^Bearer\s+[A-Za-z0-9._-]+$/i.test(obj)) return '[REDACTED_BEARER_TOKEN]';
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        cleaned[key] = '[REDACTED]';
      } else {
        cleaned[key] = redactSensitiveData(value, depth + 1);
      }
    }
    return cleaned;
  }

  return obj;
}
