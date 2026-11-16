import { expect, test } from '@playwright/test';
import { apiCall, expectToast, ownerLogin, ownerToken, PASSWORD, randPhone, RUN, seedVendorWithKyc } from './helpers.js';

/**
 * Per-vendor pricing, service-booking settlement and earnings, against the LOCAL backend:
 * seed (API): an approved vendor with a shop (name, logo, location) and a ₹1,000 service →
 * owner sets the vendor's rates on the vendor page (validation, live worked example, saved via PATCH …/pricing) →
 * the vendors list shows the shop and rates → (API) a member books with "Apply discount" (₹1,200 − ₹100 = ₹1,100),
 * the vendor completes it and records ₹1,100 cash → vendor page, Service bookings and Earnings show
 * commission ₹200, member discount ₹100, NIVASA net ₹100 and vendor earnings ₹1,000.
 */
test.describe.configure({ mode: 'serial' });

let page;
let T;
const seed = {};
const istInDays = (d) => new Date(Date.now() + 330 * 60000 + d * 86_400_000).toISOString().slice(0, 10);
const SHOP = { name: `Settle Cleaners Shop ${RUN}`, logo: true, location: { lat: 22.5726, lng: 88.3639, label: 'Park Street, Kolkata' } };
const EXAMPLE = 'Vendor price ₹1,000 → members see ₹1,200 · with discount −₹100 → ₹1,100 · NIVASA keeps ₹100 · vendor gets ₹1,000';

test.beforeAll(async () => {
  T = await ownerToken();
  seed.v = await seedVendorWithKyc(`Settle Vendor ${RUN}`, `Settle Cleaners ${RUN}`, SHOP);
  await apiCall('POST', `/platform/vendors/${seed.v.id}/kyc`, { token: T, body: { decision: 'approved' } });
  const cats = await apiCall('GET', '/service-offers/categories', { token: seed.v.token });
  seed.title = `Deep cleaning ${RUN}`;
  const svc = await apiCall('POST', '/service-offers', { token: seed.v.token, body: { categoryId: cats.items[0]._id, title: seed.title, description: 'Whole flat', priceType: 'fixed', pricePaise: 100000, experienceYears: 3, serviceArea: 'Salt Lake', city: 'Kolkata', contactPhone: seed.v.phone } });
  if (svc.moderationStatus === 'pending') await apiCall('POST', `/platform/listings/service/${svc._id}/moderate`, { token: T, body: { decision: 'approved' } });
  seed.svcId = svc._id;
});

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await ownerLogin(page);
});
test.afterAll(async () => {
  await page?.close();
});

test('vendor page shows the shop (name, logo, map link) and starts at 0% / 0%', async () => {
  await page.goto(`/admin/vendors/${seed.v.id}`);
  await expect(page.getByTestId('vendor-detail')).toBeVisible();
  await expect(page.getByTestId('vendor-shop-name')).toHaveText(SHOP.name);
  await expect(page.getByTestId('vendor-shop-logo')).toBeVisible();
  await expect(page.getByTestId('vendor-shop-location')).toContainText('Park Street, Kolkata');
  await expect(page.getByTestId('vendor-shop-location-coords')).toHaveText('22.572600, 88.363900');
  await expect(page.getByTestId('vendor-shop-location-map')).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=22.572600&mlon=88.363900#map=17/22.572600/88.363900');
  await expect(page.getByTestId('vendor-shop-location-map')).toHaveAttribute('target', '_blank');
  await expect(page.getByTestId('pricing-commission')).toHaveValue('0');
  await expect(page.getByTestId('pricing-discount')).toHaveValue('0');
  await expect(page.getByTestId('pricing-example-text')).toHaveText('Vendor price ₹1,000 → members see ₹1,000 · no discount offered · NIVASA keeps ₹0 · vendor gets ₹1,000');
  await expect(page.getByTestId('pricing-save')).toBeDisabled();
});

test('owner sets the vendor’s rates: validation, live example, saved', async () => {
  const card = page.getByTestId('vendor-pricing');
  await page.getByTestId('pricing-commission').fill('120');
  await page.getByTestId('pricing-discount').fill('1.234');
  await expect(page.getByTestId('pricing-example')).toContainText('Enter valid rates to see the example.');
  await page.getByTestId('pricing-save').click();
  await expect(card.getByRole('alert')).toHaveCount(2);
  await expect(card.getByRole('alert').first()).toContainText('Enter a number from 0 to 100 with up to 2 decimals');

  await page.getByTestId('pricing-commission').fill('12.25');
  await page.getByTestId('pricing-discount').fill('10');
  await expect(card.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('pricing-example-text')).toHaveText('Vendor price ₹1,000 → members see ₹1,122.50 · with discount −₹12.25 → ₹1,110.25 · NIVASA keeps ₹110.25 · vendor gets ₹1,000');

  await page.getByTestId('pricing-commission').fill('20');
  await page.getByTestId('pricing-discount').fill('50');
  await expect(page.getByTestId('pricing-example-text')).toHaveText(EXAMPLE);
  await page.getByTestId('pricing-save').click();
  await expectToast(page, 'Rates saved: 20% commission · 50% member discount');
  await expect(page.getByTestId('pricing-save')).toBeDisabled();
  const v = await apiCall('GET', `/platform/vendors/${seed.v.id}`, { token: T });
  expect(v.pricing).toEqual({ commissionPercent: 20, memberDiscountPercent: 50 });
  // The live service now shows members ₹1,200.
  const svc = await apiCall('GET', `/service-offers/${seed.svcId}`, { token: seed.v.token });
  expect(svc.pricing).toMatchObject({ vendorPricePaise: 100000, memberPricePaise: 120000, discountPaise: 10000, payableWithDiscountPaise: 110000 });
});

test('vendors list shows the shop name, logo and rates', async () => {
  await page.goto('/admin/vendors');
  await page.getByRole('tab', { name: 'Approved' }).click();
  await page.getByPlaceholder('Name, business or mobile…').fill(seed.v.business);
  const row = page.getByTestId('vendors-table').locator('tr', { hasText: SHOP.name });
  await expect(row).toContainText(seed.v.business);
  await expect(row).toContainText('20% commission');
  await expect(row).toContainText('50% back to members');
  await expect(row.locator('img')).toBeVisible();
});

test('a member books with the discount and the vendor records ₹1,100 cash (API)', async () => {
  const m = await apiCall('POST', '/auth/resident/register', { body: { phone: randPhone(), name: `Booking Member ${RUN}`, password: PASSWORD } });
  const b = await apiCall('POST', `/service-offers/${seed.svcId}/bookings`, { token: m.accessToken, body: { preferredDate: istInDays(2), preferredTime: '10:00', address: 'Flat 5, Lake Town, Kolkata', applyDiscount: true } });
  expect(b.pricing).toMatchObject({ memberPricePaise: 120000, discountPaise: 10000, payablePaise: 110000 });
  await apiCall('POST', `/vendor/bookings/${b._id}/accept`, { token: seed.v.token, body: {} });
  await apiCall('POST', `/vendor/bookings/${b._id}/complete`, { token: seed.v.token, body: {} });
  const paid = await apiCall('POST', `/vendor/bookings/${b._id}/mark-paid`, { token: seed.v.token, body: { amountPaise: 110000 } });
  expect(paid.payment).toMatchObject({ cashPaise: 110000, commissionPaise: 20000, discountPaise: 10000, netToPlatformPaise: 10000, vendorEarningsPaise: 100000 });
});

test('vendor page → Service bookings: prices, discount, commission and settlement', async () => {
  await page.goto(`/admin/vendors/${seed.v.id}`);
  const card = page.getByTestId('vendor-settlement');
  for (const t of ['₹1,100.00', '₹200.00', '₹100.00', '₹1,000.00']) await expect(card).toContainText(t);
  await expect(page.getByTestId('vendor-settlement-net')).toContainText('+₹100.00');
  await expect(page.getByText('Vendor owes NIVASA')).toBeVisible();
  await page.getByTestId('vendor-bookings-link').click();
  await expect(page).toHaveURL(new RegExp(`/admin/service-bookings\\?vendorId=${seed.v.id}`));
  await expect(page.getByRole('heading', { name: 'Service bookings' })).toBeVisible();
  await expect(page.getByTestId('vendor-filter')).toContainText(seed.v.business);
  await expect(page.getByTestId('settle-cash-value')).toHaveText('₹1,100.00');
  await expect(page.getByTestId('settle-commission-value')).toHaveText('₹200.00');
  await expect(page.getByTestId('settle-discounts-value')).toHaveText('₹100.00');
  await expect(page.getByTestId('settle-net-value')).toContainText('+₹100.00');
  await expect(page.getByTestId('settle-vendor-value')).toHaveText('₹1,000.00');
  const row = page.getByTestId('service-bookings-table').locator('tr', { hasText: seed.title });
  const cells = row.locator('td');
  // Service, Status, Vendor price, Commission, Member price, Discount, Payable, Cash received, NIVASA net, Vendor earned
  await expect(cells.nth(2)).toHaveText('₹1,000.00');
  await expect(cells.nth(3)).toContainText('₹200.00');
  await expect(cells.nth(3)).toContainText('20%');
  await expect(cells.nth(4)).toHaveText('₹1,200.00');
  await expect(cells.nth(5)).toHaveText('−₹100.00');
  await expect(cells.nth(6)).toHaveText('₹1,100.00');
  await expect(cells.nth(7)).toContainText('₹1,100.00');
  await expect(cells.nth(8)).toHaveText('+₹100.00');
  await expect(cells.nth(9)).toHaveText('₹1,000.00');
  await page.getByLabel('Payment').selectOption('false');
  await expect(page.getByTestId('service-bookings-table')).toContainText('No bookings match');
  await expect(page.getByTestId('settle-commission-value')).toHaveText('₹0.00');
  await expect(page.getByTestId('settle-discounts-value')).toHaveText('₹0.00');
});

test('vendor page → Earnings: NIVASA net, commission, member discounts and vendor earnings', async () => {
  await page.goto(`/admin/vendors/${seed.v.id}`);
  await page.getByTestId('vendor-earnings-link').click();
  await expect(page).toHaveURL(new RegExp(`/admin/earnings\\?vendorId=${seed.v.id}`));
  await expect(page.getByRole('heading', { name: 'Earnings' })).toBeVisible();
  await expect(page.getByTestId('earnings-vendor-filter')).toContainText(seed.v.business);
  await expect(page.getByTestId('earn-net-value')).toContainText('+₹100.00');
  await expect(page.getByTestId('earn-commission-value')).toHaveText('₹200.00');
  await expect(page.getByTestId('earn-discounts-value')).toHaveText('₹100.00');
  await expect(page.getByTestId('earn-vendors-value')).toHaveText('₹1,000.00');
  await expect(page.getByTestId('earn-gross-value')).toHaveText('₹1,200.00');
  await expect(page.getByTestId('earn-jobs-value')).toHaveText('1');
  await expect(page.getByText('Coupon', { exact: false })).toHaveCount(0);
  await expect(page.getByTestId('earnings-months')).toContainText('₹1,000.00');
  const row = page.getByTestId('earnings-jobs').locator('tr', { hasText: seed.title });
  for (const t of ['₹1,000.00', '₹1,200.00', '₹1,100.00', '₹200.00', '20%', '−₹100.00', '+₹100.00']) await expect(row).toContainText(t);
  const api = await apiCall('GET', `/platform/earnings?vendorId=${seed.v.id}`, { token: T });
  expect(api.totals).toEqual({ paidJobs: 1, grossPaise: 120000, cashCollectedPaise: 110000, commissionPaise: 20000, memberDiscountsPaise: 10000, vendorEarningsPaise: 100000, platformNetPaise: 10000 });
});

test('earnings: custom range validation, all vendors and picking a vendor', async () => {
  await page.getByRole('tab', { name: 'Custom' }).click();
  await page.getByTestId('earnings-custom').locator('[name=from]').fill(istInDays(1));
  await page.getByTestId('earnings-custom').locator('[name=to]').fill(istInDays(0));
  await page.getByTestId('earnings-apply').click();
  await expect(page.getByTestId('earnings-range-error')).toHaveText('“From” must be on or before “To”');
  await page.getByRole('tab', { name: 'All time' }).click();
  await page.getByLabel('Show all vendors').click();
  await expect(page.getByTestId('earnings-vendor-picker')).toBeVisible();
  await expect(page.getByTestId('earnings-top-vendors')).toBeVisible();
  const all = await apiCall('GET', '/platform/earnings', { token: T });
  const inr = (p) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(p / 100);
  await expect(page.getByTestId('earn-commission-value')).toHaveText(inr(all.totals.commissionPaise));
  await expect(page.getByTestId('earn-discounts-value')).toHaveText(inr(all.totals.memberDiscountsPaise));
  await page.getByTestId('earnings-vendor-picker').locator('input').fill(seed.v.business);
  await page.getByRole('option').filter({ hasText: seed.v.business }).first().click();
  await expect(page.getByTestId('earnings-vendor-filter')).toContainText(seed.v.business);
  await expect(page.getByTestId('earn-vendors-value')).toHaveText('₹1,000.00');
});

test('settings no longer has a platform-wide commission', async () => {
  await page.locator('a[href="/admin/settings"]').click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByTestId('setting-support.email')).toBeVisible();
  await expect(page.getByTestId('setting-services.commissionPercent')).toHaveCount(0);
  await expect(page.getByText(/commission/i)).toHaveCount(0);
  await page.goto('/admin/coupons');
  await expect(page.getByText('Page not found')).toBeVisible();
});
