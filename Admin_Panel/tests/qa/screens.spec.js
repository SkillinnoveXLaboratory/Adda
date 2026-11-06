import { test } from '@playwright/test';
import { apiCall, ownerLogin, ownerToken, RUN, seedVendorWithKyc, upload } from '../e2e/helpers.js';

/** Screenshots of every Master page at desktop and phone width → qa-screenshots/. Run: npx playwright test -c playwright.qa.config.js */
const shoot = (page, name) => page.screenshot({ path: `qa-screenshots/${name}.png`, fullPage: true });

test('master pages at 1440 and 390 px', async ({ page }) => {
  const T = await ownerToken();
  const societies = await apiCall('GET', '/platform/societies?limit=1&sort=-createdAt', { token: T });
  const members = await apiCall('GET', '/platform/members?limit=1&status=approved', { token: T });
  const sid = societies.items[0]._id;
  const uid = members.items[0].user._id;
  // A vendor waiting for KYC review, and an approved vendor with a pending boost, so the queues aren't empty.
  const pendingVendor = await seedVendorWithKyc(`Kavya Banerjee ${RUN}`, `Kavya Home Services ${RUN}`);
  const vb = await seedVendorWithKyc(`Rahul Dutta ${RUN}`, `Dutta Realty and Property Consultants ${RUN}`);
  await apiCall('POST', `/platform/vendors/${vb.id}/kyc`, { token: T, body: { decision: 'approved' } });
  const prop = await apiCall('POST', '/properties', { token: vb.token, body: { listingType: 'rent', propertyType: 'apartment', title: `Spacious 2BHK with balcony near metro station ${RUN}`, description: 'Second floor, east facing, covered parking, 24x7 water.', pricePaise: 3200000, bedrooms: 2, bathrooms: 2, areaSqft: 1100, furnishing: 'semi_furnished', city: 'Kolkata', locality: 'Salt Lake Sector V', contactPhone: vb.phone, photos: [await upload(vb.token, 'property')] } });
  if (prop.moderationStatus === 'pending') await apiCall('POST', `/platform/listings/property/${prop._id}/moderate`, { token: T, body: { decision: 'approved' } });
  await apiCall('POST', '/vendor/ads', { token: vb.token, body: { kind: 'property', listingId: prop._id, city: 'Kolkata', area: 'Salt Lake Sector V', days: 14 } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.locator('#email').waitFor();
  await shoot(page, 'login-1440');
  await ownerLogin(page);
  const pages = [
    ['dashboard', '/admin'],
    ['applications', '/admin/applications'],
    ['societies', '/admin/societies'],
    ['society-detail', `/admin/societies/${sid}`],
    ['members', '/admin/members'],
    ['member-profile', `/admin/members/${uid}`],
    ['accounts', '/admin/users'],
    ['vendors', '/admin/vendors'],
    ['vendor-detail', `/admin/vendors/${pendingVendor.id}`],
    ['ads', '/admin/ads'],
    ['listings', '/admin/listings'],
    ['payments', '/admin/payments'],
    ['audit', '/admin/audit'],
    ['settings', '/admin/settings'],
    ['security', '/admin/security'],
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    for (const [name, path] of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);
      await shoot(page, `${name}-${width}`);
    }
    await page.goto('/admin/ads');
    await page.getByTestId('ads-table').getByText(prop.title).click();
    await page.getByTestId('ad-detail').waitFor();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `qa-screenshots/ad-drawer-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/admin/societies/${sid}`);
  await page.getByTestId('open-workspace').click();
  await page.getByTestId('workspace-banner').waitFor();
  await page.waitForLoadState('networkidle');
  await shoot(page, 'workspace-dashboard-1440');
  await page.goto('/society/residents');
  await page.waitForLoadState('networkidle');
  await shoot(page, 'workspace-residents-1440');
});

test('vendor detail: documents and reveal at 1440 and 390 px', async ({ page }) => {
  const v = await seedVendorWithKyc(`Sneha Kapoor ${RUN}`, `Kapoor Pest Control ${RUN}`);
  await ownerLogin(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    await page.goto(`/admin/vendors/${v.id}`);
    await page.getByTestId('vendor-detail').waitFor();
    await page.waitForLoadState('networkidle');
    await page.locator('#main').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `qa-screenshots/vendor-detail-bottom-${width}.png` });
    await page.getByTestId('kyc-reveal').click();
    await page.locator('textarea[name=reason]').fill('QA screenshot of the reveal dialog');
    await page.getByRole('button', { name: 'Reveal', exact: true }).click();
    await page.getByTestId('kyc-revealed').waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `qa-screenshots/vendor-reveal-${width}.png` });
    await page.getByTestId('revealed-close').click();
  }
});
