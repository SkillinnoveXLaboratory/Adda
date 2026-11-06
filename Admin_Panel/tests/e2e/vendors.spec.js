import { expect, test } from '@playwright/test';
import { apiCall, dialog, expectToast, ownerLogin, ownerToken, RUN, seedVendorWithKyc, upload } from './helpers.js';

/**
 * Vendors & ads, against the LOCAL backend:
 * seed (API): vendor A with KYC pending; vendor B approved, with an approved property and a pending boost →
 * owner reviews A's KYC (masked numbers, documents, logged reveal, reject needs a note, approve) →
 * owner approves B's ad from the drawer → it moves to Active → accounts list shows the vendor type.
 */
test.describe.configure({ mode: 'serial' });

let page;
let T;
const seed = {};

test.beforeAll(async ({ browser }) => {
  T = await ownerToken();
  seed.a = await seedVendorWithKyc(`Ritu Vendor ${RUN}`, `Ritu Interiors ${RUN}`);
  seed.b = await seedVendorWithKyc(`Amit Vendor ${RUN}`, `Amit Homes ${RUN}`);
  await apiCall('POST', `/platform/vendors/${seed.b.id}/kyc`, { token: T, body: { decision: 'approved' } });
  const photo = await upload(seed.b.token, 'property');
  seed.title = `3BHK lake view ${RUN}`;
  const prop = await apiCall('POST', '/properties', { token: seed.b.token, body: { listingType: 'sale', propertyType: 'apartment', title: seed.title, description: 'Corner flat with a lake view', pricePaise: 850000000, bedrooms: 3, bathrooms: 2, areaSqft: 1450, city: 'Kolkata', locality: 'New Town', contactPhone: seed.b.phone, photos: [photo] } });
  if (prop.moderationStatus === 'pending') await apiCall('POST', `/platform/listings/property/${prop._id}/moderate`, { token: T, body: { decision: 'approved' } });
  seed.ad = await apiCall('POST', '/vendor/ads', { token: seed.b.token, body: { kind: 'property', listingId: prop._id, city: 'Kolkata', area: 'New Town', days: 7 } });

  page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await ownerLogin(page);
});
test.afterAll(async () => {
  await page?.close();
});

test('vendors queue shows the pending KYC with a sidebar badge', async () => {
  await expect(page.locator('a[href="/admin/vendors"] .sidebar-badge')).toBeVisible();
  await page.locator('a[href="/admin/vendors"]').click();
  await expect(page.getByRole('heading', { name: 'Vendors' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Pending review/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByPlaceholder('Name, business or mobile…').fill(seed.a.business);
  const table = page.getByTestId('vendors-table');
  await expect(table).toContainText(seed.a.business);
  await expect(table).toContainText('Pending review');
  await expect(table).not.toContainText(seed.a.phone);
  await table.getByText(seed.a.name).click();
  await expect(page).toHaveURL(new RegExp(`/admin/vendors/${seed.a.id}`));
});

test('vendor detail: masked KYC, documents and a logged reveal', async () => {
  await expect(page.getByTestId('vendor-detail')).toBeVisible();
  await expect(page.getByText('Waiting for your review')).toBeVisible();
  await expect(page.getByTestId('kyc-pan')).toContainText('•');
  await expect(page.getByTestId('kyc-pan')).toContainText(seed.a.pan.slice(-4));
  await expect(page.getByTestId('kyc-aadhaar')).toHaveText(`XXXX XXXX ${seed.a.aadhaar.slice(-4)}`);
  await expect(page.getByTestId('vendor-detail')).not.toContainText(seed.a.pan);
  await expect(page.getByTestId('kyc-document')).toHaveCount(3);
  const img = page.getByTestId('kyc-document').first().locator('img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);

  await page.getByTestId('kyc-reveal').click();
  await dialog(page).getByRole('button', { name: 'Reveal' }).click();
  await expect(dialog(page).getByText('A reason is required')).toBeVisible();
  await dialog(page).locator('textarea[name=reason]').fill('Matching PAN against the uploaded card');
  await dialog(page).getByRole('button', { name: 'Reveal' }).click();
  const revealed = page.getByTestId('kyc-revealed');
  await expect(revealed).toContainText(seed.a.pan);
  await expect(revealed).toContainText(seed.a.bankAccountNumber);
  await page.getByTestId('revealed-close').click();
  await expect(revealed).toHaveCount(0);
  await expect(page.getByTestId('vendor-detail')).not.toContainText(seed.a.pan);
  const log = await apiCall('GET', '/platform/audit-logs?limit=10', { token: T });
  expect(log.items.some((a) => a.action === 'privacy.kyc_reveal' && a.targetId === seed.a.id && /Matching PAN/.test(a.summary))).toBe(true);
});

test('reject needs a note; approve KYC', async () => {
  await page.getByTestId('kyc-reject').click();
  await dialog(page).getByRole('button', { name: 'Reject KYC' }).click();
  await expect(dialog(page).getByText('A reason is required')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();

  await page.getByTestId('kyc-approve').click();
  await dialog(page).locator('textarea[name=reason]').fill('Documents verified');
  await dialog(page).getByRole('button', { name: 'Approve KYC' }).click();
  await expectToast(page, 'KYC approved');
  await expect(page.getByTestId('vendor-detail').getByText('KYC approved').first()).toBeVisible();
  await expect(page.getByTestId('kyc-approve')).toHaveCount(0);
  const v = await apiCall('GET', `/platform/vendors/${seed.a.id}`, { token: T });
  expect(v.profile.kycStatus).toBe('approved');
  expect(v.profile.kycNote).toBe('Documents verified');
});

test('approve a vendor’s ad from the review drawer', async () => {
  await page.goto('/admin/ads');
  await expect(page.getByRole('heading', { name: 'Ads (boosts)' })).toBeVisible();
  const table = page.getByTestId('ads-table');
  await expect(table).toContainText(seed.title);
  await expect(table).toContainText('New Town, Kolkata');
  await table.getByText(seed.title).click();
  const detail = page.getByTestId('ad-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Corner flat with a lake view');
  await expect(detail).toContainText('KYC approved');
  await expect(detail).toContainText('7 days');
  await expect(detail.locator('img').first()).toBeVisible();
  await page.getByTestId('ad-approve').click();
  await expect(dialog(page).getByText('Approve ad').first()).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Approve ad' }).click();
  await expectToast(page, 'Ad approved');
  await expect(table).not.toContainText(seed.title);
  await page.getByRole('tab', { name: 'Active' }).click();
  await expect(table).toContainText(seed.title);
  const ad = await apiCall('GET', `/platform/ads/${seed.ad._id}`, { token: T });
  expect(ad.status).toBe('active');
  expect(Math.round((new Date(ad.endsAt) - new Date(ad.startsAt)) / 86_400_000)).toBe(7);
});

test('accounts list shows the account type and filters vendors', async () => {
  await page.goto('/admin/users');
  await page.getByTestId('account-type-filter').selectOption('vendor');
  await page.getByPlaceholder('Name, phone or email…').fill(seed.a.phone);
  const table = page.getByTestId('users-table');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText(seed.a.name);
  await expect(table.getByText('Vendor', { exact: true })).toBeVisible();
  await page.getByTestId('account-type-filter').selectOption('member');
  await expect(table).not.toContainText(seed.a.name);
});
