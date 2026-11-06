import { expect, test } from '@playwright/test';
import { API, apiCall, dialog, expectToast, PASSWORD, PNG, randPhone, RUN, SA } from './helpers.js';
import { superAdminLogin } from '../../scripts/sa-login.mjs';

/**
 * One continuous, real flow against the local backend:
 * register society (wizard) → status → owner is redirected to Master Admin and approves via API → activate → society admin signs in →
 * buildings + bulk flats → charge head → generate bills → record payment (+ receipt PDF) → notice →
 * resident joins (seeded via API) → approve in UI → resident complaint (API) → assign / progress / resolve →
 * dashboard shows the real numbers → logout.
 * The backend rate-limits sign-ins (20 / 15 min per IP), so one browser page is reused per role.
 */
test.describe.configure({ mode: 'serial' });

const societyName = `E2E Residency ${RUN}`;
const repEmail = `e2e.${RUN.toLowerCase()}@example.com`;
let page; // registrant → society admin
let admin; // platform owner (only to check SocialPanel refuses the owner sign-in)
const creds = {};

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  admin = await browser.newPage();
  for (const p of [page, admin]) p.on('pageerror', (e) => console.log('pageerror:', e.message));
});
test.afterAll(async () => {
  await page?.close();
  await admin?.close();
});

test('register a society with the 5-step wizard', async () => {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Register your society' })).toBeVisible();

  // Step 1 — validation blocks empty submit
  await page.getByTestId('wizard-next').click();
  await expect(page.getByText('Enter the society name')).toBeVisible();
  await page.fill('#f-societyName', societyName);
  await page.fill('#f-totalUnits', '24');
  await page.fill('#f-phone', '12345');
  await page.fill('#f-email', `office.${RUN.toLowerCase()}@example.com`);
  await page.getByTestId('wizard-next').click();
  await expect(page.getByText(/Enter a 10-digit phone number/)).toBeVisible();
  await page.fill('#f-phone', randPhone());
  await page.getByTestId('wizard-next').click();

  // Step 2 — address
  await page.fill('#f-addressLine', '7 Lake Road, Opp. Central Park');
  await page.fill('#f-area', 'Kothrud');
  await page.fill('#f-city', 'Pune');
  await page.selectOption('#f-state', 'Maharashtra');
  await page.fill('#f-pincode', '4110');
  await page.getByTestId('wizard-next').click();
  await expect(page.getByText('Enter a 6-digit PIN code')).toBeVisible();
  await page.fill('#f-pincode', '411038');
  await page.getByTestId('wizard-next').click();

  // Step 3 — representative
  await page.fill('#f-repName', 'Kiran Joshi');
  await page.fill('#f-repDesignation', 'Chairman');
  await page.fill('#f-repPhone', randPhone());
  await page.fill('#f-repEmail', repEmail);
  await page.getByTestId('wizard-next').click();

  // Step 4 — documents (real upload)
  await page.getByTestId('file-input').setInputFiles({ name: 'registration-certificate.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('registration-certificate.png')).toBeVisible();
  await page.getByTestId('wizard-next').click();

  // Step 5 — review + declaration
  await expect(page.getByText(societyName).first()).toBeVisible();
  await page.getByTestId('wizard-submit').click();
  await expect(page.getByText('Please confirm the declaration to submit')).toBeVisible();
  await page.getByLabel(/I confirm these details are accurate/).check();
  await page.getByTestId('wizard-submit').click();

  await expect(page.getByRole('heading', { name: 'Application submitted' })).toBeVisible();
  creds.referenceCode = (await page.getByTestId('reference-code').textContent()).trim();
  creds.accessKey = (await page.getByTestId('access-key').textContent()).trim();
  expect(creds.referenceCode).toMatch(/^SR-\d{4}-/);
  expect(creds.accessKey.length).toBeGreaterThanOrEqual(8);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download as text' }).click();
  expect((await download).suggestedFilename()).toContain(creds.referenceCode);
});

test('status page shows the submitted application', async () => {
  await page.getByRole('button', { name: 'Go to status page' }).click();
  await expect(page).toHaveURL(/\/status/);
  await expect(page.locator('#ref')).toHaveValue(creds.referenceCode);
  await expect(page.locator('#key')).toHaveValue(creds.accessKey);
  await page.getByTestId('status-check').click();
  await expect(page.getByTestId('status-result')).toContainText(societyName);
  await expect(page.getByTestId('status-result')).toContainText('Submitted');
});

test('platform owner is sent to the Master Admin panel, then approves (API)', async () => {
  // SocialPanel is for society staff only; the owner's session is ended and they are pointed to Master Admin.
  await admin.goto('/login');
  await admin.fill('#email', SA.email);
  await admin.fill('#password', SA.password);
  await admin.click('[data-testid=login-submit]');
  await expect(admin.getByText('Use the Master Admin panel')).toBeVisible();
  await expect(admin).toHaveURL(/\/login/);

  const owner = await superAdminLogin(API, SA.email, SA.password);
  expect(owner.status).toBe(200);
  const token = owner.body.accessToken;
  const queue = await apiCall('GET', `/platform/society-registrations?q=${creds.referenceCode}`, { token });
  const reg = queue.items[0];
  expect(reg.representative.email).toBe(repEmail);
  await apiCall('POST', `/platform/society-registrations/${reg._id}/review`, { token });
  const appr = await apiCall('POST', `/platform/society-registrations/${reg._id}/approve`, { token, body: {} });
  creds.societyCode = appr.society.code;
  expect(creds.societyCode).toMatch(/^SOC/);
});

test('registrant activates the admin account from the status page and signs in', async () => {
  await page.getByTestId('status-result').getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByTestId('society-code')).toHaveText(creds.societyCode);
  await page.fill('#new-password', 'short');
  await page.fill('#confirm-password', 'short');
  await page.getByTestId('activate-submit').click();
  await expect(page.getByText(/Password needs/)).toBeVisible();
  await page.fill('#new-password', PASSWORD);
  await page.fill('#confirm-password', PASSWORD);
  await page.getByTestId('activate-submit').click();
  await page.getByTestId('status-signin').click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('#email')).toHaveValue(repEmail);
  await page.fill('#password', PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('society-dashboard')).toBeVisible();
  await expect(page.getByTestId('card-residents-value')).toHaveText('0');
  await expect(page.getByText(`${societyName} · ${creds.societyCode}`)).toBeVisible();
});

test('add a building and bulk-generate flats', async () => {
  await page.goto('/society/structure');
  await page.getByTestId('add-building').click();
  await dialog(page).locator('input[name=name]').fill('Tower A');
  await dialog(page).locator('input[name=floors]').fill('2');
  await dialog(page).getByRole('button', { name: 'Add building' }).click();
  await expectToast(page, 'Building added');
  await expect(page.getByTestId('buildings-list')).toContainText('Tower A');

  await page.getByTestId('open-bulk').click();
  await dialog(page).locator('input[name=toFloor]').fill('2');
  await dialog(page).locator('input[name=unitsPerFloor]').fill('2');
  await expect(page.getByTestId('bulk-preview')).toContainText('A-101');
  await expect(page.getByTestId('bulk-preview')).toContainText('4 flats');
  await page.getByTestId('bulk-submit').click();
  await expect(page.getByTestId('bulk-result')).toContainText('Created');
  await dialog(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('flats-table')).toContainText('A-202');
});

test('charge head → generate bills → record a payment → download the receipt', async () => {
  await page.goto('/society/billing');
  await expect(page.getByText('Online payments are unavailable')).toBeVisible();
  await page.getByRole('tab', { name: /Charge heads/ }).click();
  await page.getByTestId('add-charge').click();
  await dialog(page).locator('input[name=name]').fill('Maintenance');
  await dialog(page).locator('input[name=amount]').fill('2500');
  await page.getByTestId('charge-save').click();
  await expectToast(page, 'Charge head added');

  await page.getByRole('tab', { name: /Invoices/ }).click();
  await page.getByTestId('open-generate').click();
  await page.getByTestId('generate-submit').click();
  await expect(page.getByTestId('generate-result')).toBeVisible();
  await expect(page.getByTestId('generate-created')).toHaveText('4');
  await dialog(page).getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('totals-billed-value')).toHaveText('₹10,000');

  await page.getByTestId('invoices-table').getByText('A-101').click();
  await expect(page.getByTestId('invoice-balance')).toHaveText('₹2,500.00');
  await page.getByTestId('open-record-payment').click();
  await expect(dialog(page).locator('input[name=amount]')).toHaveValue('2500');
  await dialog(page).locator('input[name=amount]').fill('3000');
  await page.getByTestId('payment-submit').click();
  await expect(dialog(page).getByText(/Can’t exceed the balance/)).toBeVisible();
  await dialog(page).locator('input[name=amount]').fill('2500');
  await page.getByTestId('payment-submit').click();
  await expectToast(page, 'Payment recorded');
  await expect(page.getByTestId('invoice-balance')).toHaveText('₹0.00');
  await expect(page.getByTestId('invoice-detail')).toContainText('Paid');

  const download = page.waitForEvent('download');
  await page.getByTestId('invoice-detail').getByRole('button', { name: 'Receipt' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('totals-collected-value')).toHaveText('₹2,500');
});

test('publish a notice', async () => {
  await page.goto('/society/announcements');
  await page.getByTestId('new-announcement').click();
  await dialog(page).locator('input[name=title]').fill('Lift maintenance on Saturday');
  await dialog(page).locator('textarea[name=body]').fill('Both lifts in Tower A will be serviced on Saturday between 10 am and 1 pm.');
  await dialog(page).locator('select[name=category]').selectOption('maintenance');
  await page.getByTestId('announcement-submit').click();
  await expectToast(page, 'Notice published');
  await expect(page.getByTestId('announcements-list')).toContainText('Lift maintenance on Saturday');
});

test('approve a resident and handle their complaint end to end', async () => {
  // Resident side is seeded through the API (the resident app is a separate product).
  const resident = await apiCall('POST', '/auth/resident/register', { body: { phone: randPhone(), name: 'Meena Kulkarni', password: PASSWORD } });
  const found = await apiCall('GET', `/public/societies?q=${encodeURIComponent(creds.societyCode)}`);
  const societyId = found.items[0]._id;
  const { buildings } = await apiCall('GET', `/public/societies/${societyId}/buildings`);
  await apiCall('POST', '/memberships', { token: resident.accessToken, body: { societyId, buildingId: buildings[0]._id, flatNumber: 'A-101', residentType: 'owner' } });

  await page.goto('/society/residents');
  await expect(page.getByTestId('residents-table')).toContainText('Meena Kulkarni');
  await page.getByTestId('member-approve').first().click();
  await dialog(page).getByRole('button', { name: 'Approve' }).click();
  await expectToast(page, 'Meena Kulkarni');
  await page.getByRole('tab', { name: /Directory/ }).click();
  await expect(page.getByTestId('residents-table')).toContainText('Meena Kulkarni');

  const cats = await apiCall('GET', '/resident/complaint-categories', { token: resident.accessToken });
  const complaint = await apiCall('POST', '/resident/complaints', { token: resident.accessToken, body: { categoryId: cats.items[0]._id, title: 'Corridor light not working', description: 'The corridor light outside A-101 has not worked for two days.', priority: 'high' } });

  await page.goto('/society/complaints');
  await page.getByTestId('complaints-table').getByText('Corridor light not working').click();
  const detail = page.getByTestId('complaint-detail');
  await expect(dialog(page)).toContainText(complaint.ticketNumber);
  await expect(detail).toContainText('Meena Kulkarni');
  await page.getByTestId('open-assign').click();
  await dialog(page).locator('input[name=assigneeName]').fill('Suresh Electricals');
  await page.getByTestId('assign-submit').click();
  await expectToast(page, 'Complaint assigned');
  await expect(detail).toContainText('Suresh Electricals');

  await page.getByTestId('open-status').click();
  await dialog(page).getByRole('radio', { name: 'In progress' }).click();
  await page.getByTestId('status-submit').click();
  await expectToast(page, 'In progress');

  await page.getByTestId('open-status').click();
  await dialog(page).getByRole('radio', { name: 'Resolved' }).click();
  await dialog(page).locator('textarea[name=note]').fill('Bulb and holder replaced.');
  await page.getByTestId('status-submit').click();
  await expectToast(page, 'Resolved');
  await expect(detail).toContainText('Bulb and holder replaced.');
  await page.keyboard.press('Escape');

  // Residents can no longer list properties or services (vendor-only); they still sell to neighbours in the marketplace.
  // The approved resident lists a society-only item; the society admin reviews it in Listings → Marketplace (default tab).
  const mcats = await apiCall('GET', '/marketplace/categories', { token: resident.accessToken });
  const item = await apiCall('POST', '/marketplace', { token: resident.accessToken, body: { categoryId: mcats.items[0]._id, title: 'Study table with chair', description: 'Solid wood, 2 years old', pricePaise: 450000, condition: 'good', city: 'Pune', contactPhone: randPhone(), visibility: 'society' } });
  expect(item.moderationStatus).toBe('pending');
  await page.goto('/society/listings');
  await expect(page.getByRole('tab', { name: /Marketplace/ })).toHaveAttribute('aria-selected', 'true');
  const navBadge = page.getByRole('link', { name: /Listings/ }).locator('.sidebar-badge');
  await expect(navBadge).toHaveText('1'); // sidebar badge = what the page shows
  await expect(page.getByRole('tab', { name: /Marketplace/ })).toContainText('1');
  const table = page.getByTestId('listings-table');
  await expect(table).toContainText('Study table with chair');
  await expect(table).toContainText('₹4,500');
  await expect(table).toContainText('Meena Kulkarni');
  // Property / Services tabs explain that new vendor listings are reviewed by the platform.
  await page.getByRole('tab', { name: /Services/ }).click();
  await expect(page.getByText('New property and service listings come from verified vendors and are reviewed by the platform.')).toBeVisible();
  await page.getByRole('tab', { name: /Marketplace/ }).click();
  await expect(page.getByText(/come from verified vendors/)).toHaveCount(0);
  await table.getByTestId('listing-approved').first().click();
  await dialog(page).getByRole('button', { name: 'Approve' }).click();
  await expectToast(page, 'Listing approved');
  await expect(table).not.toContainText('Study table with chair');
  await expect(navBadge).toHaveCount(0);
  const visible = await apiCall('GET', `/marketplace/${item._id}`, { token: resident.accessToken });
  expect(visible.moderationStatus).toBe('approved');
});

test('dashboard reflects the real data', async () => {
  await page.goto('/society');
  await expect(page.getByTestId('card-residents-value')).toHaveText('1');
  await expect(page.getByTestId('card-pending-value')).toHaveText('0');
  await expect(page.getByTestId('card-outstanding-value')).toHaveText('₹7,500');
  await expect(page.getByTestId('card-collected-value')).toHaveText('₹2,500');
  await expect(page.getByText('Corridor light not working')).toBeVisible();
});

test('sign out', async () => {
  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/society');
  await expect(page).toHaveURL(/\/login/);
});
