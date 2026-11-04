import { session as defaultSession } from './session.js';

export const API_ORIGIN = String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:3013').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'ERROR';
    this.details = details;
  }
}

/** Codes that mean the session is gone for good — sign out locally. */
const SESSION_END_CODES = new Set(['SESSION_INVALID', 'ACCOUNT_DISABLED', 'TOKEN_INVALID', 'UNAUTHORIZED']);

/**
 * While the owner manages one society (Society workspace), the reused society-admin screens call
 * `/society/...`; those calls go to `/platform/societies/:sid/manage/...` for the chosen society.
 */
export function scopePath(path, societyId) {
  if (!societyId || !(path === '/society' || path.startsWith('/society/') || path.startsWith('/society?'))) return path;
  return `/platform/societies/${societyId}/manage${path.slice('/society'.length)}`;
}

export const isWrite = (method) => !['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase());

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
 * - Bearer auth from the session store; `/society/...` calls are scoped to the managed society (see scopePath).
 * - On 401 TOKEN_EXPIRED: one shared refresh for all concurrent callers, rotate both tokens, retry once.
 * - Refresh failure or a dead-session code → session cleared + onSessionEnd(reason).
 */
export function createApiClient({ origin = API_ORIGIN, store = defaultSession, fetchImpl, onSessionEnd, askReason } = {}) {
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
      if (!refreshToken) throw new ApiError(401, 'NO_REFRESH_TOKEN', 'Your session has ended. Please sign in again.');
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
      if (!data?.accessToken || !data?.refreshToken) throw new ApiError(401, 'REFRESH_FAILED', 'Your session has ended. Please sign in again.');
      store.setTokens(data.accessToken, data.refreshToken);
      return data;
    })();
    try {
      return await refreshing;
    } finally {
      refreshing = null;
    }
  }

  async function request(method, path, { body, query, auth = true, raw = false, retry = true, signal, headers: extra, reason } = {}) {
    const target = auth ? scopePath(path, store.scope?._id) : path;
    // Every change the owner makes inside a society needs a reason (sent as X-Action-Reason, written to the audit log).
    if (target !== path && isWrite(method) && !extra?.['X-Action-Reason']) {
      // A reason the screen already collected (reject / suspend / reverse …) is reused instead of asking twice.
      const given = typeof body?.reason === 'string' && body.reason.trim().length >= 3 ? body.reason.trim() : null;
      const why = reason || given || (await askReason?.({ method, path, society: store.scope }));
      if (!why) throw new ApiError(0, 'CANCELLED', 'Cancelled — no reason given.');
      extra = { ...extra, 'X-Action-Reason': encodeURIComponent(why) };
    }
    const url = `${base}${target}${buildQuery(query)}`;
    const headers = { Accept: raw ? '*/*' : 'application/json', ...extra };
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

    if (res.status === 401 && auth) {
      const err = await readError(res);
      if (err.code === 'TOKEN_EXPIRED' && retry) {
        try {
          await refreshTokens();
        } catch (refreshErr) {
          endSession('expired');
          throw new ApiError(401, refreshErr.code || 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
        }
        return request(method, path, { body, query, auth, raw, retry: false, signal, headers: extra });
      }
      if (SESSION_END_CODES.has(err.code) || err.code === 'TOKEN_EXPIRED') endSession(err.code === 'ACCOUNT_DISABLED' ? 'disabled' : 'expired');
      throw err;
    }
    if (!res.ok) throw await readError(res);
    if (raw) return res;
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
    /** Multipart upload: `file` field + extra fields. */
    upload: (path, file, fields = {}, opts) => {
      const fd = new FormData();
      fd.append('file', file);
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      return request('POST', path, { ...opts, body: fd });
    },
    /** Authenticated GET returning a Blob (+ server filename when exposed). */
    async blob(path, query, opts) {
      const res = await request('GET', path, { ...opts, query, raw: true });
      const cd = res.headers.get('content-disposition') || '';
      const m = /filename="?([^";]+)"?/i.exec(cd);
      return { blob: await res.blob(), filename: m?.[1] || null, type: res.headers.get('content-type') };
    },
  };
}

let sessionEndHandler = null;
let reasonAsker = null;
/** The app registers a dialog that resolves to the typed reason (or null when cancelled). */
export function setReasonAsker(fn) {
  reasonAsker = fn;
}
/** The auth provider registers a handler so the UI can redirect to /login when the session ends. */
export function setSessionEndHandler(fn) {
  sessionEndHandler = fn;
}

export const api = createApiClient({ onSessionEnd: (reason) => sessionEndHandler?.(reason), askReason: (ctx) => (reasonAsker ? reasonAsker(ctx) : Promise.resolve(null)) });

/** Save a Blob to disk via a temporary object URL. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Absolute URL for a backend-relative media path. */
export const mediaHref = (url) => (!url ? null : /^https?:\/\//.test(url) ? url : `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`);
