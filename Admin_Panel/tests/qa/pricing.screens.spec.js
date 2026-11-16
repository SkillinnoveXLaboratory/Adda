import { expect, test } from '@playwright/test';
import { apiCall, ownerToken, PASSWORD, randPhone, RUN, SA, seedVendorWithKyc } from '../e2e/helpers.js';

/**
 * Screenshots of per-vendor pricing, the vendors list, earnings, service bookings, a registration's and a society's
 * map location and Settings (no platform commission), at 1440 and 390 px.
 * Output: SHOTS_DIR (default qa-screenshots/). Run: npx playwright test -c playwright.qa.config.js pricing
 */
const DIR = process.env.SHOTS_DIR || 'qa-screenshots';
const shoot = (page, name, fullPage = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
const istInDays = (d) => new Date(Date.now() + 330 * 60000 + d * 86_400_000).toISOString().slice(0, 10);

test('pricing, earnings and location screens at 1440 and 390 px', async ({ browser }) => {
  const T = await ownerToken();
  const v = await seedVendorWithKyc(`Kabir Roy ${RUN}`, `Roy Home Services ${RUN}`, { name: `Roy Sparkle Cleaners`, logo: true, location: { lat: 22.5726, lng: 88.3639, label: 'Park Street, Kolkata, West Bengal' } });
  await apiCall('POST', `/platform/vendors/${v.id}/kyc`, { token: T, body: { decision: 'approved' } });
  await apiCall('PATCH', `/platform/vendors/${v.id}/pricing`, { token: T, body: { commissionPercent: 20, memberDiscountPercent: 50 } });
  const cats = await apiCall('GET', '/service-offers/categories', { token: v.token });
  const svc = await apiCall('POST', '/service-offers', { token: v.token, body: { categoryId: cats.items[0]._id, title: `Full home deep cleaning ${RUN}`, description: 'Whole flat', priceType: 'fixed', pricePaise: 100000, city: 'Kolkata', contactPhone: v.phone } });
  if (svc.moderationStatus === 'pending') await apiCall('POST', `/platform/listings/service/${svc._id}/moderate`, { token: T, body: { decision: 'approved' } });
  const m = await apiCall('POST', '/auth/resident/register', { body: { phone: randPhone(), name: `Ananya Sen ${RUN}`, password: PASSWORD } });
  const b = await apiCall('POST', `/service-offers/${svc._id}/bookings`, { token: m.accessToken, body: { preferredDate: istInDays(2), preferredTime: '10:00', address: 'Flat 5, Lake Town, Kolkata', applyDiscount: true } });
  await apiCall('POST', `/vendor/bookings/${b._id}/accept`, { token: v.token, body: {} });
  await apiCall('POST', `/vendor/bookings/${b._id}/complete`, { token: v.token, body: {} });
  await apiCall('POST', `/vendor/bookings/${b._id}/mark-paid`, { token: v.token, body: { amountPaise: 110000 } });

  const reg = await apiCall('POST', '/public/society-registrations', {
    body: { societyName: `Lake View Residency ${RUN}`, addressLine: '12 Lake Road, Near Park', city: 'Kolkata', state: 'West Bengal', pincode: '700029', phone: '3322345678', email: `lakeview.${RUN.toLowerCase()}@example.com`, representative: { name: 'Sourav Dutta', phone: randPhone(), email: `sourav.${RUN.toLowerCase()}@example.com` }, documents: [], location: { lat: 22.5121, lng: 88.3637, label: 'Lake Road, Ballygunge, Kolkata' }, submit: true },
  });
  const regRow = (await apiCall('GET', `/platform/society-registrations?q=${reg.referenceCode}`, { token: T })).items[0];
  const reg2 = await apiCall('POST', '/public/society-registrations', {
    body: { societyName: `Green Park Towers ${RUN}`, addressLine: '4 Park Lane, Sector 2', city: 'Kolkata', state: 'West Bengal', pincode: '700091', phone: '3322345679', email: `greenpark.${RUN.toLowerCase()}@example.com`, representative: { name: 'Rina Ghosh', phone: randPhone(), email: `rina.${RUN.toLowerCase()}@example.com` }, documents: [], location: { lat: 22.5806, lng: 88.4336, label: 'Salt Lake Sector 2, Kolkata' }, submit: true },
  });
  const reg2Row = (await apiCall('GET', `/platform/society-registrations?q=${reg2.referenceCode}`, { token: T })).items[0];
  const approved = await apiCall('POST', `/platform/society-registrations/${reg2Row._id}/approve`, { token: T, body: {} });

  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.goto('/login');
    await p.fill('#email', SA.email);
    await p.fill('#password', SA.password);
    await p.click('[data-testid=login-submit]');
    await expect(p.getByTestId('platform-dashboard')).toBeVisible();

    await p.goto(`/admin/vendors/${v.id}`);
    await expect(p.getByTestId('vendor-pricing')).toBeVisible();
    await p.getByTestId('vendor-shop-logo').waitFor();
    await shoot(p, `vendor-detail-${w}`);
    await p.getByTestId('vendor-pricing').scrollIntoViewIfNeeded();
    await p.getByTestId('pricing-commission').fill('12.5');
    await expect(p.getByTestId('pricing-example-text')).toContainText('₹1,125');
    await shoot(p, `vendor-pricing-editing-${w}`, false);

    await p.goto('/admin/vendors');
    await p.getByRole('tab', { name: 'Approved' }).click();
    await expect(p.getByTestId('vendors-table')).toContainText('Roy Sparkle Cleaners');
    await p.waitForTimeout(400);
    await shoot(p, `vendors-list-${w}`);

    await p.goto('/admin/earnings');
    await p.getByRole('tab', { name: 'All time' }).click();
    await expect(p.getByTestId('earn-net-value')).toBeVisible();
    await p.waitForTimeout(600);
    await shoot(p, `earnings-${w}`);

    await p.goto(`/admin/service-bookings?vendorId=${v.id}`);
    await expect(p.getByTestId('service-bookings-table')).toContainText('Full home deep cleaning');
    await shoot(p, `service-bookings-${w}`);

    await p.goto(`/admin/applications?open=${regRow._id}`);
    await expect(p.getByTestId('application-location')).toBeVisible();
    await p.getByTestId('application-location').scrollIntoViewIfNeeded();
    await shoot(p, `registration-location-${w}`, false);

    await p.goto(`/admin/societies/${approved.society._id}`);
    await expect(p.getByTestId('society-location')).toBeVisible();
    await shoot(p, `society-detail-${w}`);

    await p.goto('/admin/settings');
    await expect(p.getByTestId('setting-support.email')).toBeVisible();
    await shoot(p, `settings-${w}`);
    await p.close();
  }
});
