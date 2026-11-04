import { expect } from '@playwright/test';
import { superAdminLogin } from '../../scripts/sa-login.mjs';

/** Direct API access for seeding (local backend only). */
export const API = (process.env.API_BASE || 'http://127.0.0.1:3013').replace(/\/$/, '') + '/api/v1';
export const SA = { email: process.env.SA_EMAIL || 'admin@addaapp.local', password: process.env.SA_PASSWORD || 'DevAdmin12345' };
export const PASSWORD = 'Adda2026secure';
export const RUN = Date.now().toString(36).toUpperCase();
export const randPhone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

export async function apiCall(method, path, { token, body, reason } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(reason ? { 'X-Action-Reason': encodeURIComponent(reason) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

/** Owner API token. */
export async function ownerToken() {
  const r = await superAdminLogin(API, SA.email, SA.password);
  if (r.status !== 200) throw new Error(`owner sign-in failed: ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

/** UI sign-in with email + password. */
export async function ownerLogin(page) {
  await page.goto('/login');
  await page.fill('#email', SA.email);
  await page.fill('#password', SA.password);
  await page.click('[data-testid=login-submit]');
  await expect(page.getByTestId('platform-dashboard')).toBeVisible();
}

export async function expectToast(page, text) {
  await expect(page.getByTestId('toast-success').filter({ hasText: text }).first()).toBeVisible();
}

/** The top-most open dialog. */
export const dialog = (page) => page.locator('[role="dialog"][aria-modal="true"]').last();

/** Fill and confirm the "Reason for this change" prompt shown before every change inside a managed society. */
export async function giveReason(page, reason) {
  const d = dialog(page);
  await expect(d.getByText('Reason for this change')).toBeVisible();
  await d.locator('textarea[name=reason]').fill(reason);
  await d.getByRole('button', { name: 'Continue' }).click();
}
