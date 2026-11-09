import { expect, test } from '@playwright/test';
import { dialog, expectToast, ownerLogin, RUN, SA, seedVendorWithKyc } from './helpers.js';

/**
 * Sub-admins with per-area permissions, against the LOCAL backend:
 * owner creates a sub-admin in the UI (in-place errors: no permission, email taken; Manage ticks View) with
 * vendors.view + coupons.manage → owner signs out, the sub-admin signs in → sidebar shows only Vendors, Coupons and
 * My security; the dashboard is a welcome card; a vendor's page has no KYC buttons; Coupons has "New coupon";
 * /admin/settings and /admin/subadmins show "No access" → owner (second browser) swaps Coupons for Settings (view) →
 * after a reload the sub-admin sees the new set (Settings read-only) → owner disables them → their session ends.
 */
test.describe.configure({ mode: 'serial' });

let page; // the sub-admin's browser (starts as the owner, who signs out)
let ownerPage;
const seed = {};
const SUB = { name: `Priya Helper ${RUN}`, email: `priya.${RUN.toLowerCase()}@example.com`, password: 'Helper2026pass' };
const sidebarLabels = (p) => p.locator('#sidebar nav a .sidebar-text').allInnerTexts();

test.beforeAll(async ({ browser }) => {
  seed.v = await seedVendorWithKyc(`Sub View Vendor ${RUN}`, `Sub View Works ${RUN}`);
  page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await ownerLogin(page);
});
test.afterAll(async () => {
  await page?.close();
  await ownerPage?.close();
});

test('owner creates a sub-admin with Vendors (view) and Coupons (manage)', async () => {
  await page.locator('#sidebar a[href="/admin/subadmins"]').click();
  await expect(page.getByRole('heading', { name: 'Sub-admins' })).toBeVisible();
  await page.getByTestId('subadmin-new').click();
  const d = dialog(page);
  await expect(d.getByTestId('perm-grid')).toBeVisible();
  await d.getByTestId('subadmin-name').fill(SUB.name);
  await d.getByTestId('subadmin-email').fill(SA.email); // the owner's email: taken
  await d.getByTestId('subadmin-password').fill('short');
  await d.getByTestId('subadmin-save').click();
  await expect(d.getByText('Password needs: at least 10 characters')).toBeVisible();
  await expect(d.getByTestId('perm-error')).toHaveText(/Tick at least one permission/);

  await d.getByTestId('subadmin-password').fill(SUB.password);
  await d.getByLabel('Show password').click();
  await expect(d.getByTestId('subadmin-password')).toHaveAttribute('type', 'text');
  // Manage ticks View; unticking View unticks Manage; view-only areas have no Manage box.
  await d.getByTestId('perm-coupons-manage').check();
  await expect(d.getByTestId('perm-coupons-view')).toBeChecked();
  await d.getByTestId('perm-coupons-view').uncheck();
  await expect(d.getByTestId('perm-coupons-manage')).not.toBeChecked();
  await expect(d.getByTestId('perm-dashboard-manage')).toHaveCount(0);
  await d.getByTestId('perm-all').click();
  await expect(d.getByTestId('perm-settings-manage')).toBeChecked();
  await d.getByTestId('perm-clear').click();
  await expect(d.getByTestId('perm-count')).toHaveText(/^0 of/);
  await d.getByTestId('perm-vendors-view').check();
  await d.getByTestId('perm-coupons-manage').check();
  await d.getByTestId('subadmin-save').click();
  await expect(d.getByRole('alert').filter({ hasText: 'already has an account' })).toBeVisible(); // 409 EMAIL_TAKEN, under the field

  await d.getByTestId('subadmin-email').fill(SUB.email);
  await d.getByTestId('subadmin-save').click();
  await expectToast(page, `Sub-admin ${SUB.name} created`);
  const row = page.getByTestId('subadmins-table').locator('tr', { hasText: SUB.email });
  await expect(row).toContainText('3 permissions');
  await expect(row).toContainText('Active');
  await expect(row).toContainText('Never');
});

test('the sub-admin sees only Vendors, Coupons and My security', async () => {
  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login/);
  await page.fill('#email', SUB.email);
  await page.fill('#password', SUB.password);
  await page.click('[data-testid=login-submit]');
  await expect(page.getByTestId('platform-dashboard')).toBeVisible();
  // No "Dashboard" permission: a welcome card with links, not the insights.
  await expect(page.getByTestId('welcome-pages').locator('a')).toHaveText(['Vendors', 'Coupons', 'My security']);
  expect(await sidebarLabels(page)).toEqual(['Vendors', 'Coupons', 'My security']);
  await expect(page.locator('#sidebar')).toContainText('Sub-admin');
});

test('Vendors is view only; Coupons can be managed', async () => {
  await page.locator('#sidebar a[href="/admin/vendors"]').click();
  await expect(page.getByRole('heading', { name: 'Vendors' })).toBeVisible();
  await page.goto(`/admin/vendors/${seed.v.id}`);
  await expect(page.getByTestId('vendor-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: seed.v.business })).toBeVisible();
  await expect(page.getByTestId('kyc-approve')).toHaveCount(0);
  await expect(page.getByTestId('kyc-reject')).toHaveCount(0);
  await expect(page.getByTestId('kyc-reveal')).toHaveCount(0);

  await page.locator('#sidebar a[href="/admin/coupons"]').click();
  await expect(page.getByRole('heading', { name: 'Coupons' })).toBeVisible();
  await expect(page.getByTestId('coupon-new')).toBeVisible();
});

test('pages outside the permissions show "No access"', async () => {
  await page.goto('/admin/settings');
  await expect(page.getByTestId('no-access')).toContainText('You don’t have permission to open this page');
  await page.goto('/admin/subadmins');
  await expect(page.getByTestId('no-access')).toContainText('Only the platform owner can open this page');
  await page.goto('/society');
  await expect(page).toHaveURL(/\/admin\/societies$/);
  await expect(page.getByTestId('no-access')).toBeVisible();
});

test('owner changes the permissions → the sub-admin sees them after a reload', async ({ browser }) => {
  ownerPage = await browser.newPage();
  ownerPage.on('pageerror', (e) => console.log('pageerror (owner):', e.message));
  await ownerLogin(ownerPage);
  await ownerPage.goto('/admin/subadmins');
  const row = ownerPage.getByTestId('subadmins-table').locator('tr', { hasText: SUB.email });
  await row.getByTestId('subadmin-edit').click();
  const d = dialog(ownerPage);
  await expect(d.getByTestId('perm-vendors-view')).toBeChecked();
  await expect(d.getByTestId('perm-coupons-manage')).toBeChecked();
  await expect(d.getByTestId('subadmin-password')).toHaveCount(0);
  await d.getByTestId('perm-coupons-view').uncheck();
  await d.getByTestId('perm-settings-view').check();
  await d.getByTestId('subadmin-save').click();
  await expectToast(ownerPage, `${SUB.name}’s permissions saved`);
  await expect(row).toContainText('2 permissions');

  await page.goto('/admin');
  await page.reload();
  await expect(page.getByTestId('platform-dashboard')).toBeVisible();
  await expect.poll(() => sidebarLabels(page)).toEqual(['Vendors', 'Settings', 'My security']);
  await page.locator('#sidebar a[href="/admin/settings"]').click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByText('Platform-wide configuration · view only')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
  await page.goto('/admin/coupons');
  await expect(page.getByTestId('no-access')).toBeVisible();
});

test('owner disables the sub-admin → their session ends', async () => {
  const row = ownerPage.getByTestId('subadmins-table').locator('tr', { hasText: SUB.email });
  await row.getByTestId('subadmin-disable').click();
  const d = dialog(ownerPage);
  await expect(d).toContainText('They are signed out at once');
  await d.getByRole('button', { name: 'Disable' }).click();
  await expectToast(ownerPage, `${SUB.name} disabled and signed out`);
  await expect(row).toContainText('Disabled');

  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await page.fill('#email', SUB.email);
  await page.fill('#password', SUB.password);
  await page.click('[data-testid=login-submit]');
  await expect(page.getByText('Sign-in failed')).toBeVisible();
  await expect(page.getByText(/has been disabled/).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
