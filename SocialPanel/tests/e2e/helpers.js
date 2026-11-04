import { expect } from '@playwright/test';

/** Direct API access for seeding (local backend only). */
export const API = (process.env.API_BASE || 'http://127.0.0.1:3013').replace(/\/$/, '') + '/api/v1';
export const SA = { email: process.env.SA_EMAIL || 'admin@addaapp.local', password: process.env.SA_PASSWORD || 'DevAdmin12345' };
export const PASSWORD = 'Adda2026secure';
export const RUN = Date.now().toString(36).toUpperCase();
export const randPhone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

export async function apiCall(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

export async function login(page, email, password) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('[data-testid=login-submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

export async function expectToast(page, text) {
  await expect(page.getByTestId('toast-success').filter({ hasText: text }).first()).toBeVisible();
}

/** The top-most open dialog. */
export const dialog = (page) => page.locator('[role="dialog"][aria-modal="true"]').last();

// 1×1 PNG
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
