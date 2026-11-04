import { expect, test } from '@playwright/test';
import { apiCall, dialog, expectToast, giveReason, ownerLogin, ownerToken, PASSWORD, randPhone, RUN } from './helpers.js';

/**
 * Master Admin, one continuous flow against the LOCAL backend:
 * seed (API) → society admin is refused → owner signs in with email + password → dashboard →
 * members directory → profile (masked) → logged reveal → approve membership → set password → society workspace
 * (reason prompt before a change, cancel path) → exit workspace → my security → sign out.
 */
test.describe.configure({ mode: 'serial' });

let page;
const seed = { phone: randPhone() };

test.beforeAll(async ({ browser }) => {
  const T = await ownerToken();
  const repEmail = `master.e2e.${RUN.toLowerCase()}@example.com`;
  const reg = await apiCall('POST', '/public/society-registrations', {
    body: { societyName: `Master E2E ${RUN}`, addressLine: '5 Lake View Road', city: 'Kolkata', state: 'West Bengal', pincode: '700029', phone: '3324567890', email: `office.m.${RUN.toLowerCase()}@example.com`, representative: { name: 'Sohini Ghosh', phone: randPhone(), email: repEmail }, documents: [], submit: true },
  });
  const q = await apiCall('GET', `/platform/society-registrations?q=${reg.referenceCode}`, { token: T });
  const appr = await apiCall('POST', `/platform/society-registrations/${q.items[0]._id}/approve`, { token: T, body: {} });
  await apiCall('POST', '/public/society-registrations/activate', { body: { referenceCode: reg.referenceCode, accessKey: reg.accessKey, password: PASSWORD } });
  const adm = await apiCall('POST', '/auth/admin/login', { body: { email: repEmail, password: PASSWORD } });
  const b = await apiCall('POST', '/society/buildings', { token: adm.accessToken, body: { name: 'Tower M', floors: 1 } });
  await apiCall('POST', '/society/flats/bulk', { token: adm.accessToken, body: { buildingId: b._id, fromFloor: 1, toFloor: 1, unitsPerFloor: 2, pattern: '{floor}{unit}' } });
  const r = await apiCall('POST', '/auth/resident/register', { body: { phone: seed.phone, name: `Kabir ${RUN}`, password: PASSWORD } });
  await apiCall('POST', '/memberships', { token: r.accessToken, body: { societyId: appr.society._id, buildingId: b._id, flatNumber: '101', residentType: 'owner' } });
  Object.assign(seed, { societyId: appr.society._id, societyName: `Master E2E ${RUN}`, repEmail, residentName: `Kabir ${RUN}`, residentId: r.user._id });

  page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
});
test.afterAll(async () => {
  await page?.close();
});

test('a society admin cannot use the Master Admin panel', async () => {
  await page.goto('/login');
  await page.fill('#email', seed.repEmail);
  await page.fill('#password', PASSWORD);
  await page.click('[data-testid=login-submit]');
  await expect(page.getByText('Not the platform owner')).toBeVisible();
  await expect(page.locator('#code')).toHaveCount(0);
});

test('owner signs in with email + password', async () => {
  await ownerLogin(page);
  await expect(page.getByText('Top societies')).toBeVisible();
  await expect(page.getByText('Billed vs collected · last 6 months')).toBeVisible();
});

test('members directory → masked profile → logged reveal', async () => {
  await page.goto('/admin/members');
  await page.getByPlaceholder('Name, mobile, email or flat no…').fill(seed.residentName);
  const row = page.getByTestId('members-table').getByText(seed.residentName);
  await expect(row).toBeVisible();
  await expect(page.getByTestId('members-table')).toContainText(seed.societyName);
  await expect(page.getByTestId('members-table')).not.toContainText(seed.phone);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/admin/members/${seed.residentId}`));
  await expect(page.getByTestId('masked-phone')).toContainText('•');
  await page.getByTestId('reveal').click();
  await dialog(page).locator('textarea[name=reason]').fill('Verifying flat ownership by phone');
  await dialog(page).getByRole('button', { name: 'Reveal' }).click();
  await expect(page.getByTestId('revealed')).toContainText(seed.phone.slice(5));
  await page.getByRole('tab', { name: /Audit trail/ }).click();
  await expect(page.getByText('privacy.reveal')).toBeVisible();
});

test('approve the pending membership from the profile (reason required)', async () => {
  await page.getByTestId('m-approve').click();
  await dialog(page).getByRole('button', { name: 'Approve' }).click();
  await expect(dialog(page).getByText('A reason is required')).toBeVisible();
  await dialog(page).locator('textarea[name=reason]').fill('Society admin unavailable this week');
  await dialog(page).getByRole('button', { name: 'Approve' }).click();
  await expectToast(page, 'Membership updated');
  await expect(page.getByTestId('profile-memberships')).toContainText('Approved');
});

test('owner sets a new password for the member', async () => {
  await page.getByTestId('action-password').click();
  const d = dialog(page);
  await d.locator('#new-password').fill('Fresh2026pass');
  await d.locator('#confirm-password').fill('Fresh2026pass');
  await d.locator('textarea').fill('Resident forgot password, called helpline');
  await page.getByTestId('set-password-submit').click();
  await expectToast(page, 'Password set');
  const login = await apiCall('POST', '/auth/resident/login', { body: { phone: seed.phone, password: 'Fresh2026pass' } });
  expect(login.accessToken).toBeTruthy();
});

test('society workspace asks for a reason before every change', async () => {
  await page.goto(`/admin/societies/${seed.societyId}`);
  await expect(page.getByTestId('workspace-tiles')).toBeVisible();
  await page.getByTestId('open-workspace').click();
  await expect(page.getByTestId('workspace-banner')).toContainText(seed.societyName);
  await expect(page.getByTestId('society-dashboard')).toBeVisible();

  await page.goto('/society/structure');
  await page.getByTestId('add-building').click();
  await dialog(page).locator('input[name=name]').fill('Tower N');
  await dialog(page).locator('input[name=floors]').fill('3');
  await dialog(page).getByRole('button', { name: 'Add building' }).click();
  // Cancel the reason → nothing is saved, no error toast.
  await expect(dialog(page).getByText('Reason for this change')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('toast-error')).toHaveCount(0);
  await expect(page.getByTestId('buildings-list')).not.toContainText('Tower N');
  // Now with a reason.
  await dialog(page).getByRole('button', { name: 'Add building' }).click();
  await giveReason(page, 'Society asked us to add the new tower');
  await expectToast(page, 'Building added');
  await expect(page.getByTestId('buildings-list')).toContainText('Tower N');

  await page.goto('/society/audit');
  await expect(page.getByText('platform.society_action').first()).toBeVisible();
});

test('exit the workspace and open My security', async () => {
  await page.getByTestId('exit-workspace').click();
  await expect(page).toHaveURL(new RegExp(`/admin/societies/${seed.societyId}`));
  await page.goto('/society');
  await expect(page).toHaveURL(/\/admin\/societies$/);
  await page.goto('/admin/security');
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
});

test('sign out', async () => {
  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
});
