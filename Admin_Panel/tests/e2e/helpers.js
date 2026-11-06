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

// ------------------------------------------------------------------ vendors (KYC, listings, ads)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
export async function upload(token, purpose) {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', new Blob([PNG], { type: 'image/png' }), `${purpose}.png`);
  const res = await fetch(`${API}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`upload ${purpose} → ${res.status} ${JSON.stringify(json)}`);
  return json._id;
}
const VD = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const VP = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const VINV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
/** 11 digits → 12-digit Verhoeff-valid test Aadhaar. */
export const withVerhoeff = (base11) => base11 + VINV[base11.split('').reverse().reduce((c, d, i) => VD[c][VP[(i + 1) % 8][Number(d)]], 0)];

/** Registers a vendor and submits KYC (status pending). Returns ids, token and the plain KYC numbers. */
export async function seedVendorWithKyc(name, business) {
  const phone = randPhone();
  const reg = await apiCall('POST', '/auth/resident/register', { body: { phone, name, password: PASSWORD, accountType: 'vendor' } });
  const token = reg.accessToken;
  const docs = [await upload(token, 'kyc'), await upload(token, 'kyc'), await upload(token, 'kyc')];
  const stamp = String(Date.now() + Math.floor(Math.random() * 1e6));
  const kyc = { pan: `PQRST${stamp.slice(-4)}K`, aadhaar: withVerhoeff(`4${stamp.slice(-10)}`), bankAccountNumber: `7002${stamp.slice(-8)}` };
  await apiCall('PUT', '/vendor/kyc', { token, body: { businessName: business, businessType: 'business', city: 'Kolkata', address: '7 Park Street', ...kyc, bankAccountHolder: name, bankIfsc: 'HDFC0001234', bankName: 'HDFC Bank', panPhoto: docs[0], aadhaarFront: docs[1], aadhaarBack: docs[2], consent: true } });
  return { id: reg.user._id, token, phone, name, business, ...kyc };
}
