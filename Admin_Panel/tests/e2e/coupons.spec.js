import { expect, test } from '@playwright/test';
import { apiCall, dialog, expectToast, ownerLogin, ownerToken, PASSWORD, randPhone, RUN, seedVendorWithKyc } from './helpers.js';

/**
 * Coupons, commission and service-booking settlement, against the LOCAL backend:
 * seed (API): a society; 10% commission; an approved vendor with a ₹1,000 service; a member books it with a ₹150 coupon,
 * the vendor completes it and records ₹850 cash → owner creates a society-only coupon in the UI, turns it off,
 * can't delete the used coupon (offered "Turn off instead"), and sees the booking's commission on Service bookings
 * (reached from the vendor's "Bookings & commission" card).
 */
test.describe.configure({ mode: 'serial' });

let page;
let T;
const seed = {};
const istInDays = (d) => new Date(Date.now() + 330 * 60000 + d * 86_400_000).toISOString().slice(0, 10);

test.beforeAll(async () => {
  T = await ownerToken();
  // A society to restrict the new coupon to.
  seed.society = `Coupon Court ${RUN}`;
  const reg = await apiCall('POST', '/public/society-registrations', {
    body: { societyName: seed.society, addressLine: '4 Coupon Road, Near Park', city: 'Kolkata', state: 'West Bengal', pincode: '700091', phone: '3322345678', email: `coupon.${RUN.toLowerCase()}@example.com`, representative: { name: 'Coupon Rep', phone: randPhone(), email: `coupon.rep.${RUN.toLowerCase()}@example.com` }, documents: [], submit: true },
  });
  const q = await apiCall('GET', `/platform/society-registrations?q=${reg.referenceCode}`, { token: T });
  await apiCall('POST', `/platform/society-registrations/${q.items[0]._id}/approve`, { token: T, body: {} });

  seed.commissionBefore = (await apiCall('GET', '/public/config')).services?.commissionPercent ?? 0;
  // 10% commission, then an approved vendor publishes a ₹1,000 service (snapshots 10%).
  await apiCall('PUT', '/platform/settings/services.commissionPercent', { token: T, body: { value: 10 } });
  seed.v = await seedVendorWithKyc(`Settle Vendor ${RUN}`, `Settle Cleaners ${RUN}`);
  await apiCall('POST', `/platform/vendors/${seed.v.id}/kyc`, { token: T, body: { decision: 'approved' } });
  const cats = await apiCall('GET', '/service-offers/categories', { token: seed.v.token });
  seed.title = `Deep cleaning ${RUN}`;
  const svc = await apiCall('POST', '/service-offers', { token: seed.v.token, body: { categoryId: cats.items[0]._id, title: seed.title, description: 'Whole flat', priceType: 'fixed', pricePaise: 100000, experienceYears: 3, serviceArea: 'Salt Lake', city: 'Kolkata', contactPhone: seed.v.phone } });
  if (svc.moderationStatus === 'pending') await apiCall('POST', `/platform/listings/service/${svc._id}/moderate`, { token: T, body: { decision: 'approved' } });

  // A member books with a ₹150 coupon; the vendor completes it and records ₹850 cash.
  seed.usedCode = `USED-${RUN}`.slice(0, 20);
  seed.used = await apiCall('POST', '/platform/coupons', { token: T, body: { code: seed.usedCode, discountPaise: 15000, maxUses: 10 } });
  const m = await apiCall('POST', '/auth/resident/register', { body: { phone: randPhone(), name: `Booking Member ${RUN}`, password: PASSWORD } });
  const b = await apiCall('POST', `/service-offers/${svc._id}/bookings`, { token: m.accessToken, body: { preferredDate: istInDays(2), preferredTime: '10:00', address: 'Flat 5, Lake Town, Kolkata', couponCode: seed.usedCode } });
  await apiCall('POST', `/vendor/bookings/${b._id}/accept`, { token: seed.v.token, body: {} });
  await apiCall('POST', `/vendor/bookings/${b._id}/complete`, { token: seed.v.token, body: {} });
  const paid = await apiCall('POST', `/vendor/bookings/${b._id}/mark-paid`, { token: seed.v.token, body: { amountPaise: 85000 } });
  expect(paid.payment).toMatchObject({ grossPaise: 100000, commissionPaise: 10000, netToPlatformPaise: -5000 });
  await apiCall('PUT', '/platform/settings/services.commissionPercent', { token: T, body: { value: seed.commissionBefore } });
});

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await ownerLogin(page);
});
test.afterAll(async () => {
  await page?.close();
});

test('owner creates a society-only coupon (code upper-cased, ₹99.99 → 9999 paise)', async () => {
  await page.locator('a[href="/admin/coupons"]').click();
  await expect(page.getByRole('heading', { name: 'Coupons' })).toBeVisible();
  await page.getByTestId('coupon-new').click();
  const d = dialog(page);
  await expect(d.getByText('New coupon')).toBeVisible();
  seed.code = `SOC-${RUN}`.slice(0, 20);
  await d.locator('input[name=code]').fill(seed.code.toLowerCase());
  await expect(d.locator('input[name=code]')).toHaveValue(seed.code);
  await d.locator('input[name=discount]').fill('99.99');
  await d.locator('input[name=maxUses]').fill('5');
  await d.getByText('Members of selected societies').click();
  await d.getByTestId('coupon-save').click();
  await expect(d.getByText('Choose at least one society')).toBeVisible();
  await d.getByTestId('society-search').fill(seed.society);
  await d.getByRole('option', { name: new RegExp(seed.society) }).getByRole('checkbox').check();
  await expect(d.getByLabel('Chosen societies')).toContainText(seed.society);
  await d.getByTestId('coupon-save').click();
  await expectToast(page, `Coupon ${seed.code} created`);

  await page.getByPlaceholder('Search by code…').fill(seed.code);
  const row = page.getByTestId('coupons-table').locator('tr', { hasText: seed.code });
  await expect(row).toContainText('₹99.99');
  await expect(row).toContainText('0 / 5');
  await expect(row).toContainText(seed.society);
  await expect(row).toContainText('Active');
  const api = await apiCall('GET', `/platform/coupons?q=${seed.code}`, { token: T });
  expect(api.items[0]).toMatchObject({ code: seed.code, discountPaise: 9999, maxUses: 5, allMembers: false });
  expect(api.items[0].societies[0].name).toBe(seed.society);
  seed.id = api.items[0]._id;
});

test('owner turns the coupon off; it moves to Inactive', async () => {
  const row = page.getByTestId('coupons-table').locator('tr', { hasText: seed.code });
  await row.getByTestId('coupon-toggle').click();
  await expectToast(page, `Coupon ${seed.code} turned off`);
  await expect(row).toContainText('Off');
  await expect(row.getByTestId('coupon-toggle')).toHaveText(/Turn on/);
  await page.getByRole('tab', { name: 'Inactive', exact: true }).click();
  await expect(page.getByTestId('coupons-table')).toContainText(seed.code);
  await page.getByRole('tab', { name: 'Active', exact: true }).click();
  await expect(page.getByTestId('coupons-table')).not.toContainText(seed.code);
  expect((await apiCall('GET', `/platform/coupons/${seed.id}`, { token: T })).active).toBe(false);
});

test('a used coupon can’t be deleted — the 409 explains and offers Turn off', async () => {
  await page.getByRole('tab', { name: 'All', exact: true }).click();
  await page.getByPlaceholder('Search by code…').fill(seed.usedCode);
  const row = page.getByTestId('coupons-table').locator('tr', { hasText: seed.usedCode });
  await expect(row).toContainText('1 / 10');
  await row.getByTestId('coupon-delete').click();
  const d = dialog(page);
  await d.getByTestId('coupon-delete-confirm').click();
  await expect(d).toContainText('Turn it off instead');
  await d.getByTestId('coupon-turn-off-instead').click();
  await expectToast(page, `Coupon ${seed.usedCode} turned off`);
  await expect(row).toContainText('Off');
  // Detail drawer: numbers + the redemption with a masked phone.
  await row.locator('td').first().click();
  const drawer = page.getByTestId('coupon-detail');
  await expect(drawer).toContainText('₹150.00');
  await expect(drawer.getByTestId('coupon-redemptions')).toContainText(`Booking Member ${RUN}`);
  await expect(drawer.getByTestId('coupon-redemptions')).toContainText('•');
  await page.keyboard.press('Escape');
});

test('vendor detail → Service bookings shows the paid booking’s commission and net', async () => {
  await page.goto(`/admin/vendors/${seed.v.id}`);
  const card = page.getByTestId('vendor-settlement');
  await expect(card).toContainText('₹850.00');
  await expect(card).toContainText('₹150.00');
  await expect(card).toContainText('₹100.00');
  await expect(page.getByTestId('vendor-settlement-net')).toContainText('-₹50.00');
  await expect(page.getByText('NIVASA owes the vendor')).toBeVisible();
  await page.getByTestId('vendor-bookings-link').click();
  await expect(page).toHaveURL(new RegExp(`/admin/service-bookings\\?vendorId=${seed.v.id}`));
  await expect(page.getByRole('heading', { name: 'Service bookings' })).toBeVisible();
  await expect(page.getByTestId('vendor-filter')).toContainText(seed.v.business);
  await expect(page.getByTestId('settle-commission-value')).toHaveText('₹100.00');
  await expect(page.getByTestId('settle-cash-value')).toHaveText('₹850.00');
  await expect(page.getByTestId('settle-net-value')).toContainText('-₹50.00');
  const row = page.getByTestId('service-bookings-table').locator('tr', { hasText: seed.title });
  for (const t of ['₹1,000.00', seed.usedCode, '−₹150.00', '₹850.00', '10%', '₹100.00', '-₹50.00']) await expect(row).toContainText(t);
  await page.getByLabel('Payment').selectOption('false');
  await expect(page.getByTestId('service-bookings-table')).toContainText('No bookings match');
  await expect(page.getByTestId('settle-commission-value')).toHaveText('₹0.00');
});

test('vendor detail → View earnings: commission, coupon cost, net and what the vendor earned', async () => {
  await page.goto(`/admin/vendors/${seed.v.id}`);
  await page.getByTestId('vendor-earnings-link').click();
  await expect(page).toHaveURL(new RegExp(`/admin/earnings\\?vendorId=${seed.v.id}`));
  await expect(page.getByRole('heading', { name: 'Earnings' })).toBeVisible();
  await expect(page.getByTestId('earnings-vendor-filter')).toContainText(seed.v.business);
  // ₹1,000 service: member paid ₹850 cash + ₹150 coupon (NIVASA funds it); 10% commission on ₹1,000.
  await expect(page.getByTestId('earn-commission-value')).toHaveText('₹100.00');
  await expect(page.getByTestId('earn-coupons-value')).toHaveText('₹150.00');
  await expect(page.getByTestId('earn-net-value')).toContainText('-₹50.00');
  await expect(page.getByTestId('earn-vendors-value')).toHaveText('₹900.00');
  await expect(page.getByTestId('earn-gross-value')).toHaveText('₹1,000.00');
  await expect(page.getByTestId('earn-jobs-value')).toHaveText('1');
  await expect(page.getByTestId('earnings-months')).toContainText('₹900.00');
  const row = page.getByTestId('earnings-jobs').locator('tr', { hasText: seed.title });
  for (const t of ['₹1,000.00', seed.usedCode, '−₹150.00', '₹100.00', '10%', '-₹50.00', '₹900.00']) await expect(row).toContainText(t);
  // Custom range validation, then all vendors: the vendor shows in Top vendors with a link to their page.
  await page.getByRole('tab', { name: 'Custom' }).click();
  const tomorrow = istInDays(1);
  await page.getByTestId('earnings-custom').locator('[name=from]').fill(tomorrow);
  await page.getByTestId('earnings-custom').locator('[name=to]').fill(istInDays(0));
  await page.getByTestId('earnings-apply').click();
  await expect(page.getByTestId('earnings-range-error')).toHaveText('“From” must be on or before “To”');
  await page.getByRole('tab', { name: 'All time' }).click();
  await page.getByLabel('Show all vendors').click();
  await expect(page.getByTestId('earnings-vendor-picker')).toBeVisible();
  const top = page.getByTestId('earnings-top-vendors');
  await expect(top).toBeVisible();
  const all = await apiCall('GET', '/platform/earnings', { token: T });
  await expect(page.getByTestId('earn-commission-value')).toHaveText(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(all.totals.commissionPaise / 100));
  // Pick the vendor back through the search box.
  await page.getByTestId('earnings-vendor-picker').locator('input').fill(seed.v.business);
  await page.getByRole('option').filter({ hasText: seed.v.business }).first().click();
  await expect(page.getByTestId('earnings-vendor-filter')).toContainText(seed.v.business);
  await expect(page.getByTestId('earn-vendors-value')).toHaveText('₹900.00');
});

test('settings: commission % is validated and saved as a number', async () => {
  await page.locator('a[href="/admin/settings"]').click();
  const input = page.getByTestId('setting-services.commissionPercent');
  await expect(input).toBeVisible();
  const row = page.locator('form', { has: input });
  await expect(row).toContainText('Platform commission on vendor services (%)');
  for (const bad of ['12.345', '51', '-1', 'ten']) {
    await input.fill(bad);
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(row.getByText('Enter a number from 0 to 50 with up to 2 decimals')).toBeVisible();
  }
  await input.fill('12.5');
  await row.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Platform commission on vendor services (%) saved');
  const s = await apiCall('GET', '/platform/settings', { token: T });
  expect(s.items.find((i) => i.key === 'services.commissionPercent').value).toBe(12.5);
  expect((await apiCall('GET', '/public/config')).services.commissionPercent).toBe(12.5);
  await apiCall('PUT', '/platform/settings/services.commissionPercent', { token: T, body: { value: seed.commissionBefore } });
});
