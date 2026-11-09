import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../src/lib/api.js';
import { createSessionStore } from '../../src/lib/session.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const expired = () => json(401, { error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' } });

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

function setup(fetchImpl, session = { accessToken: 'old-access', refreshToken: 'old-refresh-token-1234567890', user: { _id: 'u1' } }) {
  const store = createSessionStore(memoryStorage());
  store.set(session);
  const onSessionEnd = vi.fn();
  const api = createApiClient({ origin: 'http://api.test', store, fetchImpl, onSessionEnd });
  return { api, store, onSessionEnd };
}

describe('api client', () => {
  it('sends the bearer token and parses JSON', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ok: true }));
    const { api } = setup(fetchImpl);
    await expect(api.get('/me')).resolves.toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/me');
    expect(init.headers.Authorization).toBe('Bearer old-access');
    expect(init.headers['X-Society-Id']).toBeUndefined();
  });

  it('routes /society calls to the managed society and skips empty query params', async () => {
    const fetchImpl = vi.fn(async () => json(200, {}));
    const { api } = setup(fetchImpl, { accessToken: 'a', refreshToken: 'r'.repeat(30), user: {}, scope: { _id: 'soc2', name: 'Green' } });
    await api.get('/society/invoices', { status: 'open', q: '', page: 2, overdue: undefined });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/platform/societies/soc2/manage/invoices?status=open&page=2');
    expect(init.headers['X-Action-Reason']).toBeUndefined(); // reads need no reason
    await api.get('/platform/overview');
    expect(fetchImpl.mock.calls[1][0]).toBe('http://api.test/api/v1/platform/overview');
  });

  it('asks for a reason before a change inside a managed society and sends it encoded', async () => {
    const fetchImpl = vi.fn(async () => json(200, {}));
    const askReason = vi.fn(async () => 'Admin asked — résumé ✓');
    const store = createSessionStore(memoryStorage());
    store.set({ accessToken: 'a', refreshToken: 'r'.repeat(30), user: {}, scope: { _id: 'soc2' } });
    const api = createApiClient({ origin: 'http://api.test', store, fetchImpl, askReason });
    await api.post('/society/buildings', { name: 'B' });
    expect(askReason).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', path: '/society/buildings' }));
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/platform/societies/soc2/manage/buildings');
    expect(decodeURIComponent(init.headers['X-Action-Reason'])).toBe('Admin asked — résumé ✓');
  });

  it('reuses a reason already in the body and cancels when none is given', async () => {
    const fetchImpl = vi.fn(async () => json(200, {}));
    const askReason = vi.fn(async () => null);
    const store = createSessionStore(memoryStorage());
    store.set({ accessToken: 'a', refreshToken: 'r'.repeat(30), user: {}, scope: { _id: 'soc2' } });
    const api = createApiClient({ origin: 'http://api.test', store, fetchImpl, askReason });
    await api.post('/society/memberships/m1/reject', { reason: 'Not a resident' });
    expect(askReason).not.toHaveBeenCalled();
    expect(decodeURIComponent(fetchImpl.mock.calls[0][1].headers['X-Action-Reason'])).toBe('Not a resident');
    await expect(api.post('/society/buildings', { name: 'B' })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never rewrites /society paths when no society is being managed', async () => {
    const fetchImpl = vi.fn(async () => json(200, {}));
    const { api } = setup(fetchImpl);
    await api.post('/society/buildings', { name: 'B' });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://api.test/api/v1/society/buildings');
  });

  it('refreshes once for concurrent TOKEN_EXPIRED responses, rotates both tokens and retries', async () => {
    let refreshCalls = 0;
    const fetchImpl = vi.fn(async (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        expect(JSON.parse(init.body).refreshToken).toBe('old-refresh-token-1234567890');
        await new Promise((r) => setTimeout(r, 20));
        return json(200, { accessToken: 'new-access', refreshToken: 'new-refresh-token-1234567890' });
      }
      return init.headers.Authorization === 'Bearer new-access' ? json(200, { url }) : expired();
    });
    const { api, store } = setup(fetchImpl);
    const [a, b, c] = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(refreshCalls).toBe(1);
    expect([a.url, b.url, c.url].map((u) => u.split('/').pop())).toEqual(['a', 'b', 'c']);
    expect(store.accessToken).toBe('new-access');
    expect(store.refreshToken).toBe('new-refresh-token-1234567890');
  });

  it('signs out when the refresh fails', async () => {
    const fetchImpl = vi.fn(async (url) => (url.endsWith('/auth/refresh') ? json(401, { error: { code: 'SESSION_INVALID', message: 'Session has ended' } }) : expired()));
    const { api, store, onSessionEnd } = setup(fetchImpl);
    await expect(api.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(store.get()).toBeNull();
    expect(onSessionEnd).toHaveBeenCalledWith('expired');
  });

  it('signs out on SESSION_INVALID / ACCOUNT_DISABLED without trying to refresh', async () => {
    for (const [code, reason] of [
      ['SESSION_INVALID', 'expired'],
      ['ACCOUNT_DISABLED', 'disabled'],
    ]) {
      const fetchImpl = vi.fn(async () => json(401, { error: { code, message: 'x' } }));
      const { api, store, onSessionEnd } = setup(fetchImpl);
      await expect(api.get('/me')).rejects.toMatchObject({ code });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(store.get()).toBeNull();
      expect(onSessionEnd).toHaveBeenCalledWith(reason);
    }
  });

  it('retries only once if the retried call is still expired', async () => {
    const fetchImpl = vi.fn(async (url) => (url.endsWith('/auth/refresh') ? json(200, { accessToken: 'n', refreshToken: 'n'.repeat(30) }) : expired()));
    const { api, onSessionEnd } = setup(fetchImpl);
    await expect(api.get('/me')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // call, refresh, retry
    expect(onSessionEnd).toHaveBeenCalled();
  });

  it('surfaces the API error message and code', async () => {
    const fetchImpl = vi.fn(async () => json(409, { error: { code: 'INVOICE_PAID', message: 'This invoice is already paid' } }));
    const { api } = setup(fetchImpl);
    await expect(api.post('/x', {})).rejects.toMatchObject({ status: 409, code: 'INVOICE_PAID', message: 'This invoice is already paid' });
  });

  it('maps network failures to a friendly error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { api } = setup(fetchImpl);
    await expect(api.get('/me')).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('public calls send no Authorization header', async () => {
    const fetchImpl = vi.fn(async () => json(200, {}));
    const { api } = setup(fetchImpl);
    await api.post('/auth/admin/login', { email: 'a@b.co', password: 'x' }, { auth: false });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});

describe('api client: permission changes', () => {
  it('reports a 403 PERMISSION_DENIED (so the profile is re-read) but not other errors', async () => {
    const store = createSessionStore(memoryStorage());
    store.set({ accessToken: 'a', refreshToken: 'r'.repeat(30), user: { _id: 'u1' } });
    const responses = [json(403, { error: { code: 'PERMISSION_DENIED', message: 'No' } }), json(404, { error: { code: 'NOT_FOUND', message: 'Gone' } })];
    const onPermissionDenied = vi.fn();
    const api = createApiClient({ origin: 'http://api.test', store, fetchImpl: async () => responses.shift(), onPermissionDenied });
    await expect(api.get('/platform/settings')).rejects.toMatchObject({ status: 403, code: 'PERMISSION_DENIED' });
    expect(onPermissionDenied).toHaveBeenCalledTimes(1);
    await expect(api.get('/platform/vendors/x')).rejects.toMatchObject({ status: 404 });
    expect(onPermissionDenied).toHaveBeenCalledTimes(1);
    expect(store.get()).not.toBeNull(); // a permission change never signs the user out
  });
});
