import { API_BASE, API_URL, REQUEST_TIMEOUT_MS } from './config';
import { getItem, removeItem, setItem } from './storage';
import { Platform } from 'react-native';
import { File as ExpoFile } from 'expo-file-system';

const ACCESS_KEY = 'adda.accessToken';
const REFRESH_KEY = 'adda.refreshToken';
const SOCIETY_KEY = 'adda.societyId';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken = null;
let refreshToken = null;
let societyId = null;
let refreshInFlight = null;
let onSessionEnded = () => {};

export const session = {
  async load() {
    [accessToken, refreshToken, societyId] = await Promise.all([getItem(ACCESS_KEY), getItem(REFRESH_KEY), getItem(SOCIETY_KEY)]);
    return !!refreshToken;
  },
  async save(tokens) {
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    await Promise.all([setItem(ACCESS_KEY, accessToken), setItem(REFRESH_KEY, refreshToken)]);
  },
  async clear() {
    accessToken = null;
    refreshToken = null;
    societyId = null;
    await Promise.all([removeItem(ACCESS_KEY), removeItem(REFRESH_KEY), removeItem(SOCIETY_KEY)]);
  },
  async setSociety(id) {
    societyId = id ? String(id) : null;
    if (societyId) await setItem(SOCIETY_KEY, societyId);
    else await removeItem(SOCIETY_KEY);
  },
  get societyId() {
    return societyId;
  },
  get hasSession() {
    return !!refreshToken;
  },
  authHeader() {
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  },
  onEnded(fn) {
    onSessionEnded = fn;
  },
};

const NETWORK_MESSAGE = "Can't reach the server. Check your internet connection and try again.";

async function rawFetch(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    // Shown as a friendly network message, but keep the real cause visible while developing.
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[api] request failed before a response:', url, err?.message || err);
    throw new ApiError(0, err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', err?.name === 'AbortError' ? 'The server took too long to respond. Please try again.' : NETWORK_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
}

async function parse(res) {
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const e = body?.error || {};
    throw new ApiError(res.status, e.code || `HTTP_${res.status}`, e.message || 'Something went wrong. Please try again.', e.details);
  }
  return body;
}

/** One refresh at a time; concurrent 401s wait for the same rotation. */
async function refreshTokens() {
  if (!refreshToken) throw new ApiError(401, 'SESSION_INVALID', 'Please sign in again.');
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const res = await rawFetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const body = await parse(res);
      await session.save(body);
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Vendor accounts now use the Vendor Panel website: the server ends their old app sessions with 401 VENDOR_USE_PANEL. */
const SESSION_ENDING_CODES = new Set(['SESSION_INVALID', 'ACCOUNT_DISABLED', 'TOKEN_INVALID', 'VENDOR_USE_PANEL']);

/**
 * JSON API request. Options: method, body (object or FormData), auth (default true), query (object).
 * Throws ApiError with the server's code/message.
 */
export async function api(path, { method = 'GET', body, auth = true, query, retry = true, timeoutMs } = {}) {
  let url = `${API_BASE}${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = { Accept: 'application/json' };
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  if (auth) Object.assign(headers, session.authHeader());
  if (auth && societyId) headers['X-Society-Id'] = societyId;

  const res = await rawFetch(url, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined }, timeoutMs);
  if (res.status === 401 && auth && retry) {
    const peek = await res.clone().json().catch(() => ({}));
    const code = peek?.error?.code;
    if (code === 'TOKEN_EXPIRED' && refreshToken) {
      try {
        await refreshTokens();
      } catch (err) {
        await endSession(err?.code);
        if (err?.code === 'VENDOR_USE_PANEL') throw err;
        throw err instanceof ApiError ? new ApiError(401, 'SESSION_INVALID', 'Your session has ended. Please sign in again.') : err;
      }
      return api(path, { method, body, auth, query, retry: false, timeoutMs });
    }
    // Only end a session that still exists — a late response after a deliberate logout must not show "session ended".
    if (SESSION_ENDING_CODES.has(code) && refreshToken) {
      await endSession(code);
    }
  }
  return parse(res);
}

async function endSession(reason) {
  if (!refreshToken && !accessToken) return; // already signed out
  await session.clear();
  onSessionEnded(reason);
}

/** Seconds until the access token expires (JWT `exp`), or 0 when unknown/expired. */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decodeBase64Url(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  let out = '';
  let bits = 0;
  let value = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 255);
    }
  }
  return out;
}
export function tokenSecondsLeft(token = accessToken) {
  try {
    const { exp } = JSON.parse(decodeBase64Url(String(token).split('.')[1]));
    return Math.max(0, exp - Math.floor(Date.now() / 1000));
  } catch {
    return 0;
  }
}

function buildUploadForm(asset, purpose) {
  const form = new FormData();
  const name = asset.fileName || asset.name || `upload-${Date.now()}.${(asset.mimeType || 'image/jpeg').split('/')[1] || 'jpg'}`;
  if (asset.file) {
    // Web: the browser's File from the picker.
    form.append('file', asset.file, name);
  } else if (Platform.OS === 'web') {
    form.append('file', { uri: asset.uri, name, type: asset.mimeType || 'image/jpeg' });
  } else {
    // Native: Expo SDK 58 replaces fetch with expo/fetch, which cannot send React Native's { uri, name, type }
    // FormData parts (it throws before any network traffic — the app then showed "Can't reach the server").
    // An expo-file-system File exposes bytes()/name/type, which expo/fetch encodes as a normal multipart file.
    form.append('file', new ExpoFile(asset.uri), name);
  }
  form.append('purpose', purpose);
  return form;
}

/**
 * Upload one picked image/document to /uploads.
 * A photo is several MB: if the session has expired, the server's 401 arrives while the phone is still sending and
 * Android reports it as a dropped connection (never as 401), so the usual refresh-and-retry can't happen.
 * So: renew the session first when it is expired or about to expire, and after a dropped connection renew + retry once.
 */
/** Photos are several MB; on slow mobile data the normal 20 s limit is too short. */
const UPLOAD_TIMEOUT_MS = 90_000;

export async function uploadFile(asset, purpose) {
  if (refreshToken && tokenSecondsLeft() < 60) {
    try {
      await refreshTokens();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await endSession(err.code);
        throw new ApiError(401, 'SESSION_INVALID', 'Your session has ended. Please sign in again.');
      }
      throw err;
    }
  }
  try {
    return await api('/uploads', { method: 'POST', body: buildUploadForm(asset, purpose), timeoutMs: UPLOAD_TIMEOUT_MS });
  } catch (err) {
    if (err?.code !== 'NETWORK' || !refreshToken) throw err;
    await refreshTokens().catch(() => {});
    try {
      return await api('/uploads', { method: 'POST', body: buildUploadForm(asset, purpose), timeoutMs: UPLOAD_TIMEOUT_MS });
    } catch (retryErr) {
      if (retryErr?.code === 'NETWORK') throw new ApiError(0, 'NETWORK', 'The photo could not be uploaded. Check your connection (Wi-Fi works best for large photos) and try again.');
      throw retryErr;
    }
  }
}

/** Absolute URL for server-relative paths (media links are already absolute). */
export const absoluteUrl = (u) => (!u ? null : /^https?:\/\//.test(u) ? u : `${API_URL}${u.startsWith('/') ? '' : '/'}${u}`);

export { API_BASE, API_URL };
