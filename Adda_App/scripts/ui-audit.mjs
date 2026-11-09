#!/usr/bin/env node
/**
 * Runtime UI audit of the NIVASA app (react-native-web build) against a LOCAL backend.
 * See skills/mobile-ui-qa/SKILL.md.
 *
 *   node scripts/ui-audit.mjs [--build] [--widths=360,390,412]
 *
 * 1. Seeds a society + an approved resident with a bill, a notice, an amenity, society votes (open / voted / ended with a
 *    result), one extra voter per width, and a KYC-verified vendor's property + service (local API only).
 * 2. Builds the web bundle (EXPO_PUBLIC_API_URL = local API) when --build is given or dist-web/ is missing.
 * 3. Serves it on http://localhost:8099 and, at each phone width, signs in through the UI and opens every screen.
 *
 * Per screen (fails the run):  page crash / error screen · horizontal overflow · a control outside the screen ·
 *                              tap target smaller than 24 px · the bottom tab bar covering content it shouldn't.
 * Warnings (listed):           tap targets under 44 px (hitSlop may cover them on device) · console errors.
 * Workflows: every bottom tab, every home module card and Society tile must open its screen; a member votes through the
 *            Voting screen; a vendor account signing in to the app sees the "use the Vendor Panel" message.
 * Screenshots → qa-screenshots/<width>/<screen>.png (gitignored).
 */
import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { superAdminLogin } from './sa-login.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_ORIGIN = (process.env.API_BASE || 'http://127.0.0.1:3013').replace(/\/$/, '');
if (/skillinnovex\.in|mongodb\.net/.test(API_ORIGIN)) {
  console.error('Refusing to run against production. Start a local backend (npm run dev:db + server on :3013).');
  process.exit(2);
}
const API = `${API_ORIGIN}/api/v1`;
const SA = { email: process.env.SA_EMAIL || 'admin@addaapp.local', password: process.env.SA_PASSWORD || 'DevAdmin12345' };
const PORT = Number(process.env.AUDIT_PORT || 8099);
const WEB = path.join(ROOT, 'dist-web');
const OUT = path.join(ROOT, 'qa-screenshots');
const args = process.argv.slice(2);
const WIDTHS = (args.find((a) => a.startsWith('--widths='))?.split('=')[1] || '360,390,412').split(',').map(Number);
const RUN = Date.now().toString(36).toUpperCase();
const PASSWORD = 'Resident2026ok';

const failures = [];
const warnings = [];
const fail = (w, screen, msg) => failures.push(`[${w}px] ${screen}: ${msg}`);
const warn = (w, screen, msg) => warnings.push(`[${w}px] ${screen}: ${msg}`);

async function call(method, p, { token, body } = {}) {
  const res = await fetch(`${API}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(json?.error || json)}`);
  return json;
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function uploadPng(token, purpose) {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', new Blob([PNG], { type: 'image/png' }), `${purpose}.png`);
  const res = await fetch(`${API}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`upload ${purpose} → ${res.status} ${JSON.stringify(json?.error || json)}`);
  return json;
}
const VD = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const VP = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const validAadhaar = () => {
  const base = `2${String(Date.now()).slice(-10)}`;
  return base + [0, 4, 3, 2, 1, 5, 6, 7, 8, 9][base.split('').reverse().reduce((c, d, i) => VD[c][VP[(i + 1) % 8][Number(d)]], 0)];
};
const randPhone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
const istDay = (d = 0) => new Date(Date.now() + 330 * 60000 + d * 86400000).toISOString().slice(0, 10);

async function seed() {
  const owner = await superAdminLogin(API, SA.email, SA.password);
  if (owner.status !== 200) throw new Error(`Owner sign-in failed (${owner.status}). Create the dev owner: node server.js create-super-admin --email ${SA.email}`);
  const T = owner.body.accessToken;
  const repEmail = `ui.audit.${RUN.toLowerCase()}@example.com`;
  const reg = await call('POST', '/public/society-registrations', {
    body: { societyName: `Green Valley Residency ${RUN}`, addressLine: 'A Wing, Baner Road', city: 'Pune', state: 'Maharashtra', pincode: '411045', phone: '2025556789', email: `office.${RUN.toLowerCase()}@example.com`, representative: { name: 'Meera Joshi', phone: randPhone(), email: repEmail }, documents: [], submit: true },
  });
  const q = await call('GET', `/platform/society-registrations?q=${reg.referenceCode}`, { token: T });
  const appr = await call('POST', `/platform/society-registrations/${q.items[0]._id}/approve`, { token: T, body: {} });
  const sid = appr.society._id;
  await call('POST', '/public/society-registrations/activate', { body: { referenceCode: reg.referenceCode, accessKey: reg.accessKey, password: PASSWORD } });
  const A = (await call('POST', '/auth/admin/login', { body: { email: repEmail, password: PASSWORD } })).accessToken;
  const b = await call('POST', '/society/buildings', { token: A, body: { name: 'A Wing', floors: 2 } });
  await call('POST', '/society/flats/bulk', { token: A, body: { buildingId: b._id, fromFloor: 1, toFloor: 2, unitsPerFloor: 2, pattern: '{building}-{floor}{unit}', areaSqft: 1100 } });
  const phone = randPhone();
  const r = await call('POST', '/auth/resident/register', { body: { phone, name: 'Sanjay Ninawe', password: PASSWORD } });
  const flats = await call('GET', `/society/flats?buildingId=${b._id}`, { token: A });
  const m = await call('POST', '/memberships', { token: r.accessToken, body: { societyId: sid, buildingId: b._id, flatNumber: flats.items[0].number, residentType: 'owner' } });
  await call('POST', `/society/memberships/${m._id}/approve`, { token: A, body: {} });
  await call('POST', '/society/charges', { token: A, body: { name: 'Maintenance', calculation: 'fixed', amountPaise: 240000 } });
  const period = istDay().slice(0, 7);
  await call('POST', '/society/invoices/generate', { token: A, body: { period, dueDate: istDay(10) } });
  await call('POST', '/society/announcements', { token: A, body: { title: 'Water tank cleaning on Sunday', body: 'Water supply will be off from 10 AM to 1 PM.', category: 'maintenance', important: true } });
  await call('POST', '/society/facilities', { token: A, body: { name: 'Clubhouse', description: 'Party hall', icon: 'home', feePaise: 50000, openTime: '09:00', closeTime: '21:00', slotMinutes: 60, maxAdvanceDays: 30, requiresApproval: false, active: true } });
  // Properties and services come from a KYC-approved vendor (members can't list them).
  // Vendors sign up on the Vendor Panel website (vendor session), never in the app.
  const vendorPhone = randPhone();
  const v = await call('POST', '/auth/vendor/register', { body: { phone: vendorPhone, name: 'Ravi Sharma', businessName: 'Sharma Home Services', password: PASSWORD } });
  const V = v.accessToken;
  const docs = [];
  for (let i = 0; i < 3; i += 1) docs.push((await uploadPng(V, 'kyc'))._id);
  await call('PUT', '/vendor/kyc', { token: V, body: { businessName: 'Sharma Home Services', businessType: 'business', city: 'Pune', pan: 'ABCDE1234F', aadhaar: validAadhaar(), bankAccountHolder: 'Ravi Sharma', bankAccountNumber: '50100123456789', bankIfsc: 'HDFC0001234', panPhoto: docs[0], aadhaarFront: docs[1], aadhaarBack: docs[2], consent: true } });
  await call('POST', `/platform/vendors/${v.user._id}/kyc`, { token: T, body: { decision: 'approved' } });
  const prop = await call('POST', '/properties', { token: V, body: { listingType: 'sale', propertyType: 'apartment', title: 'Spacious 2 BHK near metro', description: 'Close to schools and hospitals.', pricePaise: 950000000, areaSqft: 1100, bedrooms: 2, bathrooms: 2, city: 'Pune', locality: 'Kothrud', contactPhone: vendorPhone } });
  await call('POST', `/platform/listings/property/${prop._id}/moderate`, { token: T, body: { decision: 'approved' } }).catch(() => {});
  const ocats = await call('GET', '/service-offers/categories', { token: V });
  const plumber = ocats.items.find((c) => /plumb/i.test(c.name)) || ocats.items[0];
  const offer = await call('POST', '/service-offers', { token: V, body: { categoryId: plumber._id, title: 'Leak repair & bathroom fittings', description: 'Taps, flush tanks and pipe leaks fixed the same day.', priceType: 'starting_from', pricePaise: 29900, experienceYears: 8, serviceArea: 'Baner, Aundh', city: 'Pune', availabilityNote: 'Mon–Sat, 9 AM–7 PM', contactPhone: vendorPhone } });
  await call('POST', `/platform/listings/service/${offer._id}/moderate`, { token: T, body: { decision: 'approved' } }).catch(() => {});
  // A running boost (Sponsored) on the property, and a member booking for the vendor to act on.
  const ad = await call('POST', '/vendor/ads', { token: V, body: { kind: 'property', listingId: prop._id, city: 'Pune', area: 'Kothrud', days: 7 } });
  await call('POST', `/platform/ads/${ad._id}/review`, { token: T, body: { decision: 'approved' } });
  await call('PATCH', '/me', { token: r.accessToken, body: { city: 'Pune' } });
  await call('POST', `/service-offers/${offer._id}/bookings`, { token: r.accessToken, body: { preferredDate: istDay(2), preferredTime: '11:00', address: 'A-101, Green Valley Residency, Baner', note: 'Kitchen tap leaking' } });
  const inv = await call('GET', '/resident/invoices', { token: r.accessToken });

  // Society votes: one open (nobody here has voted), one open the member voted on, one ended with a published result.
  const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();
  const pOpen = await call('POST', '/society/polls', { token: A, body: { question: 'Should we install solar panels on the roof?', description: 'The cost is shared by all flats. Vote Interested if you want the committee to get quotes.', options: ['Interested', 'Not interested'], closesAt: inHours(52) } });
  const pVoted = await call('POST', '/society/polls', { token: A, body: { question: 'Repaint the building exterior this winter?', options: ['Yes, this winter', 'Next year', 'Need more details'], closesAt: inHours(20) } });
  await call('POST', `/resident/polls/${pVoted._id}/vote`, { token: r.accessToken, body: { optionId: pVoted.options[0]._id } });
  const pEnded = await call('POST', '/society/polls', { token: A, body: { question: 'Hold the Diwali celebration on the clubhouse lawn?', description: 'Last year it was in the parking area.', options: ['Interested', 'Not interested'] } });
  await call('POST', `/resident/polls/${pEnded._id}/vote`, { token: r.accessToken, body: { optionId: pEnded.options[0]._id } });
  // One voter per width so every width sees the open vote before and after voting.
  const voters = [];
  for (let i = 0; i < WIDTHS.length; i += 1) {
    const vp = randPhone();
    const vr = await call('POST', '/auth/resident/register', { body: { phone: vp, name: `Voter ${i + 1}`, password: PASSWORD } });
    const vm = await call('POST', '/memberships', { token: vr.accessToken, body: { societyId: sid, buildingId: b._id, flatNumber: flats.items[(i + 1) % flats.items.length].number, residentType: 'tenant' } });
    await call('POST', `/society/memberships/${vm._id}/approve`, { token: A, body: {} });
    if (i === 0) await call('POST', `/resident/polls/${pEnded._id}/vote`, { token: vr.accessToken, body: { optionId: pEnded.options[1]._id } });
    voters.push(vp);
  }
  await call('POST', `/society/polls/${pEnded._id}/close`, { token: A });
  await call('PUT', `/society/polls/${pEnded._id}/result`, { token: A, body: { result: 'Approved — the celebration will be on the clubhouse lawn on 1 Nov, 6 PM.' } });
  return { phone, vendorPhone, voters, invoiceId: inv.items?.[0]?._id, propertyId: prop._id, offerId: offer._id, polls: { open: pOpen._id, voted: pVoted._id, ended: pEnded._id } };
}

function build() {
  if (!args.includes('--build') && fs.existsSync(path.join(WEB, 'index.html'))) return;
  console.log(`Building web bundle against ${API_ORIGIN} …`);
  const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-web', '--clear'], { cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, EXPO_PUBLIC_API_URL: API_ORIGIN } });
  if (r.status !== 0) throw new Error('expo export failed');
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.json': 'application/json', '.ico': 'image/x-icon' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      let file = path.join(WEB, url);
      if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

/** DOM checks run inside the page. */
async function inspect(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const out = { overflowX: document.documentElement.scrollWidth - vw, offscreen: [], tiny: [], small: [], errorScreen: false, covered: [] };
    out.errorScreen = /Something went wrong/.test(document.body.innerText);
    const label = (el) => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.opacity !== '0';
    };
    const tabbar = document.querySelector('[role="tablist"]');
    const barTop = tabbar ? tabbar.getBoundingClientRect().top : vh;
    for (const el of document.querySelectorAll('[role="button"],[role="tab"],[role="link"],[role="switch"],[role="checkbox"],a[href],input,textarea')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      // inside a horizontal scroller (chips, carousels) it is fine to extend past the edge
      let p = el.parentElement;
      let inScroller = false;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth) {
          inScroller = true;
          break;
        }
        p = p.parentElement;
      }
      if (!inScroller && (r.left < -1 || r.right > vw + 1)) out.offscreen.push(`${label(el)} (${Math.round(r.left)}→${Math.round(r.right)})`);
      const minSide = Math.min(r.width, r.height);
      if (minSide < 24 && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') out.tiny.push(`${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      else if (minSide < 44 && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') out.small.push(`${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      // fixed tab bar must not sit on top of a control that is meant to be visible (e.g. a footer button)
      // Content scrolled inside a list is clipped by it, not covered, so only fixed (non-scrolling) controls count.
      let scrolls = false;
      for (let q = el.parentElement; q && q !== document.body; q = q.parentElement) {
        const oy = getComputedStyle(q).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && q.scrollHeight > q.clientHeight) {
          scrolls = true;
          break;
        }
      }
      if (tabbar && !scrolls && !tabbar.contains(el) && r.top < barTop && r.bottom > barTop + 4 && r.bottom <= vh) out.covered.push(label(el));
    }
    return out;
  });
}

/** Full page loads restart the web app: wait until the branded splash has finished before checking anything. */
async function go(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="custom-splash"]', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function check(page, w, name, url) {
  const errs = [];
  const onErr = (e) => errs.push(e.message);
  page.on('pageerror', onErr);
  if (url) await go(page, `http://localhost:${PORT}${url}`);
  await page.waitForTimeout(500);
  const r = await inspect(page);
  page.off('pageerror', onErr);
  for (const e of errs) fail(w, name, `page error: ${e}`);
  if (r.errorScreen) fail(w, name, 'error screen shown ("Something went wrong")');
  if (r.overflowX > 1) fail(w, name, `horizontal overflow of ${r.overflowX}px`);
  for (const o of r.offscreen) fail(w, name, `control outside the screen: ${o}`);
  for (const t of r.tiny) fail(w, name, `tap target under 24px: ${t}`);
  for (const t of r.covered) fail(w, name, `covered by the tab bar: ${t}`);
  for (const t of r.small.slice(0, 6)) warn(w, name, `tap target under 44px: ${t}`);
  fs.mkdirSync(path.join(OUT, String(w)), { recursive: true });
  await page.screenshot({ path: path.join(OUT, String(w), `${name}.png`), fullPage: true });
}

async function expectRoute(page, w, name, click, pathRe) {
  try {
    await click();
    await page.waitForURL((u) => pathRe.test(new URL(u).pathname), { timeout: 8000 });
    await page.waitForTimeout(300);
    if (/Something went wrong/.test(await page.innerText('body'))) fail(w, name, 'opened an error screen');
  } catch (e) {
    fail(w, name, `did not navigate to ${pathRe} (at ${new URL(page.url()).pathname}): ${String(e.message).split('\n')[0].slice(0, 160)}`);
  }
}

async function main() {
  console.log(`UI audit · API ${API_ORIGIN} · widths ${WIDTHS.join(', ')}`);
  const data = await seed();
  build();
  const srv = await serve();
  const browser = await chromium.launch();
  const screens = [
    ['home', '/home'], ['society', '/manage'], ['properties-tab', '/explore'], ['services', '/services'], ['profile', '/profile'],
    ['bills', '/bills'], ['community', '/community'], ['notices', '/notices'], ['complaints', '/complaints'], ['complaint-new', '/complaints/new'],
    ['amenities', '/facilities'], ['bookings', '/bookings'], ['payments', '/payments'], ['service-requests', '/service-requests'],
    ['notifications', '/notifications'], ['marketplace', '/marketplace'], ['properties', '/properties'], ['my-listings', '/my-listings'],
    ['memberships', '/memberships'], ['edit-profile', '/edit-profile'], ['change-password', '/change-password'], ['service-bookings', '/service-bookings'],
    ...(data.invoiceId ? [['invoice', `/invoice/${data.invoiceId}`]] : []),
    ['property-detail', `/properties/${data.propertyId}`],
    ['services-list', '/offers'], ['service-detail', `/offers/${data.offerId}`], ['service-book', `/offers/book?id=${data.offerId}`],
    ['polls', '/polls'], ['poll-open', `/polls/${data.polls.open}`], ['poll-voted', `/polls/${data.polls.voted}`], ['poll-ended', `/polls/${data.polls.ended}`],
  ];
  try {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: Math.round(w * 2.05) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|401|404/.test(m.text()) && warn(w, 'console', m.text().slice(0, 160)));
      process.stdout.write(`\n${w}px: `);

      await go(page, `http://localhost:${PORT}/welcome`);
      await check(page, w, 'welcome');
      await check(page, w, 'register', '/register');
      await check(page, w, 'login', '/login');
      await page.getByLabel('Mobile number').fill(data.phone);
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await page.waitForURL(/\/home$/, { timeout: 15000 });

      for (const [name, url] of screens) {
        await check(page, w, name, url);
        process.stdout.write('.');
      }

      // workflows: tabs, home modules, society tiles
      await go(page, `http://localhost:${PORT}/home`);
      for (const [tab, re] of [['manage', /\/manage$/], ['explore', /\/explore$/], ['services', /\/services$/], ['profile', /\/profile$/], ['home', /\/home$/]]) {
        await expectRoute(page, w, `tab ${tab}`, () => page.getByTestId(`tab-${tab}`).click(), re);
      }
      for (const [id, re] of [['home-society', /\/manage$/], ['home-properties', /\/explore$/], ['home-services', /\/services$/], ['home-community', /\/community$/]]) {
        await go(page, `http://localhost:${PORT}/home`);
        await expectRoute(page, w, `home card ${id}`, () => page.getByTestId(id).click(), re);
      }
      await go(page, `http://localhost:${PORT}/services`);
      await expectRoute(page, w, 'services → first category tile', () => page.locator('[data-testid^="service-cat-"]').first().click(), /\/offers/);
      await go(page, `http://localhost:${PORT}/services`);
      await expectRoute(page, w, 'services → Book Now', () => page.getByRole('button', { name: /^Book Leak repair/ }).first().click(), /\/offers\/book/);
      await go(page, `http://localhost:${PORT}/explore`);
      // Inactive tabs stay mounted (hidden), so only count the visible tag.
      const sponsoredShown = await page.locator('text=Sponsored >> visible=true').first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
      if (!sponsoredShown) fail(w, 'properties', 'boosted property is not marked Sponsored');
      if (await page.getByText('Sell', { exact: true }).isVisible().catch(() => false)) fail(w, 'properties', 'members must not see the Sell tab');
      await go(page, `http://localhost:${PORT}/services`);
      await expectRoute(page, w, 'services → provider card', () => page.getByRole('button', { name: /Leak repair/ }).first().click(), /\/offers\/[a-f0-9]{24}$/);
      for (const href of ['bills', 'payments', 'complaints', 'notices', 'community', 'facilities', 'bookings', 'service-requests', 'marketplace', 'polls']) {
        await go(page, `http://localhost:${PORT}/manage`);
        await expectRoute(page, w, `society tile ${href}`, () => page.getByTestId(`module-${href}`).click(), new RegExp(`/${href}$`));
      }
      await ctx.close();

      // Voting: a fresh member votes on the open vote through the UI (confirm dialog → "You voted").
      const pctx = await browser.newContext({ viewport: { width: w, height: Math.round(w * 2.05) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const ppage = await pctx.newPage();
      ppage.on('console', (m) => m.type() === 'error' && !/Failed to load resource|401|403|404/.test(m.text()) && warn(w, 'console', m.text().slice(0, 160)));
      const dialogs = [];
      ppage.on('dialog', (d) => {
        dialogs.push(d.message());
        d.accept().catch(() => {});
      });
      await go(ppage, `http://localhost:${PORT}/login`);
      await ppage.getByLabel('Mobile number').fill(data.voters[WIDTHS.indexOf(w)]);
      await ppage.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await ppage.getByRole('button', { name: 'Login', exact: true }).click();
      await ppage.waitForURL(/\/home$/, { timeout: 15000 });
      await check(ppage, w, 'polls-before-vote', '/polls');
      try {
        const card = ppage.getByTestId(`poll-${data.polls.open}`);
        await card.getByRole('button', { name: 'Vote Interested', exact: true }).click();
        await card.getByText(/^You voted: Interested$/).waitFor({ timeout: 8000 });
        if (!dialogs.some((m) => /can't change your vote/i.test(m))) fail(w, 'polls', 'no "You can\'t change your vote" confirmation before voting');
        if (!(await card.getByText(/^\d+ votes? · \d+(\.\d)?%$/).first().isVisible())) fail(w, 'polls', 'result bars (votes · %) not shown after voting');
      } catch (e) {
        fail(w, 'polls', `voting through the UI failed: ${String(e.message).split('\n')[0].slice(0, 160)}`);
      }
      await check(ppage, w, 'polls-after-vote');
      await check(ppage, w, 'poll-ended-result', `/polls/${data.polls.ended}`);
      if (!(await ppage.getByTestId('poll-result').isVisible().catch(() => false))) fail(w, 'poll-ended-result', 'published result box not shown');
      await pctx.close();

      // Vendors use the Vendor Panel website: signing in here shows that message (with a link) and stores no session.
      const vctx = await browser.newContext({ viewport: { width: w, height: Math.round(w * 2.05) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const vpage = await vctx.newPage();
      await go(vpage, `http://localhost:${PORT}/login`);
      if (await vpage.getByText('Vendor', { exact: true }).isVisible().catch(() => false)) fail(w, 'login', 'Member / Vendor switch still shown');
      await vpage.getByLabel('Mobile number').fill(data.vendorPhone);
      await vpage.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await vpage.getByRole('button', { name: 'Login', exact: true }).click();
      const shown = await vpage.getByText(/Vendor accounts now use the NIVASA Vendor Panel website/).first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
      if (!shown) fail(w, 'login-vendor', 'vendor sign-in did not show the Vendor Panel message');
      if (!(await vpage.getByRole('link', { name: /Open the Vendor Panel/ }).isVisible().catch(() => false))) fail(w, 'login-vendor', 'no Vendor Panel link (config.vendorPanelUrl is set on the audit API?)');
      await check(vpage, w, 'login-vendor');
      if (!/\/login$/.test(new URL(vpage.url()).pathname)) fail(w, 'login-vendor', `vendor got past sign-in (at ${new URL(vpage.url()).pathname})`);
      const stored = await vpage.evaluate(() => Object.keys(sessionStorage).filter((k) => /token/i.test(k) && sessionStorage.getItem(k)));
      if (stored.length) fail(w, 'login-vendor', `a session was stored for the vendor: ${stored.join(', ')}`);
      await vctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }

  console.log('\n');
  if (warnings.length) {
    console.log(`\x1b[33mWarnings (${warnings.length})\x1b[0m`);
    for (const x of [...new Set(warnings)].slice(0, 60)) console.log(`  ${x}`);
  }
  if (failures.length) {
    console.log(`\x1b[31mFailures (${failures.length})\x1b[0m`);
    for (const x of failures) console.log(`  ${x}`);
  }
  console.log(`\nui-audit: ${WIDTHS.length} widths · ${failures.length} failures · ${warnings.length} warnings · screenshots in qa-screenshots/`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
