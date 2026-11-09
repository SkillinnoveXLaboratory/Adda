import { expect, test } from '@playwright/test';
import { apiCall, ownerLogin, ownerToken, RUN, seedVendorWithKyc } from '../e2e/helpers.js';

/**
 * Screenshots of the Sub-admins page, its create modal and a sub-admin's view, at 1440 and 390 px.
 * Output: SHOTS_DIR (default qa-screenshots/). Run: npx playwright test -c playwright.qa.config.js subadmins
 */
const DIR = process.env.SHOTS_DIR || 'qa-screenshots';
const shoot = (page, name, fullPage = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
const SUB = { name: `Ananya Sen ${RUN}`, email: `ananya.${RUN.toLowerCase()}@example.com`, password: 'Helper2026pass' };

test('sub-admin screens at 1440 and 390 px', async ({ browser }) => {
  const T = await ownerToken();
  const vendor = await seedVendorWithKyc(`Kabir Roy ${RUN}`, `Roy Home Repairs ${RUN}`);
  await apiCall('POST', '/platform/subadmins', { token: T, body: { name: `Rohit Das ${RUN}`, email: `rohit.${RUN.toLowerCase()}@example.com`, password: 'Helper2026pass', permissions: ['applications.manage', 'societies.view', 'members.view', 'audit.view'] } });
  await apiCall('POST', '/platform/subadmins', { token: T, body: { ...SUB, permissions: ['vendors.view', 'coupons.manage', 'listings.view', 'audit.view'] } });

  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    const owner = await browser.newPage({ viewport: { width: w, height: h } });
    await owner.goto('/login');
    if (w < 1024) {
      await owner.fill('#email', process.env.SA_EMAIL || 'admin@addaapp.local');
      await owner.fill('#password', process.env.SA_PASSWORD || 'DevAdmin12345');
      await owner.click('[data-testid=login-submit]');
      await expect(owner.getByTestId('platform-dashboard')).toBeVisible();
    } else await ownerLogin(owner);
    await owner.goto('/admin/subadmins');
    await expect(owner.getByTestId('subadmins-table').locator('tr', { hasText: SUB.email })).toBeVisible();
    await shoot(owner, `subadmins-list-${w}`);
    await owner.getByTestId('subadmin-new').click();
    const d = owner.locator('[role="dialog"][aria-modal="true"]').last();
    await d.getByTestId('subadmin-name').fill('Meera Ghosh');
    await d.getByTestId('subadmin-email').fill('meera@example.com');
    await d.getByTestId('perm-vendors-manage').check();
    await d.getByTestId('perm-coupons-view').check();
    await d.getByTestId('perm-dashboard-view').check();
    await shoot(owner, `subadmins-create-modal-${w}`, false);
    await owner.close();

    const sub = await browser.newPage({ viewport: { width: w, height: h } });
    await sub.goto('/login');
    await sub.fill('#email', SUB.email);
    await sub.fill('#password', SUB.password);
    await sub.click('[data-testid=login-submit]');
    await expect(sub.getByTestId('welcome-pages')).toBeVisible();
    if (w < 1024) await sub.getByTestId('toggle-sidebar').click();
    await sub.waitForTimeout(400);
    await shoot(sub, `subadmin-sidebar-welcome-${w}`, false);
    if (w < 1024) await sub.keyboard.press('Escape');
    await sub.goto('/admin/vendors');
    await expect(sub.getByRole('heading', { name: 'Vendors' })).toBeVisible();
    await sub.waitForTimeout(500);
    await shoot(sub, `subadmin-vendors-viewonly-${w}`);
    await sub.goto(`/admin/vendors/${vendor.id}`);
    await expect(sub.getByTestId('vendor-detail')).toBeVisible();
    await shoot(sub, `subadmin-vendor-detail-viewonly-${w}`);
    await sub.goto('/admin/settings');
    await expect(sub.getByTestId('no-access')).toBeVisible();
    await shoot(sub, `subadmin-no-access-${w}`, false);
    await sub.close();
  }
});
