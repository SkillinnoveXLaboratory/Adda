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
 *            Voting screen; vendors (shop, service form, earnings), Marketplace near me and Apply discount.
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
/** Vendor shop and the browser's GPS position (~1.1 km apart, Baner, Pune). */
const SHOP = { lat: 18.559, lng: 73.7868 };
const HERE = { latitude: 18.569, longitude: 73.7868 };
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
  // Vendors sign up in the app (accountType vendor) with a shop name and the shop location (near the member).
  const vendorPhone = randPhone();
  const v = await call('POST', '/auth/resident/register', { body: { phone: vendorPhone, name: 'Ravi Sharma', password: PASSWORD, accountType: 'vendor', shopName: 'Sharma Home Services', location: { lat: SHOP.lat, lng: SHOP.lng, label: 'Baner, Pune' } } });
  const V = v.accessToken;
  const docs = [];
  for (let i = 0; i < 3; i += 1) docs.push((await uploadPng(V, 'kyc'))._id);
  await call('PUT', '/vendor/kyc', { token: V, body: { businessName: 'Sharma Home Services', businessType: 'business', city: 'Pune', pan: 'ABCDE1234F', aadhaar: validAadhaar(), bankAccountHolder: 'Ravi Sharma', bankAccountNumber: '50100123456789', bankIfsc: 'HDFC0001234', panPhoto: docs[0], aadhaarFront: docs[1], aadhaarBack: docs[2], consent: true } });
  await call('POST', `/platform/vendors/${v.user._id}/kyc`, { token: T, body: { decision: 'approved' } });
  // Per-vendor pricing: NIVASA adds 20% for members; members can get 50% of it back ("Apply discount").
  await call('PATCH', `/platform/vendors/${v.user._id}/pricing`, { token: T, body: { commissionPercent: 20, memberDiscountPercent: 50 } });
  const prop = await call('POST', '/properties', { token: V, body: { listingType: 'sale', propertyType: 'apartment', title: 'Spacious 2 BHK near metro', description: 'Close to schools and hospitals.', pricePaise: 950000000, areaSqft: 1100, bedrooms: 2, bathrooms: 2, city: 'Pune', locality: 'Kothrud', contactPhone: vendorPhone } });
  await call('POST', `/platform/listings/property/${prop._id}/moderate`, { token: T, body: { decision: 'approved' } }).catch(() => {});
  const ocats = await call('GET', '/service-offers/categories', { token: V });
  const plumber = ocats.items.find((c) => /plumb/i.test(c.name)) || ocats.items[0];
  const offer = await call('POST', '/service-offers', { token: V, body: { categoryId: plumber._id, title: 'Leak repair & bathroom fittings', description: 'Taps, flush tanks and pipe leaks fixed the same day.', priceType: 'fixed', pricePaise: 100000, experienceYears: 8, serviceArea: 'Baner, Aundh', city: 'Pune', availabilityNote: 'Mon–Sat, 9 AM–7 PM', contactPhone: vendorPhone } });
  await call('POST', `/platform/listings/service/${offer._id}/moderate`, { token: T, body: { decision: 'approved' } }).catch(() => {});
  // A running boost (Sponsored) on the property, and a member booking for the vendor to act on.
  const ad = await call('POST', '/vendor/ads', { token: V, body: { kind: 'property', listingId: prop._id, city: 'Pune', area: 'Kothrud', days: 7 } });
  await call('POST', `/platform/ads/${ad._id}/review`, { token: T, body: { decision: 'approved' } });
  await call('PATCH', '/me', { token: r.accessToken, body: { city: 'Pune' } });
  // A finished, paid job (discount applied) for the vendor's earnings: ₹1,100 cash → vendor ₹1,000, NIVASA ₹100.
  const bk = await call('POST', `/service-offers/${offer._id}/bookings`, { token: r.accessToken, body: { preferredDate: istDay(2), preferredTime: '11:00', address: 'A-101, Green Valley Residency, Baner', note: 'Kitchen tap leaking', applyDiscount: true } });
  for (const a of ['accept', 'complete']) await call('POST', `/vendor/bookings/${bk._id}/${a}`, { token: V, body: {} });
  await call('POST', `/vendor/bookings/${bk._id}/mark-paid`, { token: V, body: { amountPaise: 110000 } });
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
  const gateData = await seedGate(); // gate security (block at the end of this file)
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
    ['services-list', '/offers'], ['market', '/market'], ['service-detail', `/offers/${data.offerId}`], ['service-book', `/offers/book?id=${data.offerId}`],
    ['polls', '/polls'], ['poll-open', `/polls/${data.polls.open}`], ['poll-voted', `/polls/${data.polls.voted}`], ['poll-ended', `/polls/${data.polls.ended}`],
  ];
  try {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: Math.round(w * 2.05) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, geolocation: HERE, permissions: ['geolocation'] });
      const page = await ctx.newPage();
      page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|401|404/.test(m.text()) && warn(w, 'console', m.text().slice(0, 160)));
      process.stdout.write(`\n${w}px: `);
      await gateFlows(browser, w, gateData); // gate security flows (own browser contexts)

      await go(page, `http://localhost:${PORT}/welcome`);
      await check(page, w, 'welcome');
      await check(page, w, 'register', '/register');
      await check(page, w, 'login', '/login');
      if (!(await page.getByRole('link', { name: 'Gate staff sign-in' }).isVisible().catch(() => false))) fail(w, 'login', 'no "Gate staff sign-in" link');
      if (!(await page.getByTestId('login-as-vendor').isVisible().catch(() => false))) fail(w, 'login', 'no Member / Vendor switch');
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

      await vendorMarketFlows(browser, w, data);
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

// ======================================================================= vendors, marketplace, near me, discount
// (skills/vendor-marketplace, skills/location-maps). Member: Marketplace → Near me (browser GPS) with km chips and
// "x.x km away", service detail → Apply discount → booking form "you pay ₹1,100". Vendor: sign-up with shop + GPS
// location → KYC; seeded vendor (Vendor switch) → dashboard, Shop settings, service form "Members see ₹1,200",
// Earnings (₹1,000 earned from the seeded ₹1,100 cash job), bookings with the settlement.
async function vendorMarketFlows(browser, w, data) {
  const ctxOpts = { viewport: { width: w, height: Math.round(w * 2.05) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, geolocation: HERE, permissions: ['geolocation'] };
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      fail(w, name, String(e.message).split('\n')[0].slice(0, 200));
    }
  };
  const signIn = async (page, phone, type) => {
    await go(page, `http://localhost:${PORT}/login`);
    if (type === 'vendor') await page.getByTestId('login-as-vendor').click();
    await page.getByLabel('Mobile number').fill(phone);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
  };

  // ---- member
  const mctx = await browser.newContext(ctxOpts);
  const m = await mctx.newPage();
  await step('member sign-in', async () => {
    await signIn(m, data.phone, 'member');
    await m.waitForURL(/\/home$/, { timeout: 15000 });
  });
  await step('home → Marketplace', async () => {
    await expectRoute(m, w, 'home marketplace card', () => m.getByTestId('home-marketplace').click(), /\/market$/);
  });
  await step('marketplace near me', async () => {
    await go(m, `http://localhost:${PORT}/market`);
    await m.getByTestId('near-me-toggle').click();
    await m.getByTestId('radius-5').click();
    await m.getByTestId('offer-distance').first().waitFor({ timeout: 10000 });
    const d = await m.getByTestId('offer-distance').first().innerText();
    if (!/(^|\s)1\.\d km away$/.test(d.trim())) fail(w, 'market-near-me', `unexpected distance "${d.trim()}" (expected ~1.1 km away)`);
    if (!(await m.getByText(/within 5 km · nearest first/).isVisible())) fail(w, 'market-near-me', 'no "within 5 km · nearest first" line');
    await check(m, w, 'market-near-me');
    await m.getByTestId('radius-custom').click();
    await m.getByTestId('radius-custom-input').fill('150');
    if (!(await m.getByText('Enter whole kilometres from 1 to 100').isVisible())) fail(w, 'market-near-me', 'custom radius 150 accepted');
    await m.getByRole('button', { name: 'Properties' }).click();
    await m.getByText(/Spacious 2 BHK/).first().waitFor({ timeout: 8000 });
    await check(m, w, 'market-properties');
  });
  await step('service detail → Apply discount', async () => {
    await go(m, `http://localhost:${PORT}/offers/${data.offerId}`);
    await m.getByTestId('offer-price-shown').waitFor({ timeout: 8000 });
    const shown = await m.getByTestId('offer-price-shown').innerText();
    if (!/1,200/.test(shown)) fail(w, 'service-detail', `member price shows "${shown}" (expected ₹1,200)`);
    if (!(await m.getByText('Sharma Home Services').first().isVisible())) fail(w, 'service-detail', 'shop name not shown');
    await check(m, w, 'service-detail-discount');
    await m.getByRole('button', { name: 'Apply discount' }).click();
    await m.waitForURL(/\/offers\/book/, { timeout: 8000 });
    await m.getByTestId('discount-applied').waitFor({ timeout: 8000 });
    const t = await m.getByTestId('discount-applied').innerText();
    if (!/−₹100(\.00)?, you pay ₹1,100/.test(t)) fail(w, 'service-book-discount', `discount box says "${t.replace(/\s+/g, ' ')}"`);
    await check(m, w, 'service-book-discount');
    if (await m.getByText(/coupon/i).first().isVisible().catch(() => false)) fail(w, 'service-book-discount', 'coupon text still shown');
    await m.getByRole('button', { name: 'Remove discount' }).click();
    await m.getByTestId('discount-applied').waitFor({ state: 'detached', timeout: 5000 });
  });
  await mctx.close();

  // ---- seeded vendor (KYC approved, 20% fee, 50% member discount)
  const vctx = await browser.newContext(ctxOpts);
  const v = await vctx.newPage();
  v.on('dialog', (d) => d.accept().catch(() => {}));
  await step('vendor sign-in (Vendor switch)', async () => {
    await signIn(v, data.vendorPhone, 'vendor');
    await v.waitForURL(/\/dashboard$/, { timeout: 15000 });
    await check(v, w, 'vendor-dashboard');
  });
  await step('vendor shop settings', async () => {
    await expectRoute(v, w, 'vendor shop tile', () => v.getByTestId('vendor-shop').click(), /\/shop$/);
    await v.getByText('Baner, Pune').first().waitFor({ timeout: 8000 });
    await check(v, w, 'vendor-shop');
  });
  await step('vendor service form', async () => {
    await go(v, `http://localhost:${PORT}/offers/edit`);
    await v.getByTestId('offer-price').fill('1000');
    await v.getByTestId('members-see').waitFor({ timeout: 8000 });
    const t = await v.getByTestId('members-see').innerText();
    if (!/1,200/.test(t)) fail(w, 'vendor-service-form', `members-see shows "${t}" (expected ₹1,200)`);
    await check(v, w, 'vendor-service-form');
  });
  await step('vendor earnings', async () => {
    await go(v, `http://localhost:${PORT}/earnings`);
    await v.getByTestId('earnings-total').waitFor({ timeout: 8000 });
    const t = await v.getByTestId('earnings-total').innerText();
    if (!/1,000/.test(t)) fail(w, 'vendor-earnings', `"You earned" shows "${t.replace(/\s+/g, ' ')}" (expected ₹1,000)`);
    await check(v, w, 'vendor-earnings');
  });
  await step('vendor bookings', async () => {
    await go(v, `http://localhost:${PORT}/vendor-bookings`);
    await v.getByRole('button', { name: 'Done', exact: true }).click();
    await v.getByTestId('booking-settlement').first().waitFor({ timeout: 8000 });
    await check(v, w, 'vendor-bookings');
  });
  await vctx.close();

  // ---- vendor sign-up with shop + GPS location (a new account per width)
  const nctx = await browser.newContext(ctxOpts);
  const n = await nctx.newPage();
  await step('vendor sign-up with shop + location', async () => {
    await go(n, `http://localhost:${PORT}/register`);
    await n.getByTestId('register-as-vendor').click();
    await n.getByLabel('Full name').fill('Asha Kulkarni');
    await n.getByLabel('Mobile number').fill(randPhone());
    await n.getByRole('button', { name: 'Continue' }).click();
    await n.getByTestId('register-shop-step').waitFor({ timeout: 5000 });
    await n.getByLabel('Shop name').fill('Asha Cleaning Co');
    await n.getByRole('button', { name: 'Use my current location' }).click();
    await n.getByTestId('register-location-value').waitFor({ timeout: 10000 });
    await check(n, w, 'vendor-register-shop');
    await n.getByRole('button', { name: 'Continue' }).click();
    await n.getByLabel('Create password').fill(PASSWORD);
    await n.getByLabel('Confirm password').fill(PASSWORD);
    await n.getByRole('checkbox').click();
    await n.getByRole('button', { name: 'Create account' }).click();
    await n.waitForURL(/\/kyc$/, { timeout: 15000 });
    await check(n, w, 'vendor-kyc-new');
  });
  await nctx.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// ======================================================================= gate security (skills/gate-security)
// Own society: members in two flats, a gateman, guests pre-registered by members (one pair per width so every width
// can approve → enter → exit and reject), a guest for tomorrow and one inside. Flows per width: gate sign-in, approve →
// entered → exited, reject with a reason, walk-in assigned to a flat ("Entered now"), members directory (call + note),
// member detail, profile + sign out; then the member sees the Guests tile badge, adds (with time validation) and cancels
// a guest, and reads the gate's note (marked read on open).
const GATE_NAMES = {
  approve: ['Kiran Patil', 'Neha Rao', 'Arjun Mehta', 'Isha Gupta'],
  reject: ['Vikram Singh', 'Pooja Shah', 'Rohan Das', 'Meena Joshi'],
  walkin: ['Suresh Yadav', 'Anita Kulkarni', 'Mohit Jain', 'Lata Pillai'],
  member: ['Deepa Nair', 'Farhan Ali', 'Kavya Iyer', 'Nikhil Bose'],
};

async function seedGate() {
  const owner = await superAdminLogin(API, SA.email, SA.password);
  const T = owner.body.accessToken;
  const repEmail = `gate.audit.${RUN.toLowerCase()}@example.com`;
  const reg = await call('POST', '/public/society-registrations', {
    body: { societyName: `Lake View Heights ${RUN}`, addressLine: 'Survey 12, Aundh Road', city: 'Pune', state: 'Maharashtra', pincode: '411007', phone: '2025551234', email: `gate.office.${RUN.toLowerCase()}@example.com`, representative: { name: 'Anil Deshmukh', phone: randPhone(), email: repEmail }, documents: [], submit: true },
  });
  const q = await call('GET', `/platform/society-registrations?q=${reg.referenceCode}`, { token: T });
  const appr = await call('POST', `/platform/society-registrations/${q.items[0]._id}/approve`, { token: T, body: {} });
  const sid = appr.society._id;
  await call('POST', '/public/society-registrations/activate', { body: { referenceCode: reg.referenceCode, accessKey: reg.accessKey, password: PASSWORD } });
  const A = (await call('POST', '/auth/admin/login', { body: { email: repEmail, password: PASSWORD } })).accessToken;
  // A society logo (the app's mark stands in for one) so the gate header and profile show it.
  const form = new FormData();
  form.append('purpose', 'society_logo');
  form.append('file', new Blob([fs.readFileSync(path.join(ROOT, 'assets/images/logo-mark.png'))], { type: 'image/png' }), 'logo.png');
  const up = await (await fetch(`${API}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${A}` }, body: form })).json();
  if (up?._id) await call('PATCH', '/society/profile', { token: A, body: { logoId: up._id } });
  const b = await call('POST', '/society/buildings', { token: A, body: { name: 'Tower A', floors: 2 } });
  await call('POST', '/society/flats/bulk', { token: A, body: { buildingId: b._id, fromFloor: 1, toFloor: 2, unitsPerFloor: 2, pattern: '{building}-{floor}{unit}', areaSqft: 950 } });
  const flats = await call('GET', `/society/flats?buildingId=${b._id}`, { token: A });
  const [f1, f2] = flats.items.map((f) => f.number).sort();
  const member = async (name, flatNumber, residentType = 'owner') => {
    const phone = randPhone();
    const r = await call('POST', '/auth/resident/register', { body: { phone, name, password: PASSWORD } });
    const m = await call('POST', '/memberships', { token: r.accessToken, body: { societyId: sid, buildingId: b._id, flatNumber, residentType } });
    await call('POST', `/society/memberships/${m._id}/approve`, { token: A, body: {} });
    return { phone, name, T: r.accessToken, id: r.user._id };
  };
  const rahul = await member('Rahul Verma', f1);
  await member('Riya Verma', f1, 'tenant');
  const priya = await member('Priya Menon', f2);
  const gateEmail = `gate1.${RUN.toLowerCase()}@example.com`;
  await call('POST', '/society/gatemen', { token: A, body: { name: 'Ramesh Pawar', email: gateEmail, password: PASSWORD, phone: randPhone() } });
  const G = (await call('POST', '/auth/gate/login', { body: { email: gateEmail, password: PASSWORD } })).accessToken;
  const today = istDay(0);
  for (let i = 0; i < WIDTHS.length; i += 1) {
    await call('POST', '/resident/visitors', { token: rahul.T, body: { name: GATE_NAMES.approve[i], phone: randPhone(), purpose: 'Family visit', expectedDate: today, expectedIn: '18:00', expectedOut: '21:30' } });
    await call('POST', '/resident/visitors', { token: priya.T, body: { name: GATE_NAMES.reject[i], phone: randPhone(), purpose: 'Sales visit', expectedDate: today, expectedIn: '11:00' } });
  }
  const courier = await call('POST', '/resident/visitors', { token: priya.T, body: { name: 'Blue Dart courier', phone: randPhone(), purpose: 'Parcel delivery', expectedDate: today } });
  await call('POST', `/gate/visitors/${courier._id}/approve`, { token: G, body: { enterNow: true } });
  await call('POST', '/resident/visitors', { token: rahul.T, body: { name: 'Sunita Verma (mother)', phone: randPhone(), purpose: 'Staying for the weekend', expectedDate: istDay(1), expectedIn: '09:30' } });
  return { society: `Lake View Heights ${RUN}`, gateEmail, rahul, priya, flats: { f1, f2 } };
}

async function gateFlows(browser, w, g) {
  const i = WIDTHS.indexOf(w);
  const newCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: w, height: Math.round(w * 2.05) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|401|403|404|409/.test(m.text()) && warn(w, 'console', m.text().slice(0, 160)));
    page.on('dialog', (d) => d.accept().catch(() => {}));
    return { ctx, page };
  };
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      fail(w, name, String(e.message).split('\n')[0].slice(0, 200));
    }
  };

  // ---------------------------------------------------------------- gateman
  const { ctx, page } = await newCtx();
  await step('gate sign-in', async () => {
    await go(page, `http://localhost:${PORT}/login`);
    await page.getByRole('link', { name: 'Gate staff sign-in' }).click();
    await page.waitForURL(/\/gate-login$/, { timeout: 8000 });
    await check(page, w, 'gate-login');
    await page.getByTestId('gate-login-form').getByLabel('Email').fill(g.gateEmail);
    await page.getByTestId('gate-login-form').locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in to the gate' }).click();
    await page.waitForURL(/\/gate$/, { timeout: 15000 });
    await page.getByText(g.society).first().waitFor({ timeout: 8000 });
  });
  await check(page, w, 'gate-guests-today');
  if (!(await page.getByRole('button', { name: `Approve ${GATE_NAMES.approve[i]}` }).isVisible().catch(() => false))) fail(w, 'gate-guests-today', `no Approve button for ${GATE_NAMES.approve[i]}`);

  await step('gate approve → entered → exited', async () => {
    const name = GATE_NAMES.approve[i];
    await page.getByRole('button', { name: `Approve ${name}` }).click();
    await page.getByRole('button', { name: `Entered ${name}` }).waitFor({ timeout: 8000 });
    await check(page, w, 'gate-guest-actions');
    await page.getByRole('button', { name: `Entered ${name}` }).click();
    await page.getByRole('button', { name: `Exited ${name}` }).waitFor({ timeout: 8000 });
    await page.getByRole('button', { name: `Exited ${name}` }).click();
    await page.getByRole('button', { name: new RegExp(`^Guest ${name}, exited`) }).waitFor({ timeout: 8000 });
  });
  await step('gate reject with reason', async () => {
    const name = GATE_NAMES.reject[i];
    await page.getByRole('button', { name: `Reject ${name}` }).click();
    await page.getByLabel('Reason (optional)').fill('Resident not reachable');
    await check(page, w, 'gate-reject-sheet');
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`^Guest ${name}, rejected`) }).waitFor({ timeout: 8000 });
  });
  await step('gate tabs', async () => {
    await page.getByRole('button', { name: /^Inside/ }).click();
    await page.getByText('Blue Dart courier').first().waitFor({ timeout: 8000 });
    await check(page, w, 'gate-guests-inside');
    await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
    await page.getByText('Sunita Verma (mother)').first().waitFor({ timeout: 8000 });
    await check(page, w, 'gate-guests-upcoming');
  });

  await step('gate walk-in for a flat', async () => {
    await page.getByTestId('gate-tab-add').click();
    await page.waitForURL(/\/gate\/add$/, { timeout: 8000 });
    const name = GATE_NAMES.walkin[i];
    await page.getByLabel('Guest name').fill(name);
    await page.getByLabel('Mobile number').fill(randPhone());
    await page.getByLabel('Purpose (optional)').fill('Plumber for kitchen sink');
    await page.getByLabel('Search flat number, e.g. A-101').fill(g.flats.f2);
    await page.getByRole('button', { name: `Flat ${g.flats.f2}`, exact: true }).click();
    await page.getByRole('radio', { name: 'Priya Menon' }).waitFor({ timeout: 8000 });
    await check(page, w, 'gate-add-walkin');
    await page.getByRole('button', { name: 'Add guest & let in' }).click();
    await page.waitForURL(/\/gate\/guest\/[a-f0-9]{24}$/, { timeout: 10000 });
    // The guest list stays mounted under the detail screen: match only the visible text.
    await page.getByText(`Flat ${g.flats.f2} · Tower A`).filter({ visible: true }).first().waitFor({ timeout: 8000 });
    await page.getByRole('button', { name: `Exited ${name}` }).waitFor({ timeout: 8000 });
    await check(page, w, 'gate-guest-detail');
  });

  await step('gate members: call + note', async () => {
    await go(page, `http://localhost:${PORT}/gate/members`);
    await page.getByText('Rahul Verma').first().waitFor({ timeout: 8000 });
    if (!(await page.getByRole('button', { name: /^Call Rahul Verma \+91 \d{5} \d{5}$/ }).isVisible())) throw new Error('no call button with the +91 number for Rahul Verma');
    await check(page, w, 'gate-members');
    await page.getByLabel('Search name, flat or phone').fill('Rahul');
    await page.getByRole('button', { name: 'Send note to Rahul Verma' }).click();
    await page.getByLabel('Note', { exact: true }).fill(`Your Amazon parcel is kept at the gate (${w})`);
    await check(page, w, 'gate-note-sheet');
    await page.getByRole('button', { name: 'Send note', exact: true }).click();
    await page.getByText('Note sent to Rahul Verma').first().waitFor({ timeout: 8000 });
    await page.getByRole('button', { name: /^Rahul Verma, flat/ }).click();
    await page.waitForURL(/\/gate\/member\/[a-f0-9]{24}$/, { timeout: 8000 });
    await page.getByText(`Your Amazon parcel is kept at the gate (${w})`).first().waitFor({ timeout: 8000 });
    await check(page, w, 'gate-member-detail');
  });

  await step('gate profile + sign out', async () => {
    await go(page, `http://localhost:${PORT}/gate/profile`);
    await page.getByText('Ramesh Pawar').first().waitFor({ timeout: 8000 });
    await check(page, w, 'gate-profile');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL((u) => !/\/gate/.test(new URL(u).pathname), { timeout: 10000 });
  });
  await ctx.close();

  // ---------------------------------------------------------------- member: Guests screen + notes
  const m = await newCtx();
  await step('member guests', async () => {
    await go(m.page, `http://localhost:${PORT}/login`);
    await m.page.getByLabel('Mobile number').fill(g.rahul.phone);
    await m.page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await m.page.getByRole('button', { name: 'Login', exact: true }).click();
    await m.page.waitForURL(/\/home$/, { timeout: 15000 });
    await go(m.page, `http://localhost:${PORT}/manage`);
    const badge = await m.page.getByRole('button', { name: /^Guests, \d+$/ }).waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
    if (!badge) fail(w, 'society', 'Guests tile has no unread-notes badge');
    await expectRoute(m.page, w, 'society tile guests', () => m.page.getByTestId('module-guests').click(), /\/guests$/);
    await m.page.getByText('Sunita Verma (mother)').first().waitFor({ timeout: 8000 });
    await check(m.page, w, 'member-guests');
    await m.page.getByRole('button', { name: 'Add guest', exact: true }).last().click();
    await m.page.waitForURL(/\/guests\/new$/, { timeout: 8000 });
    const name = GATE_NAMES.member[i];
    await m.page.getByLabel('Guest name').fill(name);
    await m.page.getByLabel('Mobile number').fill(randPhone());
    await m.page.getByLabel('Expected in (optional)').fill('1900');
    await m.page.getByLabel('Expected out (optional)').fill('1800');
    await m.page.getByRole('button', { name: 'Add guest', exact: true }).last().click();
    await m.page.getByText('The out time must be after the in time').waitFor({ timeout: 5000 });
    await m.page.getByLabel('Expected out (optional)').fill('2130');
    await m.page.getByLabel('Purpose (optional)').fill('Dinner');
    await check(m.page, w, 'member-guest-new');
    await m.page.getByRole('button', { name: 'Add guest', exact: true }).last().click();
    await m.page.waitForURL(/\/guests$/, { timeout: 10000 });
    await m.page.getByText(name).first().waitFor({ timeout: 8000 });
    await m.page.getByRole('button', { name: `Cancel ${name}'s visit` }).click();
    await m.page.getByRole('button', { name: `Cancel ${name}'s visit` }).waitFor({ state: 'detached', timeout: 8000 });
    await m.page.getByRole('button', { name: 'Past', exact: true }).click();
    await m.page.getByText(name).first().waitFor({ timeout: 8000 });
    await check(m.page, w, 'member-guests-past');
  });
  await step('member reads gate note', async () => {
    await m.page.getByRole('button', { name: /^Notes/ }).click();
    await m.page.getByText(`Your Amazon parcel is kept at the gate (${w})`).first().waitFor({ timeout: 8000 });
    await m.page.waitForTimeout(800);
    await check(m.page, w, 'member-gate-notes');
    const r = await call('GET', '/resident/gate-notes?limit=1', { token: g.rahul.T });
    if (r.unread !== 0) throw new Error(`notes not marked read after opening (unread ${r.unread})`);
  });
  await m.ctx.close();
}
