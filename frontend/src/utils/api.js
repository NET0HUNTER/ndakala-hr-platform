const CSRF_STORAGE_KEY = 'ndakala_csrf_token';
const AUTH_STORAGE_KEY = 'ndakala_auth_token';

function readStoredToken(key) {
  try {
    return typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem(key)
      : null;
  } catch {
    return null;
  }
}

function writeStoredToken(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore storage errors in restricted environments
  }
}

let _csrfToken = readStoredToken(CSRF_STORAGE_KEY);
let _authToken = readStoredToken(AUTH_STORAGE_KEY);

export function setCsrfToken(token) {
  _csrfToken = token || null;
  writeStoredToken(CSRF_STORAGE_KEY, _csrfToken);
}

export function getCsrfToken() {
  return _csrfToken;
}

export function setAuthToken(token) {
  _authToken = token || null;
  writeStoredToken(AUTH_STORAGE_KEY, _authToken);
}

export function getAuthToken() {
  return _authToken;
}

export function unwrapList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

/**
 * Computes user-friendly available, entitled, taken, and reserved days from a LeaveBalance row.
 */
export function computeLeaveBalanceStats(balance) {
  if (!balance) return { availableDays: 0, entitledDays: 0, takenDays: 0, reservedDays: 0, closingDays: 0 };
  const closingDays = Number(balance.closingBalanceDays ?? 0);
  const reservedDays = Number(balance.pendingReservedDays ?? 0);
  const takenDays = Number(balance.takenDays ?? balance.usedDays ?? 0);
  const entitledDays = Number(
    (balance.entitlementDays ?? 0) +
      (balance.accruedDays ?? 0) +
      (balance.carriedForwardDays ?? 0) +
      (balance.adjustedDays ?? 0)
  );
  const availableDays =
    typeof balance.availableDays === 'number'
      ? balance.availableDays
      : Number((closingDays - reservedDays).toFixed(2));
  return {
    availableDays,
    entitledDays: Number(entitledDays.toFixed(2)),
    takenDays: Number(takenDays.toFixed(2)),
    reservedDays: Number(reservedDays.toFixed(2)),
    closingDays: Number(closingDays.toFixed(2)),
  };
}

/**
 * Reads a browser File object as pure base64 (stripping data:*;base64, prefix).
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function apiRequest(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };

  if (_authToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${_authToken}`;
  }

  const isMutating = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
  if (isMutating && _csrfToken && !headers['X-CSRF-Token']) {
    headers['X-CSRF-Token'] = _csrfToken;
  }

  let body = options.body;
  if (body !== undefined && body !== null && typeof body === 'object' && !(body instanceof FormData)) {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    body = JSON.stringify(body);
  }

  const res = await fetch(url, {
    ...options,
    method,
    headers,
    body,
    credentials: 'include',
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    if (
      res.status === 401 &&
      !url.includes('/api/v1/auth/login') &&
      !url.includes('/api/v1/auth/me') &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new CustomEvent('ndakala:unauthorized', { detail: { url } }));
    }
    const msg = json?.error?.message || json?.message || `HTTP ${res.status}: ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = json?.error?.code || 'REQUEST_FAILED';
    err.details = json?.error?.details;
    throw err;
  }

  if (json && Object.prototype.hasOwnProperty.call(json, 'data')) {
    return json.data;
  }
  return json;
}

export const apiGet = (url) => apiRequest(url, { method: 'GET' });
export const apiPost = (url, body) => apiRequest(url, { method: 'POST', body });
export const apiPatch = (url, body) => apiRequest(url, { method: 'PATCH', body });
export const apiPut = (url, body) => apiRequest(url, { method: 'PUT', body });
export const apiDelete = (url) => apiRequest(url, { method: 'DELETE' });

export async function apiDownload(url, defaultFilename = 'export.csv') {
  const headers = _authToken ? { Authorization: `Bearer ${_authToken}` } : {};
  const res = await fetch(url, { method: 'GET', headers, credentials: 'include' });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ndakala:unauthorized', { detail: { url } }));
    }
    let msg = `Download failed (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) msg = errJson.error.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const disp = res.headers.get('Content-Disposition') || '';
  const match = disp.match(/filename="?([^"]+)"?/i);
  const filename = match ? match[1] : defaultFilename;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
