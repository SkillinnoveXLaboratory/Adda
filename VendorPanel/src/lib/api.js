import { session as defaultSession } from './session.js';

/**
 * API origin. "/" (or missing) = same origin: Vercel rewrites / the Vite dev proxy forward /api and /media to the
 * backend, so the browser never makes a cross-origin call.
 */
export const API_ORIGIN = String(import.meta.env.VITE_API_BASE_URL || '/').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'ERROR';
    this.details = details;
  }
}

function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function readError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error */
  }
  const e = body?.error || {};
  const fallback =
    res.status === 429
      ? 'Too many requests. Please wait a moment and try again.'
      : res.status >= 500
        ? 'The server had a problem. Please try again.'
        : `Request failed (${res.status})`;
  return new ApiError(res.status, e.code || `HTTP_${res.status}`, e.message || fallback, e.details);
}

/**
 * API client factory (exported for tests).
 * - Bearer auth from the session store.
 * - On 401 TOKEN_EXPIRED: one shared refresh for all concurrent callers, rotate both tokens, retry once.
 * - Refresh failure or any other 401 → session cleared + onSessionEnd(reason).
 */
export function createApiClient({ origin = API_ORIGIN, store = defaultSession, fetchImpl, onSessionEnd } = {}) {
  const base = `${origin}/api/v1`;
  const doFetch = (...args) => (fetchImpl || globalThis.fetch)(...args);
  let refreshing = null;

  function endSession(reason) {
    if (store.get()) store.clear(reason);
    onSessionEnd?.(reason);
  }

  async function refreshTokens() {
    if (refreshing) return refreshing;
    const refreshToken = store.refreshToken;
    refreshing = (async () => {
      if (!refreshToken) throw new ApiError(401, 'NO_REFRESH_TOKEN', 'Your session ended. Please sign in again.');
      let res;
      try {
        res = await doFetch(`${base}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
      }
      if (!res.ok) throw await readError(res);
      const data = await res.json();
      if (!data?.accessToken || !data?.refreshToken) throw new ApiError(401, 'REFRESH_FAILED', 'Your session ended. Please sign in again.');
      store.setTokens(data.accessToken, data.refreshToken);
      return data;
    })();
    try {
      return await refreshing;
    } finally {
      refreshing = null;
    }
  }

  async function request(method, path, { body, query, auth = true, retry = true, signal, headers: extra } = {}) {
    const url = `${base}${path}${buildQuery(query)}`;
    const headers = { Accept: 'application/json', ...extra };
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (auth && store.accessToken) headers.Authorization = `Bearer ${store.accessToken}`;

    let res;
    try {
      res = await doFetch(url, { method, headers, signal, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
    }

    if (res.status === 401 && auth && store.accessToken) {
      const err = await readError(res);
      if (err.code === 'TOKEN_EXPIRED' && retry) {
        try {
          await refreshTokens();
        } catch (refreshErr) {
          endSession('expired');
          throw new ApiError(401, refreshErr.code || 'SESSION_EXPIRED', 'Your session ended. Please sign in again.');
        }
        return request(method, path, { body, query, auth, retry: false, signal, headers: extra });
      }
      endSession(err.code === 'ACCOUNT_DISABLED' ? 'disabled' : 'expired');
      throw err;
    }
    if (!res.ok) throw await readError(res);
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    request,
    refreshTokens,
    get: (path, query, opts) => request('GET', path, { ...opts, query }),
    post: (path, body, opts) => request('POST', path, { ...opts, body: body ?? {} }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body: body ?? {} }),
    put: (path, body, opts) => request('PUT', path, { ...opts, body: body ?? {} }),
    del: (path, body, opts) => request('DELETE', path, { ...opts, body }),
    /** Multipart upload: extra fields first (the server reads `purpose`), then the `file` field. */
    upload: (path, file, fields = {}, opts) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      fd.append('file', file);
      return request('POST', path, { ...opts, body: fd });
    },
  };
}

let sessionEndHandler = null;
/** The auth provider registers a handler so the UI can redirect to /login when the session ends. */
export function setSessionEndHandler(fn) {
  sessionEndHandler = fn;
}

export const api = createApiClient({ onSessionEnd: (reason) => sessionEndHandler?.(reason) });

/** Upload one file for a purpose (property | service | kyc) → media `{ _id, url, mimeType, size, originalName }`. */
export const uploadFile = (file, purpose) => api.upload('/uploads', file, { purpose });

/** Absolute URL for a backend-relative media path. */
export const mediaHref = (url) => (!url ? null : /^(https?:|blob:|data:)/.test(url) ? url : `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`);
