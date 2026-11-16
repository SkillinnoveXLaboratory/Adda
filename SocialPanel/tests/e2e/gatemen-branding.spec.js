import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { API, apiCall, dialog, expectToast, login, PNG, randPhone, RUN, SA } from './helpers.js';

/**
 * Gate security (skills/gate-security/DRY_CHECK.md row 2), society branding and location (skills/society-branding,
 * skills/location-maps) against the LOCAL backend only:
 * - Gatemen: create (validation, EMAIL_TAKEN in place), edit, set password (old password stops working), disable
 *   (session ends at once) / enable; Visitor log (date, status filter, search, read only).
 * - Society settings: logo upload → sidebar shows it, remove → initials; location via "Use my location" (mocked GPS)
 *   and address search (mocked proxy, plus a 503) → saved.
 * - Public registration with a map location → the platform sees it.
 * No test needs the internet: GPS is mocked by Playwright, address search is routed; map tiles may stay blank offline.
 * Optional screenshots: GATE_SHOTS=<dir> npm run e2e -- gatemen
 */
if (/skillinnovex\.in|mongodb\.net|vercel\.app/.test(API)) throw new Error('Refusing to run against production.');
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'GateUi2026secure';
const SHOTS = process.env.GATE_SHOTS || '';
const PUNE = { latitude: 18.520431, longitude: 73.856744 };
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const SOCIETY = `Gate Residency ${RUN}`;
const GATE_EMAIL = `gate.ui.${RUN.toLowerCase()}@example.com`;

let context;
let page;
const ctx = {};

/** A real-looking square logo (rendered in the browser, so no binary fixture is needed). */
async function logoPng() {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#0b1a30';
    g.fillRect(0, 0, 160, 160);
    g.fillStyle = '#d4af37';
    g.beginPath();
    g.moveTo(80, 28);
    g.lineTo(132, 74);
    g.lineTo(28, 74);
    g.closePath();
    g.fill();
    g.fillRect(44, 74, 72, 52);
    g.fillStyle = '#0b1a30';
    g.font = 'bold 34px sans-serif';
    g.textAlign = 'center';
    g.fillText('GR', 80, 114);
    return c.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(b64, 'base64');
}

async function shot(name, { full = false } = {}) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  // Toasts would cover the top bar.
  for (const b of await page.getByRole('button', { name: 'Dismiss notification' }).all()) await b.click().catch(() => {});
  for (const w of [1440, 390]) {
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await page.waitForTimeout(600);
    // Screenshots are evidence, not assertions: a slow map tile must never fail the test.
    await page.screenshot({ path: `${SHOTS}/${name}-${w}.png`, fullPage: full, timeout: 15_000 }).catch((e) => console.log(`screenshot ${name}-${w} skipped: ${e.message.split('\n')[0]}`));
  }
  await page.setViewportSize({ width: 1366, height: 860 });
  await page.waitForTimeout(300);
}

/** Registration → owner approves → activate → society admin; one building, an approved member. */
async function seed() {
  const owner = (await apiCall('POST', '/auth/admin/login', { body: SA })).accessToken;
  const email = `gate.admin.${RUN.toLowerCase()}@example.com`;
  const reg = await apiCall('POST', '/public/society-registrations', {
    body: { societyName: SOCIETY, addressLine: '1 Gate Road', area: 'Baner', city: 'Pune', state: 'Maharashtra', pincode: '411045', phone: randPhone(), email: `office.gate.${RUN.toLowerCase()}@example.com`, totalUnits: 10, representative: { name: 'Gate Admin', designation: 'Secretary', phone: randPhone(), email }, documents: [], submit: true },
  });
  const row = (await apiCall('GET', `/platform/society-registrations?q=${reg.referenceCode}`, { token: owner })).items[0];
  await apiCall('POST', `/platform/society-registrations/${row._id}/review`, { token: owner });
  const appr = await apiCall('POST', `/platform/society-registrations/${row._id}/approve`, { token: owner, body: {} });
  await apiCall('POST', '/public/society-registrations/activate', { body: { referenceCode: reg.referenceCode, accessKey: reg.accessKey, password: PASSWORD } });
  const T = (await apiCall('POST', '/auth/admin/login', { body: { email, password: PASSWORD } })).accessToken;
  const b = await apiCall('POST', '/society/buildings', { token: T, body: { name: 'Tower A', floors: 1 } });
  await apiCall('POST', '/society/flats/bulk', { token: T, body: { buildingId: b._id, fromFloor: 1, toFloor: 1, unitsPerFloor: 2, pattern: '{building}-{floor}{unit}', areaSqft: 900 } });
  const r = await apiCall('POST', '/auth/resident/register', { body: { phone: randPhone(), name: 'Meera Host', password: PASSWORD } });
  const m = await apiCall('POST', '/memberships', { token: r.accessToken, body: { societyId: appr.society._id, buildingId: b._id, flatNumber: 'A-101', residentType: 'owner' } });
  await apiCall('POST', `/society/memberships/${m._id}/approve`, { token: T, body: {} });
  // The member pre-registers a guest for today.
  await apiCall('POST', '/resident/visitors', { token: r.accessToken, body: { name: 'Anil Plumber', phone: randPhone(), purpose: 'Kitchen tap repair', expectedDate: today(), expectedIn: '10:00', expectedOut: '12:30' } });
  Object.assign(ctx, { owner, email, T, member: r.accessToken });
}

const gateLogin = async (password) => fetch(`${API}/auth/gate/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: GATE_EMAIL, password }) });

test.beforeAll(async ({ browser }) => {
  await seed();
  context = await browser.newContext({ permissions: ['geolocation'], geolocation: PUNE, viewport: { width: 1366, height: 860 } });
  page = await context.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await login(page, ctx.email, PASSWORD);
});
test.afterAll(async () => context?.close());

test('sidebar shows the society name with an initials tile (no logo yet)', async () => {
  const brand = page.locator('#sidebar').getByTestId('society-brand');
  await expect(brand).toContainText(SOCIETY);
  await expect(brand.getByTestId('society-initials')).toHaveText('GR');
  await expect(page.locator('#sidebar img[src*="nivasa"]')).toHaveCount(0);
  await shot('sidebar-initials');
});

test('Gatemen: create with validation and EMAIL_TAKEN in place', async () => {
  await page.locator('#sidebar').getByRole('link', { name: 'Gatemen' }).click();
  await expect(page.getByRole('heading', { name: 'Gatemen' })).toBeVisible();
  await expect(page.getByText('Gatemen sign in from the NIVASA app')).toBeVisible();
  await expect(page.getByText('No gatemen yet')).toBeVisible();
  await shot('gatemen-empty');

  await page.getByTestId('new-gateman').click();
  const d = dialog(page);
  await d.getByTestId('gateman-submit').click();
  await expect(d.getByText('Enter the gateman’s name')).toBeVisible();
  await expect(d.getByText('Set a password for the gateman')).toBeVisible();

  await d.locator('#gm-name').fill('Ramesh Gate');
  await d.locator('#gm-phone').fill('12345');
  await d.locator('#gm-email').fill(ctx.email); // the admin's own email → taken
  await d.locator('#gateman-password').fill('short1');
  await expect(d.getByText('At least 10 characters')).toBeVisible();
  await d.getByRole('button', { name: 'Show password' }).click();
  await expect(d.locator('#gateman-password')).toHaveAttribute('type', 'text');
  await d.getByTestId('gateman-submit').click();
  await expect(d.getByText(/10-digit Indian mobile/)).toBeVisible();
  await expect(d.getByText(/Password needs: at least 10 characters/)).toBeVisible();

  await d.locator('#gm-phone').fill('9876501234');
  await d.locator('#gateman-password').fill('Gatekeeper2026');
  await shot('gatemen-new');
  await d.getByTestId('gateman-submit').click();
  await expect(d.locator('[role=alert]').filter({ hasText: /email|already|use/i }).first()).toBeVisible(); // 409 EMAIL_TAKEN under the email field
  await expect(d).toBeVisible();
  await expect(d.locator('#gm-email')).toHaveAttribute('aria-invalid', 'true');

  await d.locator('#gm-email').fill(GATE_EMAIL);
  await d.getByTestId('gateman-submit').click();
  await expectToast(page, 'Gateman Ramesh Gate added');
  const row = page.getByTestId('gatemen-table').locator('tr', { hasText: 'Ramesh Gate' });
  await expect(row).toContainText(GATE_EMAIL);
  await expect(row).toContainText('+91 98765 01234');
  await expect(row).toContainText('Active');
  await expect(row).toContainText('Never');
  expect((await gateLogin('Gatekeeper2026')).status).toBe(200);
});

test('Gatemen: edit name and phone', async () => {
  const row = page.getByTestId('gatemen-table').locator('tr', { hasText: 'Ramesh Gate' });
  await row.getByRole('button', { name: /^Edit/ }).click();
  const d = dialog(page);
  await expect(d.locator('input[name=email]')).toBeDisabled();
  await d.locator('#gm-name').fill('Ramesh Kumar Gate');
  await d.locator('#gm-phone').fill('');
  await d.getByTestId('gateman-submit').click();
  await expectToast(page, 'Gateman updated');
  const r2 = page.getByTestId('gatemen-table').locator('tr', { hasText: 'Ramesh Kumar Gate' });
  await expect(r2).not.toContainText('98765 01234');
});

test('Gatemen: set password signs out and the old one stops working', async () => {
  const gt = (await (await gateLogin('Gatekeeper2026')).json()).accessToken;
  const row = page.getByTestId('gatemen-table').locator('tr', { hasText: 'Ramesh Kumar Gate' });
  await row.getByRole('button', { name: /Set password/ }).click();
  const d = dialog(page);
  await d.locator('#gateman-new-password').fill('nodigitshere');
  await d.getByTestId('password-submit').click();
  await expect(d.getByText(/Password needs: at least one number/)).toBeVisible();
  await d.locator('#gateman-new-password').fill('NewGate2026pass');
  await d.getByTestId('password-submit').click();
  await expectToast(page, 'New password set for Ramesh Kumar Gate');
  expect((await gateLogin('Gatekeeper2026')).status).toBe(401);
  expect((await gateLogin('NewGate2026pass')).status).toBe(200);
  const me = await fetch(`${API}/gate/me`, { headers: { Authorization: `Bearer ${gt}` } });
  expect(me.status).toBe(401);
});

test('Gatemen: disable ends the session at once; enable restores sign-in', async () => {
  const login1 = await (await gateLogin('NewGate2026pass')).json();
  ctx.gateToken = login1.accessToken;
  // The gateman records a walk-in that enters now (shows in the visitor log as "Inside", added by Gate).
  const flats = await apiCall('GET', '/gate/flats?q=A-102', { token: ctx.gateToken });
  const flat = (flats.items || []).find((f) => f.number === 'A-102') || flats.items?.[0];
  await apiCall('POST', '/gate/visitors', { token: ctx.gateToken, body: { name: 'Courier Ravi', phone: randPhone(), purpose: 'Parcel', flatId: flat._id, enterNow: true } });

  await page.reload();
  const row = page.getByTestId('gatemen-table').locator('tr', { hasText: 'Ramesh Kumar Gate' });
  await expect(row).not.toContainText('Never');
  await row.getByRole('button', { name: /^Disable/ }).click();
  const d = dialog(page);
  await expect(d).toContainText('They are signed out at once');
  await d.getByRole('button', { name: 'Disable' }).click();
  await expectToast(page, 'is disabled and signed out');
  await expect(row).toContainText('Disabled');
  expect((await fetch(`${API}/gate/me`, { headers: { Authorization: `Bearer ${ctx.gateToken}` } })).status).toBe(401);
  expect((await gateLogin('NewGate2026pass')).status).toBe(401);

  await row.getByRole('button', { name: /^Enable/ }).click();
  await dialog(page).getByRole('button', { name: 'Enable' }).click();
  await expectToast(page, 'can sign in again');
  await expect(row).toContainText('Active');
  expect((await gateLogin('NewGate2026pass')).status).toBe(200);
  await shot('gatemen-list');
});

test('Visitor log: today by default, status filter, search, read only', async () => {
  await page.getByRole('tab', { name: 'Visitor log' }).click();
  await expect(page).toHaveURL(/tab=visitors/);
  await expect(page.getByTestId('visitor-date')).toHaveValue(today());
  const table = page.getByTestId('visitor-table');
  const anil = table.locator('tr', { hasText: 'Anil Plumber' });
  const ravi = table.locator('tr', { hasText: 'Courier Ravi' });
  await expect(anil).toContainText('Tower A · A-101');
  await expect(anil).toContainText('Meera Host');
  await expect(anil).toContainText('10:00 am – 12:30 pm');
  await expect(anil).toContainText('Expected');
  await expect(anil).toContainText('Member');
  await expect(ravi).toContainText('Inside');
  await expect(ravi).toContainText('Gate');
  await expect(ravi).toContainText(/\d{1,2}:\d{2}\s?[ap]m/i); // entry time
  await expect(table.getByRole('button')).toHaveCount(0); // read only
  await shot('visitor-log');

  await page.getByTestId('visitor-status').selectOption('inside');
  await expect(ravi).toBeVisible();
  await expect(anil).toHaveCount(0);
  await page.getByTestId('visitor-status').selectOption('all');
  await page.getByPlaceholder('Search guest, phone or flat').fill('anil');
  await expect(anil).toBeVisible();
  await expect(ravi).toHaveCount(0);
  await page.getByPlaceholder('Search guest, phone or flat').fill('');
  // Another day → empty state.
  await page.getByTestId('visitor-date').fill('2026-01-01');
  await expect(page.getByText('No guests on 01 Jan 2026')).toBeVisible();
  await page.getByRole('button', { name: 'All dates' }).click();
  await expect(anil).toBeVisible();
});

test('Society settings: logo upload shows in the sidebar; remove goes back to initials', async () => {
  await page.goto('/society/profile');
  await expect(page.getByRole('heading', { name: 'Society settings' })).toBeVisible();
  // Wrong type / size are explained in place.
  await page.getByTestId('logo-input').setInputFiles({ name: 'logo.gif', mimeType: 'image/gif', buffer: PNG });
  await expect(page.getByTestId('logo-error')).toContainText('PNG, JPG or WEBP');
  await page.getByTestId('logo-input').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 10) });
  await expect(page.getByTestId('logo-error')).toContainText('up to 2 MB');

  await page.getByTestId('logo-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await logoPng() });
  await expectToast(page, 'Logo updated');
  await expect(page.getByTestId('logo-preview')).toBeVisible();
  const sideLogo = page.locator('#sidebar').getByTestId('society-logo');
  await expect(sideLogo).toBeVisible();
  await expect(sideLogo).toHaveAttribute('src', /\/media\//);
  const me = await apiCall('GET', '/me', { token: ctx.T });
  expect(me.staffRoles[0].society.logoUrl).toMatch(/\/media\//);
  await shot('sidebar-logo');

  // Survives a reload (comes from /me).
  await page.reload();
  await expect(page.locator('#sidebar').getByTestId('society-logo')).toBeVisible();

  await page.getByTestId('logo-remove').click();
  await dialog(page).getByRole('button', { name: 'Remove' }).click();
  await expectToast(page, 'Logo removed');
  await expect(page.locator('#sidebar').getByTestId('society-initials')).toHaveText('GR');

  // Put it back for the screenshots of settings.
  await page.getByTestId('logo-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await logoPng() });
  await expectToast(page, 'Logo updated');
});

test('Society settings: location from GPS and from address search; 503 explained', async () => {
  const picker = page.getByTestId('location-picker');
  await expect(picker.getByTestId('location-map')).toBeVisible();
  await expect(picker.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
  await expect(page.getByTestId('location-save')).toBeDisabled();

  await picker.getByTestId('use-my-location').click();
  await expect(picker.getByTestId('location-lat')).toHaveValue('18.520431');
  await expect(picker.getByTestId('location-lng')).toHaveValue('73.856744');
  await expect(picker.locator('.nivasa-pin')).toBeVisible();
  await page.getByTestId('location-save').click();
  await expectToast(page, 'Location saved');
  let prof = await apiCall('GET', '/society/profile', { token: ctx.T });
  expect(prof.location.lat).toBeCloseTo(18.520431, 5);
  expect(prof.location.lng).toBeCloseTo(73.856744, 5);

  // Address search is a server proxy; here it is routed so the test never needs the internet.
  await page.route('**/api/v1/public/geocode?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'GEOCODER_UNAVAILABLE', message: 'Address search is unavailable' } }) }));
  await picker.getByTestId('location-search').fill('Baner Road');
  await expect(picker.getByTestId('location-search-message')).toContainText('Address search is unavailable right now');
  await page.unroute('**/api/v1/public/geocode?*');
  await page.route('**/api/v1/public/geocode?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ label: 'Baner Road, Baner, Pune, Maharashtra', lat: 18.559, lng: 73.7868 }] }) }));
  await picker.getByTestId('location-search').fill('Baner Roa');
  await picker.getByRole('option', { name: /Baner Road, Baner/ }).click();
  await expect(picker.getByTestId('location-lat')).toHaveValue('18.559000');
  await expect(picker.getByTestId('location-label')).toContainText('Baner Road, Baner, Pune');
  await page.unroute('**/api/v1/public/geocode?*');
  await page.getByTestId('location-save').click();
  await expectToast(page, 'Location saved');
  prof = await apiCall('GET', '/society/profile', { token: ctx.T });
  expect(prof.location).toMatchObject({ lat: 18.559, lng: 73.7868, label: 'Baner Road, Baner, Pune, Maharashtra' });
  await page.locator('#main').evaluate((el) => el.scrollTo(0, 0));
  await shot('settings-top');
  await page.getByTestId('location-picker').scrollIntoViewIfNeeded();
  await shot('settings-location');

  // Clear → save → removed.
  await picker.getByTestId('location-clear').click();
  await expect(picker.getByTestId('location-lat')).toHaveValue('');
  await page.getByTestId('location-save').click();
  await expectToast(page, 'Location cleared');
  prof = await apiCall('GET', '/society/profile', { token: ctx.T });
  expect(prof.location).toBeNull();
});

test('mobile top bar shows the society brand', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/society');
  await expect(page.getByTestId('brand-compact')).toBeVisible();
  await expect(page.getByTestId('brand-compact')).toContainText(SOCIETY);
  await page.setViewportSize({ width: 1366, height: 860 });
});

test('public registration with a map location; denied GPS is explained', async ({ browser }) => {
  // Denied first.
  const denied = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const p2 = await denied.newPage();
  await p2.goto('/register');
  await p2.getByTestId('wizard-next').waitFor();
  await p2.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_ok, fail) => fail({ code: 1, message: 'denied' });
  });
  await p2.fill('#f-societyName', 'Denied Location Society');
  await p2.fill('#f-phone', randPhone());
  await p2.fill('#f-email', 'denied@example.com');
  await p2.getByTestId('wizard-next').click();
  await p2.getByTestId('use-my-location').click();
  await expect(p2.getByTestId('location-geo-message')).toContainText('permission was denied');
  await denied.close();

  // Granted (mocked GPS): the location goes with the application.
  await page.goto('/login');
  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto('/register');
  const name = `Map Registration ${RUN}`;
  await page.fill('#f-societyName', name);
  await page.fill('#f-phone', randPhone());
  await page.fill('#f-email', `map.${RUN.toLowerCase()}@example.com`);
  await page.getByTestId('wizard-next').click();
  await expect(page.getByText('Location on the map')).toBeVisible();
  await page.fill('#f-addressLine', '12 Map Street, near the park');
  await page.fill('#f-city', 'Pune');
  await page.selectOption('#f-state', 'Maharashtra');
  await page.fill('#f-pincode', '411001');
  await page.getByTestId('use-my-location').click();
  await expect(page.getByTestId('location-lat')).toHaveValue('18.520431');
  await expect(page.getByTestId('location-label')).not.toContainText('Looking up', { timeout: 20_000 });
  await shot('registration-map', { full: true });
  await page.getByTestId('wizard-next').click();
  await page.fill('#f-repName', 'Map Rep');
  await page.fill('#f-repPhone', randPhone());
  await page.fill('#f-repEmail', `map.rep.${RUN.toLowerCase()}@example.com`);
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click();
  await expect(page.getByText('Map location')).toBeVisible();
  await page.getByText('I confirm these details').click();
  await page.getByTestId('wizard-submit').click();
  const ref = await page.getByTestId('reference-code').textContent();
  const row = (await apiCall('GET', `/platform/society-registrations?q=${ref.trim()}`, { token: ctx.owner })).items[0];
  const detail = await apiCall('GET', `/platform/society-registrations/${row._id}`, { token: ctx.owner });
  const reg = detail.registration || detail;
  expect(reg.location.lat).toBeCloseTo(18.520431, 5);
  expect(reg.location.lng).toBeCloseTo(73.856744, 5);
});
