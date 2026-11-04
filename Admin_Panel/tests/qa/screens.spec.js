import { test } from '@playwright/test';
import { apiCall, ownerLogin, ownerToken } from '../e2e/helpers.js';

/** Screenshots of every Master page at desktop and phone width → qa-screenshots/. Run: npx playwright test -c playwright.qa.config.js */
const shoot = (page, name) => page.screenshot({ path: `qa-screenshots/${name}.png`, fullPage: true });

test('master pages at 1440 and 390 px', async ({ page }) => {
  const T = await ownerToken();
  const societies = await apiCall('GET', '/platform/societies?limit=1&sort=-createdAt', { token: T });
  const members = await apiCall('GET', '/platform/members?limit=1&status=approved', { token: T });
  const sid = societies.items[0]._id;
  const uid = members.items[0].user._id;
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
