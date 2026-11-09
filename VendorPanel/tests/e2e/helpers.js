import { expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

/** Direct API access for seeding (LOCAL backend only — see playwright.config.js). */
export const API = (process.env.API_BASE || 'http://127.0.0.1:3013').replace(/\/$/, '') + '/api/v1';
export const OWNER = { email: process.env.SA_EMAIL || 'admin@addaapp.local', password: process.env.SA_PASSWORD || 'DevAdmin12345' };
export const PASSWORD = 'Vendor2026secure';
export const RUN = Date.now().toString(36).slice(-5).toUpperCase();
export const randPhone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

export async function apiCall(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

export const ownerToken = async () => (await apiCall('POST', '/auth/admin/login', { body: OWNER })).accessToken;

/** The vendor session the panel keeps in sessionStorage (tokens + user). */
export const panelSession = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('nivasa.vendor.session') || 'null'));

export async function expectToast(page, text) {
  await expect(page.getByTestId('toast-success').filter({ hasText: text }).first()).toBeVisible();
}

export const dialog = (page) => page.locator('[role="dialog"][aria-modal="true"]').last();

// Real 1×1 PNG bytes (the server sniffs magic bytes). Each upload gets its own media id.
const PNGS = [
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
];
export const png = (i, name) => ({ name: name || `photo-${i}.png`, mimeType: 'image/png', buffer: Buffer.from(PNGS[i % PNGS.length], 'base64') });

// Verhoeff check digit, to build valid test Aadhaar numbers.
const D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
export const aadhaar = () => {
  const base = `2${String(Date.now()).slice(-10)}`;
  return base + INV[base.split('').reverse().reduce((c, d, i) => D[c][P[(i + 1) % 8][Number(d)]], 0)];
};
export const pan = () => `ABCDE${String(Date.now()).slice(-4)}F`;
export const istDay = (offset = 0) => new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);

/** Sign up a vendor through the UI. Returns { phone, name, business }. */
export async function registerInUi(page, { name = `Ravi ${RUN}`, business = `Ravi Plumbing ${RUN}`, phone = randPhone() } = {}) {
  await page.goto('/register');
  await page.fill('#name', name);
  await page.fill('#businessName', business);
  await page.fill('#phone', phone);
  await page.fill('#new-password', PASSWORD);
  await page.fill('#confirm-password', PASSWORD);
  await page.getByTestId('register-submit').click();
  await page.waitForURL('**/dashboard');
  return { phone, name, business };
}

/** Fill and submit the KYC form (three document uploads). */
export async function submitKycInUi(page, { business = `Ravi Plumbing ${RUN}` } = {}) {
  await page.goto('/kyc');
  const form = page.getByTestId('kyc-form');
  await expect(form).toBeVisible();
  await form.locator('[name=businessName]').fill(business);
  await form.locator('[name=city]').fill('Pune');
  await form.locator('[name=pan]').fill(pan());
  await form.locator('[name=aadhaar]').fill(aadhaar());
  await form.locator('[name=bankAccountHolder]').fill('Ravi Kumar');
  await form.locator('[name=bankAccountNumber]').fill('50100123456789');
  await form.locator('[name=confirmAccount]').fill('50100123456789');
  await form.locator('[name=bankIfsc]').fill('SBIN0001234');
  const docs = ['panPhoto', 'aadhaarFront', 'aadhaarBack'];
  for (const [i, key] of docs.entries()) {
    await page.getByTestId(`upload-${key}-input`).setInputFiles(png(i, `${key}.png`));
    await expect(page.getByTestId(`upload-${key}`).locator('img')).toHaveCount(1);
  }
  await page.getByTestId('kyc-consent').check();
  await page.getByTestId('kyc-submit').click();
  await expectToast(page, 'KYC submitted for review');
  await expect(page.getByTestId('kyc-status')).toContainText('Under review');
}
