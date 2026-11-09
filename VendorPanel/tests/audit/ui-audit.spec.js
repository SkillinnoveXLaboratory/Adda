import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { aadhaar, API, apiCall, istDay, ownerToken, pan, PASSWORD, png, randPhone, RUN } from '../e2e/helpers.js';

/**
 * UI audit: every page at 390 px and 1440 px. Fails on
 *  - horizontal page scroll / elements sticking out of the viewport,
 *  - buttons partly off-screen,
 *  - inputs / selects / textareas without a label,
 *  - buttons under 40 px tall,
 *  - leftover SocialPanel colours (#2563eb blue, #705ec8 / #1170e4 brand) in computed button colours.
 * SHOTS_DIR=<folder> also saves a full-length screenshot of each page.
 */
const WIDTHS = [390, 1440];
const SHOTS = process.env.SHOTS_DIR || '';
const BANNED = ['rgb(37, 99, 235)', 'rgb(112, 94, 200)', 'rgb(17, 112, 228)', 'rgb(92, 74, 199)'];
const PURPLE = 'rgb(124, 58, 237)';

async function upload(token, purpose, i) {
  const form = new FormData();
  form.append('purpose', purpose);
  const f = png(i, `${purpose}-${i}.png`);
  form.append('file', new Blob([f.buffer], { type: 'image/png' }), f.name);
  const res = await fetch(`${API}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!res.ok) throw new Error(`upload ${purpose} → ${res.status}`);
  return res.json();
}

/** Seeds two vendors: a new one (KYC needed) and a verified one with a service, a property, bookings (one paid), a boost. */
async function seed() {
  const owner = await ownerToken();
  const fresh = await apiCall('POST', '/auth/vendor/register', { body: { phone: randPhone(), name: `Asha ${RUN}`, businessName: `Asha Home Care ${RUN}`, password: PASSWORD } });
  const v = await apiCall('POST', '/auth/vendor/register', { body: { phone: randPhone(), name: `Ravi Kumar ${RUN}`, businessName: `Ravi Plumbing Services ${RUN}`, password: PASSWORD } });
  const T = v.accessToken;
  const docs = [await upload(T, 'kyc', 0), await upload(T, 'kyc', 1), await upload(T, 'kyc', 0)];
  await apiCall('PUT', '/vendor/kyc', { token: T, body: { businessName: `Ravi Plumbing Services ${RUN}`, businessType: 'business', city: 'Pune', address: 'Shop 12, Baner Road', pan: pan(), aadhaar: aadhaar(), bankAccountHolder: 'Ravi Kumar', bankAccountNumber: '50100123456789', bankIfsc: 'SBIN0001234', bankName: 'State Bank of India', panPhoto: docs[0]._id, aadhaarFront: docs[1]._id, aadhaarBack: docs[2]._id, consent: true } });
  await apiCall('POST', `/platform/vendors/${v.user._id}/kyc`, { token: owner, body: { decision: 'approved' } });
  const cats = await apiCall('GET', '/public/categories?kind=service');
  const photo = await upload(T, 'service', 0);
  const offer = await apiCall('POST', '/service-offers', { token: T, body: { categoryId: cats.items[0]._id, title: `Leak repair & bathroom fittings ${RUN}`, description: 'Taps, flush tanks, pipe leaks. I bring my own tools.', priceType: 'fixed', pricePaise: 49900, experienceYears: 8, serviceArea: 'Baner, Aundh, Wakad', city: 'Pune', availabilityNote: 'Mon–Sat, 9 AM–7 PM', contactName: 'Ravi Plumbing', contactPhone: v.user.phone, whatsappAvailable: true, photos: [photo._id] } });
  if (offer.moderationStatus === 'pending') await apiCall('POST', `/platform/listings/service/${offer._id}/moderate`, { token: owner, body: { decision: 'approved' } });
  await apiCall('POST', '/service-offers', { token: T, body: { categoryId: cats.items[1]._id, title: `Fan & switchboard repair ${RUN}`, priceType: 'starting_from', pricePaise: 29900, city: 'Pune', contactPhone: v.user.phone } });
  const pphoto = await upload(T, 'property', 1);
  const prop = await apiCall('POST', '/properties', { token: T, body: { listingType: 'rent', propertyType: 'apartment', title: `Spacious 2BHK near Baner main road ${RUN}`, pricePaise: 2500000, bedrooms: 2, bathrooms: 2, areaSqft: 950, furnishing: 'semi_furnished', locality: 'Baner', city: 'Pune', contactPhone: v.user.phone, photos: [pphoto._id] } });
  if (prop.moderationStatus === 'pending') await apiCall('POST', `/platform/listings/property/${prop._id}/moderate`, { token: owner, body: { decision: 'approved' } });
  // Bookings: one paid, one new, one declined.
  const members = [];
  for (let i = 0; i < 3; i += 1) members.push(await apiCall('POST', '/auth/resident/register', { body: { phone: randPhone(), name: ['Priya Sharma', 'Anil Mehta', 'Kavya Rao'][i], password: PASSWORD } }));
  const book = (m, day, note) => apiCall('POST', `/service-offers/${offer._id}/bookings`, { token: m.accessToken, body: { preferredDate: istDay(day), preferredTime: '10:30', address: 'Flat 4B, Green Park Society, Baner, Pune 411045', note } });
  const b1 = await book(members[0], 1, 'Kitchen tap leaking since morning');
  await apiCall('POST', `/vendor/bookings/${b1._id}/accept`, { token: T, body: {} });
  await apiCall('POST', `/vendor/bookings/${b1._id}/complete`, { token: T, body: {} });
  await apiCall('POST', `/vendor/bookings/${b1._id}/mark-paid`, { token: T, body: { amountPaise: 49900, note: 'Paid in cash' } });
  await book(members[1], 2, 'Bathroom flush not working');
  const b3 = await book(members[2], 3);
  await apiCall('POST', `/vendor/bookings/${b3._id}/decline`, { token: T, body: { note: 'Not available that day' } });
  await apiCall('POST', '/vendor/ads', { token: T, body: { kind: 'service', listingId: offer._id, city: 'Pune', area: 'Baner', days: 7 } });
  return { fresh, verified: v, offerId: offer._id, propId: prop._id };
}

const sessionOf = (r) => ({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user, vendor: r.vendor });

async function signIn(page, auth) {
  // A static file on the same origin: no app running that could write its own session back.
  await page.goto('/favicon.svg');
  await page.evaluate((s) => sessionStorage.setItem('nivasa.vendor.session', JSON.stringify(s)), sessionOf(auth));
}

/** Runs every check on the current page; returns a list of problems. */
async function audit(page) {
  return page.evaluate(
    ({ banned, purple }) => {
      const problems = [];
      const vw = document.documentElement.clientWidth;
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
        return !el.closest('[aria-hidden="true"]');
      };
      const sidebar = document.getElementById('sidebar');
      const sidebarHidden = sidebar && sidebar.getBoundingClientRect().right <= 0;
      const inHiddenSidebar = (el) => sidebarHidden && sidebar.contains(el);
      const inHScroller = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth) return true;
        }
        return false;
      };
      const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);

      // 1. Horizontal page scroll (document or the main scroller).
      if (document.documentElement.scrollWidth > vw + 1) problems.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${vw})`);
      const main = document.getElementById('main');
      if (main && main.scrollWidth > main.clientWidth + 1) problems.push(`main area overflows horizontally (${main.scrollWidth} > ${main.clientWidth})`);
      for (const el of document.querySelectorAll('body *')) {
        if (!visible(el) || inHiddenSidebar(el) || inHScroller(el) || el.closest('.sr-only')) continue;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && r.width < vw * 2) {
          problems.push(`element sticks out of the viewport: <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 60)}"> right=${Math.round(r.right)}`);
          break;
        }
      }
      // 2 + 4 + 5. Buttons: on screen, ≥ 40 px tall, no leftover blue.
      for (const el of document.querySelectorAll('button, [role="button"], input[type="submit"]')) {
        if (!visible(el) || inHiddenSidebar(el) || el.closest('.sr-only')) continue;
        const r = el.getBoundingClientRect();
        if (!inHScroller(el) && (r.left < -1 || r.right > vw + 1)) problems.push(`button off-screen: "${name(el)}"`);
        if (r.height < 39.5) problems.push(`button under 40 px (${Math.round(r.height)} px): "${name(el)}"`);
        const cs = getComputedStyle(el);
        for (const c of [cs.backgroundColor, cs.color, cs.borderTopColor]) if (banned.includes(c)) problems.push(`button uses SocialPanel colour ${c}: "${name(el)}"`);
      }
      // 3. Every input has a label.
      for (const el of document.querySelectorAll('input, select, textarea')) {
        if (el.type === 'hidden') continue;
        const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
        if (!labelled) problems.push(`input without a label: ${el.tagName.toLowerCase()}[name=${el.getAttribute('name')}]`);
      }
      // Purple brand present on pages with a primary button.
      const usesPurple = [...document.querySelectorAll('button, a')].some((el) => visible(el) && getComputedStyle(el).backgroundColor === purple);
      return { problems, usesPurple };
    },
    { banned: BANNED, purple: PURPLE },
  );
}

async function shot(page, file, width) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  // The app shell scrolls inside <main>; grow the viewport so the whole page is in the picture.
  const h = await page.evaluate(() => {
    const m = document.getElementById('main');
    return m ? m.scrollHeight + 64 : document.documentElement.scrollHeight;
  });
  const base = width === 390 ? 844 : 900;
  await page.setViewportSize({ width, height: Math.min(Math.max(base, h), 6000) });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, file) });
  await page.setViewportSize({ width, height: base });
}

let data;
let commissionBefore = 0;
// A failed test restarts the worker; reuse this run's seed instead of creating everything again.
const SEED_FILE = path.join('test-results', 'audit-seed.json');
test.beforeAll(async () => {
  if (fs.existsSync(SEED_FILE)) {
    ({ data, commissionBefore } = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')));
    return;
  }
  const owner = await ownerToken();
  commissionBefore = (await apiCall('GET', '/public/config')).services?.commissionPercent ?? 0;
  await apiCall('PUT', '/platform/settings/services.commissionPercent', { token: owner, body: { value: 10 } });
  data = await seed();
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(SEED_FILE, JSON.stringify({ data, commissionBefore }));
});
test.afterAll(async () => {
  try {
    const owner = await ownerToken();
    await apiCall('PUT', '/platform/settings/services.commissionPercent', { token: owner, body: { value: commissionBefore } });
  } catch (err) {
    console.warn('Could not restore the commission setting:', err.message);
  }
});

const PUBLIC = [
  ['login', '/login', '#phone'],
  ['register', '/register', '#name'],
];
const NEW_VENDOR = [
  ['new-dashboard', '/dashboard', '[data-testid=kyc-banner]'],
  ['kyc-form', '/kyc', '[data-testid=kyc-form]'],
];
const VERIFIED = (d) => [
  ['dashboard', '/dashboard', '[data-testid=vendor-settlement]'],
  ['kyc-approved', '/kyc', '[data-testid=kyc-summary]'],
  ['services', '/services', '[data-testid=service-card]'],
  ['service-form', '/services/new', '[data-testid=commission-breakdown]'],
  ['service-edit', `/services/${d.offerId}/edit`, '[data-testid=commission-earn]'],
  ['properties', '/properties', '[data-testid=property-card]'],
  ['property-form', `/properties/${d.propId}/edit`, '[data-testid=property-form]'],
  ['bookings-open', '/bookings', '[data-testid=booking-card]'],
  ['bookings-completed', '/bookings?tab=completed', '[data-testid=booking-settlement]'],
  ['bookings-cancelled', '/bookings?tab=cancelled', '[data-testid=booking-card]'],
  ['boosts', '/boosts', '[data-testid=boost-card]'],
  ['boost-form', `/boosts/new?kind=service&id=${d.offerId}`, '[data-testid=boost-summary]'],
  ['notifications', '/notifications', 'h1'],
  ['profile', '/profile', '[data-testid=password-save]'],
];

for (const width of WIDTHS) {
  test(`every page passes the audit at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const failures = [];
    let purpleSeen = 0;
    // Inside the app, move between pages like a user (client-side), so each page costs only its own API calls.
    let inApp = false;
    const go = async (url) => {
      if (inApp) await page.evaluate((u) => (window.history.pushState({}, '', u), window.dispatchEvent(new PopStateEvent('popstate'))), url);
      else await page.goto(url);
    };
    const visit = async (label, url, ready) => {
      await go(url);
      await expect(page.locator(ready).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(200);
      const { problems, usesPurple } = await audit(page);
      if (usesPurple) purpleSeen += 1;
      for (const p of problems) failures.push(`[${width}px ${label}] ${p}`);
      await shot(page, `${label}-${width}.png`, width);
    };

    for (const [label, url, ready] of PUBLIC) await visit(label, url, ready);
    await signIn(page, data.fresh);
    inApp = false;
    for (const [label, url, ready] of NEW_VENDOR) (await visit(label, url, ready), (inApp = true));
    await signIn(page, data.verified);
    inApp = false;
    for (const [label, url, ready] of VERIFIED(data)) (await visit(label, url, ready), (inApp = true));

    // Dialog and phone menu.
    await go('/bookings?tab=completed');
    await expect(page.getByTestId('booking-card').first()).toBeVisible();
    if (width === 390) {
      await page.getByTestId('toggle-sidebar').click();
      await expect(page.locator('#sidebar')).toBeInViewport();
      await page.waitForTimeout(300);
      for (const p of (await audit(page)).problems) failures.push(`[${width}px mobile-menu] ${p}`);
      await shot(page, `mobile-menu-${width}.png`, width);
      await page.keyboard.press('Escape');
      await go('/bookings');
    } else {
      await go('/bookings');
    }
    await page.getByTestId('booking-card').filter({ hasText: 'Bathroom flush' }).getByTestId('booking-decline').click();
    await expect(page.getByTestId('note-dialog')).toBeVisible();
    await page.waitForTimeout(400); // let the pop-in animation finish before measuring
    for (const p of (await audit(page)).problems) failures.push(`[${width}px decline-dialog] ${p}`);
    await shot(page, `decline-dialog-${width}.png`, width);

    expect(purpleSeen, 'purple primary colour used').toBeGreaterThan(10);
    expect(failures, failures.join('\n')).toEqual([]);
  });
}
