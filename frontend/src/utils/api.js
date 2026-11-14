let _csrfToken = null;

export function setCsrfToken(token) {
  _csrfToken = token || null;
}

export function getCsrfToken() {
  return _csrfToken;
}

export function unwrapList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

export async function apiRequest(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };

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
  const res = await fetch(url, { method: 'GET', credentials: 'include' });
  if (!res.ok) {
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
