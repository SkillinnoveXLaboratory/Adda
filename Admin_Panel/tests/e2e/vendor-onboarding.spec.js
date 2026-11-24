import { test, expect } from '@playwright/test';
import { API, RUN, apiCall, ownerLogin, ownerToken } from './helpers.js';

/**
 * skills/admin-vendor-onboarding — UI walkthrough against the LOCAL backend:
 * owner fills "Add vendor" (account, shop + logo, rates, KYC + 3 documents, approve) → vendor page shows
 * "Added by" and approved KYC; field errors appear next to fields; 360 px has no sideways scroll;
 * a sub-admin's vendor shows up in Sub-admins → Activity.
 */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const file = (name) => ({ name, mimeType: 'image/png', buffer: PNG });
const STAMP = Date.now();
const phone = (n) => `7${String(STAMP + n * 6151).slice(-9)}`;
const D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
const aadhaar = (b) => b + INV[b.split('').reverse().reduce((c, d, i) => D[c][P[(i + 1) % 8][Number(d)]], 0)];

test('owner adds a vendor with KYC from the panel', async ({ page }) => {
  await ownerLogin(page);
  await page.goto('/admin/vendors');
  await page.getByRole('link', { name: /Add vendor/ }).or(page.getByRole('button', { name: /Add vendor/ })).first().click();
  await expect(page.getByTestId('vendor-new')).toBeVisible();

  // Empty submit → errors next to the fields, nothing created.
  await page.getByTestId('vendor-create').click();
  await expect(page.getByText(/Enter|Required|required/).first()).toBeVisible();

  await page.getByTestId('vendor-name').fill(`Panel Vendor ${RUN}`);
  await page.getByTestId('vendor-phone').fill(phone(1));
  await page.getByTestId('vendor-email').fill(`panel.${RUN}@example.com`.toLowerCase());
  const pw = page.locator('input[type=password]');
  await pw.nth(0).fill('PanelVendor2026!');
  await pw.nth(1).fill('PanelVendor2026!');
  await page.getByTestId('vendor-shop-name').fill(`Panel Shop ${RUN}`);
  await page.locator('[data-testid] input[type=file]').first().setInputFiles(file('logo.png'));
  await page.getByTestId('vendor-commission').fill('15');
  await page.getByTestId('vendor-discount').fill('40');

  await page.getByText('Add KYC now').click();
  const kyc = page.getByTestId('kyc-form');
  await expect(kyc).toBeVisible();
  await kyc.locator('input[name=businessName]').fill(`Panel Traders ${RUN}`);
  await kyc.locator('input[name=city]').fill('Nagpur');
  await kyc.locator('input[name=pan]').fill(`ABCPP${String(STAMP).slice(-4)}Z`);
  await kyc.locator('input[name=aadhaar]').fill(aadhaar(`6${String(STAMP).slice(-10)}`));
  await kyc.locator('input[name=bankAccountHolder]').fill('Panel Owner');
  const acct = `8100${String(STAMP).slice(-8)}`;
  await kyc.locator('input[name=bankAccountNumber]').fill(acct);
  await kyc.locator('input[name=bankAccountConfirm]').fill(acct);
  await kyc.locator('input[name=bankIfsc]').fill('HDFC0004321');
  for (const k of ['panPhoto', 'aadhaarFront', 'aadhaarBack']) await page.getByTestId(`kyc-doc-${k}-input`).setInputFiles(file(`${k}.png`));
  await kyc.locator('input[name=vendorConsent]').check();
  await kyc.locator('input[name=approve]').check();
  await expect(page.getByTestId('vendor-create')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('vendor-create').click();

  await expect(page).toHaveURL(/\/admin\/vendors\/[a-f0-9]{24}/, { timeout: 30_000 });
  await expect(page.getByText(/Added by/).first()).toBeVisible();
  await expect(page.getByText(/Approved/i).first()).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body.includes(acct)).toBeFalsy(); // never shows the full account number
});

test('Add vendor form fits a 360 px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await ownerLogin(page);
  await page.goto('/admin/vendors/new');
  await page.getByText('Add KYC now').click();
  await expect(page.getByTestId('kyc-form')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("owner sees a sub-admin's added vendor in Activity", async ({ page }) => {
  const T = await ownerToken();
  const email = `act.${RUN}@example.com`.toLowerCase();
  const sub = await apiCall('POST', '/platform/subadmins', { token: T, body: { name: `Activity Sub ${RUN}`, email, password: 'SubAdmin2026secure', permissions: ['vendors.manage'] } });
  const login = await fetch(`${API}/auth/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'SubAdmin2026secure' }) }).then((r) => r.json());
  const v = await apiCall('POST', '/platform/vendors', { token: login.accessToken, body: { name: `Sub Vendor ${RUN}`, phone: phone(2), email: `subv.${RUN}@example.com`.toLowerCase(), password: 'SubVendor2026!!' } });
  await ownerLogin(page);
  await page.goto('/admin/subadmins');
  await page.getByRole('button', { name: `Activity of Activity Sub ${RUN}` }).click();
  const drawer = page.getByTestId('subadmin-activity');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId('activity-item').first()).toContainText(/vendor/i);
  await drawer.getByTestId('activity-target').first().click();
  await expect(page).toHaveURL(new RegExp(`/admin/vendors/${v._id}`));
  await expect(page.getByText(`Activity Sub ${RUN}`).first()).toBeVisible();
  expect(sub._id).toBeTruthy();
});
