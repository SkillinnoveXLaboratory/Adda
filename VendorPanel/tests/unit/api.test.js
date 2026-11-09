import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../src/lib/api.js';
import { createSessionStore } from '../../src/lib/session.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

function setup(responses) {
  const store = createSessionStore(memory());
  store.set({ accessToken: 'a1', refreshToken: 'r1', user: { _id: 'u', accountType: 'vendor' } });
  const calls = [];
  const fetchImpl = vi.fn(async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    return typeof next === 'function' ? next(url, init) : next;
  });
  const onSessionEnd = vi.fn();
  const client = createApiClient({ origin: '', store, fetchImpl, onSessionEnd });
  return { store, client, calls, onSessionEnd };
}

describe('api client', () => {
  it('uses the same-origin /api/v1 base and a bearer token', async () => {
    const { client, calls } = setup([json(200, { ok: true })]);
    await client.get('/vendor/dashboard', { status: 'open', empty: '' });
    expect(calls[0].url).toBe('/api/v1/vendor/dashboard?status=open');
    expect(calls[0].init.headers.Authorization).toBe('Bearer a1');
  });

  it('refreshes once on TOKEN_EXPIRED, rotates both tokens and retries', async () => {
    const { client, store, calls } = setup([json(401, { error: { code: 'TOKEN_EXPIRED' } }), json(200, { accessToken: 'a2', refreshToken: 'r2' }), json(200, { items: [] })]);
    const res = await client.get('/vendor/bookings');
    expect(res).toEqual({ items: [] });
    expect(calls[1].url).toBe('/api/v1/auth/refresh');
    expect(JSON.parse(calls[1].init.body)).toEqual({ refreshToken: 'r1' });
    expect(store.accessToken).toBe('a2');
    expect(store.refreshToken).toBe('r2');
    expect(calls[2].init.headers.Authorization).toBe('Bearer a2');
  });

  it('ends the session when the refresh fails', async () => {
    const { client, store, onSessionEnd } = setup([json(401, { error: { code: 'TOKEN_EXPIRED' } }), json(401, { error: { code: 'SESSION_INVALID' } })]);
    await expect(client.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(store.get()).toBeNull();
    expect(onSessionEnd).toHaveBeenCalledWith('expired');
  });

  it('ends the session on any other 401 without refreshing', async () => {
    const { client, store, calls, onSessionEnd } = setup([json(401, { error: { code: 'VENDOR_USE_PANEL', message: 'x' } })]);
    await expect(client.get('/me')).rejects.toMatchObject({ code: 'VENDOR_USE_PANEL' });
    expect(calls).toHaveLength(1);
    expect(store.get()).toBeNull();
    expect(onSessionEnd).toHaveBeenCalledWith('expired');
  });

  it('shares one refresh between concurrent requests', async () => {
    let refreshes = 0;
    const responses = (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1;
        return json(200, { accessToken: 'a2', refreshToken: 'r2' });
      }
      return init.headers.Authorization === 'Bearer a1' ? json(401, { error: { code: 'TOKEN_EXPIRED' } }) : json(200, { ok: 1 });
    };
    const { client } = setup(Array.from({ length: 10 }, () => responses));
    await Promise.all([client.get('/a'), client.get('/b')]);
    expect(refreshes).toBe(1);
  });

  it('turns server errors into readable messages and keeps the code', async () => {
    const { client, store } = setup([json(403, { error: { code: 'NOT_VENDOR', message: 'This is a member account.' } })]);
    await expect(client.post('/auth/vendor/login', { phone: '9', password: 'x' }, { auth: false })).rejects.toMatchObject({ status: 403, code: 'NOT_VENDOR', message: 'This is a member account.' });
    expect(store.get()).not.toBeNull();
  });

  it('uploads multipart with the purpose field first and no JSON content type', async () => {
    const { client, calls } = setup([json(201, { _id: 'm1' })]);
    const file = new File(['x'], 'pan.png', { type: 'image/png' });
    await client.upload('/uploads', file, { purpose: 'kyc' });
    const body = calls[0].init.body;
    expect(body).toBeInstanceOf(FormData);
    expect([...body.keys()]).toEqual(['purpose', 'file']);
    expect(calls[0].init.headers['Content-Type']).toBeUndefined();
  });

  it('never stores a password in the session', async () => {
    const storage = memory();
    const store = createSessionStore(storage);
    store.set({ accessToken: 'a', refreshToken: 'r', user: { name: 'V' } });
    expect(storage.getItem('nivasa.vendor.session')).not.toMatch(/password/i);
  });
});
