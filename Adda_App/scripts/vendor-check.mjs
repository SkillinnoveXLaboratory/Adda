#!/usr/bin/env node
/**
 * Vendor marketplace checks against a LOCAL backend (never production / Atlas). Vendors use the member app again:
 * app sign-up / sign-in (Member / Vendor switch), society isolation, KYC (validation, encryption at rest, masking,
 * reveal + audit, review), shop (name, logo, location), vendor-only listings, per-vendor pricing (commission added on
 * top, member discount = share of it — exact numbers from skills/vendor-marketplace), "Apply discount" / NO_DISCOUNT,
 * members never see vendor price or rates, bookings + cash "mark as paid" settlement, earnings (vendor + platform),
 * near-me search (distances, radius, order, validation), boosted ads, categories. Coupons and the platform-wide
 * commission setting are gone and must stay gone.
 *
 *   cd Backend && node server.js dev:db
 *   cd Backend && MONGODB_URI=mongodb://127.0.0.1:27027/?replicaSet=rs0 PORT=3013 RESIDENT_PASSWORD_LOGIN=true \
 *     LOGIN_RATE_LIMIT=2000 KYC_ENCRYPTION_KEY=<64 hex> node server.js
 *   cd Adda_App && npm run vendor-check        (= node scripts/vendor-check.mjs http://localhost:3013)
 */
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';

const [BASE = 'http://localhost:3013', SA_EMAIL = 'admin@addaapp.local', SA_PASSWORD = 'DevAdmin12345'] = process.argv.slice(2);
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(BASE)) {
  console.error('Refusing to run: vendor-check only targets a local backend.');
  process.exit(2);
}
const API = `${BASE.replace(/\/$/, '')}/api/v1`;
const RUN = Date.now().toString(36).slice(-5);
let passed = 0;
const failed = [];

function check(name, ok, detail) {
  if (ok) passed++;
  else failed.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, body: json };
}

// 1×1 PNG; the server sniffs magic bytes, so this is a real image upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function upload(token, purpose) {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', new Blob([PNG], { type: 'image/png' }), `${purpose}.png`);
  const res = await fetch(`${API}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Verhoeff check digit, to build valid test Aadhaar numbers.
const D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
const withVerhoeff = (base11) => base11 + INV[base11.split('').reverse().reduce((c, d, i) => D[c][P[(i + 1) % 8][Number(d)]], 0)];
const AADHAAR = withVerhoeff(`2${String(Date.now()).slice(-10)}`);
const AADHAAR_BAD = `${AADHAAR.slice(0, 11)}${(Number(AADHAAR[11]) + 1) % 10}`;
const PAN = `ABCDE${String(Date.now()).slice(-4)}F`;
const ACCOUNT = `5001${String(Date.now()).slice(-8)}`;

const PHONES = {};
const STAMP = Date.now();
const phoneFor = (n) => (PHONES[n] ??= `9${String(STAMP + n * 7919).slice(-9)}`);
// Members and vendors both sign up in the app (/auth/resident/register with accountType).
async function register(n, name, accountType, extra = {}) {
  return call('POST', '/auth/resident/register', { body: { phone: phoneFor(n), name, password: 'VendorCheck12345', accountType, ...extra } });
}

/** True when any number anywhere in the object equals n (to prove a value never reaches a member). */
const hasNumber = (obj, n) => JSON.stringify(obj ?? {}, (_k, v) => v).match(/[:\[,](-?\d+(\.\d+)?)/g)?.some((m) => Number(m.slice(1)) === n) || false;

// Near me: a per-run area so earlier runs never sit inside the test radius.
const LAT0 = 12 + (STAMP % 600) / 100;
const LNG0 = 75 + (Math.floor(STAMP / 600) % 700) / 100;
const A = { lat: Number(LAT0.toFixed(6)), lng: Number(LNG0.toFixed(6)) }; // shop A
const B = { lat: Number((LAT0 + 0.09).toFixed(6)), lng: Number(LNG0.toFixed(6)) }; // shop B, ~10 km north
const ME = { lat: Number((LAT0 + 0.009).toFixed(6)), lng: Number(LNG0.toFixed(6)) }; // the member, ~1 km from A
function haversine(p, q) {
  const r = Math.PI / 180;
  const a = Math.sin(((q.lat - p.lat) * r) / 2) ** 2 + Math.cos(p.lat * r) * Math.cos(q.lat * r) * Math.sin(((q.lng - p.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const inDays = (d) => new Date(Date.now() + 330 * 60_000 + d * 86_400_000).toISOString().slice(0, 10);
const CITY = `Vcity${RUN}`;

// ---------------------------------------------------------------- accounts
const owner = await call('POST', '/auth/admin/login', { body: { email: SA_EMAIL, password: SA_PASSWORD } });
if (owner.status !== 200) {
  console.error(`Owner sign-in failed (${owner.status}). Create it: node server.js create-super-admin --email ${SA_EMAIL}`);
  process.exit(2);
}
const T = owner.body.accessToken;

const vReg = await register(1, `Vendor ${RUN}`, 'vendor');
check('register vendor → 201', vReg.status === 201, vReg.status);
check('vendor profile says accountType vendor, KYC not submitted', vReg.body?.user?.accountType === 'vendor' && vReg.body?.vendor?.kycStatus === 'not_submitted');
const V = vReg.body.accessToken;
const vId = vReg.body.user._id;

const mReg = await register(2, `Member ${RUN}`, undefined);
check('register without type → member', mReg.status === 201 && mReg.body?.user?.accountType === 'member' && mReg.body?.vendor === null);
const M = mReg.body.accessToken;
await call('PATCH', '/me', { token: M, body: { city: CITY } });

const v2Reg = await register(3, `Vendor two ${RUN}`, 'vendor');
const V2 = v2Reg.body.accessToken;
check('bad accountType rejected', (await register(4, 'Bad type', 'admin')).status === 400);

// ---------------------------------------------------------------- vendors in the member app
const code = (r) => r.body?.error?.code;
const appLogin = await call('POST', '/auth/resident/login', { body: { phone: phoneFor(1), password: 'VendorCheck12345' } });
check('vendor signs in to the app → 200 + vendor profile', appLogin.status === 200 && appLogin.body?.user?.accountType === 'vendor' && appLogin.body?.vendor?.kycStatus === 'not_submitted' && !!appLogin.body?.accessToken, `${appLogin.status} ${code(appLogin)}`);
check('app session works for /vendor/*', (await call('GET', '/vendor/profile', { token: appLogin.body?.accessToken })).status === 200);
const asVendor = await call('POST', '/auth/resident/login', { body: { phone: phoneFor(1), password: 'VendorCheck12345', accountType: 'vendor' } });
check('Vendor switch at sign-in → 200', asVendor.status === 200 && asVendor.body?.user?.accountType === 'vendor', asVendor.status);
const vAsMember = await call('POST', '/auth/resident/login', { body: { phone: phoneFor(1), password: 'VendorCheck12345', accountType: 'member' } });
check('vendor choosing "Member" at sign-in → 403 ACCOUNT_TYPE_MISMATCH (no session)', vAsMember.status === 403 && code(vAsMember) === 'ACCOUNT_TYPE_MISMATCH' && !vAsMember.body?.accessToken, `${vAsMember.status} ${code(vAsMember)}`);
const mAsVendor = await call('POST', '/auth/resident/login', { body: { phone: phoneFor(2), password: 'VendorCheck12345', accountType: 'vendor' } });
check('member choosing "Vendor" at sign-in → 403 ACCOUNT_TYPE_MISMATCH', mAsVendor.status === 403 && code(mAsVendor) === 'ACCOUNT_TYPE_MISMATCH', `${mAsVendor.status} ${code(mAsVendor)}`);
const vWrong = await call('POST', '/auth/resident/login', { body: { phone: phoneFor(1), password: 'WrongPass12345' } });
check('vendor wrong password → 401', vWrong.status === 401 && code(vWrong) === 'INVALID_CREDENTIALS', vWrong.status);
const vDup = await register(2, 'Dup', 'vendor');
check('vendor sign-up with a used mobile → 409 ACCOUNT_EXISTS', vDup.status === 409 && code(vDup) === 'ACCOUNT_EXISTS', vDup.status);
const vWeak = await call('POST', '/auth/resident/register', { body: { phone: phoneFor(42), name: 'Weak', password: 'onlyletterslong', accountType: 'vendor' } });
check('vendor weak password → 400', vWeak.status === 400, vWeak.status);
const SHOP_LOC = { ...A, label: `Shop A, Test Road ${RUN}` };
const vShopReg = await register(43, 'Owner Name', 'vendor', { shopName: `Signup Shop ${RUN}`, location: SHOP_LOC });
check('vendor sign-up with shop name + location → 201', vShopReg.status === 201 && vShopReg.body?.vendor?.shopName === `Signup Shop ${RUN}` && vShopReg.body.vendor.businessName === `Signup Shop ${RUN}`, JSON.stringify(vShopReg.body?.vendor || vShopReg.body));
const vShopProf = await call('GET', '/vendor/profile', { token: vShopReg.body?.accessToken });
check('…and the profile returns the shop location', vShopProf.body?.shop?.location?.lat === A.lat && vShopProf.body.shop.location.lng === A.lng && vShopProf.body.shop.location.label === SHOP_LOC.label, JSON.stringify(vShopProf.body?.shop));
check('sign-up with latitude 95 → 400', (await register(44, 'Bad loc', 'vendor', { location: { lat: 95, lng: 80 } })).status === 400);
check('sign-up with a location missing lng → 400', (await register(45, 'Bad loc', 'vendor', { location: { lat: 20 } })).status === 400);
check('member sign-up with a shop name → 400', (await register(46, 'Member shop', 'member', { shopName: 'Nope Shop' })).status === 400);
const cfg = await call('GET', '/public/config');
check('public config: no Vendor Panel link, no global commission', cfg.status === 200 && !('vendorPanelUrl' in (cfg.body || {})) && !('services' in (cfg.body || {})), Object.keys(cfg.body || {}));
check('old Vendor Panel sign-in routes are gone → 404', (await call('POST', '/auth/vendor/login', { body: { phone: phoneFor(1), password: 'VendorCheck12345' } })).status === 404);


// ---------------------------------------------------------------- isolation
const join = await call('POST', '/memberships', { token: V, body: { societyId: '6ae98945f9a34a6f782806af', buildingId: '6ae98945f9a34a6f782806af', flatNumber: 'A-1', residentType: 'owner' } });
check('vendor cannot join a society → 403 VENDOR_NO_SOCIETY', join.status === 403 && join.body?.error?.code === 'VENDOR_NO_SOCIETY', `${join.status} ${join.body?.error?.code}`);
const vHome = await call('GET', '/resident/home', { token: V });
check('vendor has no resident/society access → 403', vHome.status === 403 && vHome.body?.error?.code === 'VENDOR_NO_SOCIETY', `${vHome.status} ${vHome.body?.error?.code}`);
const mVendorApi = await call('GET', '/vendor/dashboard', { token: M });
check('member cannot use vendor API → 403 VENDOR_ONLY', mVendorApi.status === 403 && mVendorApi.body?.error?.code === 'VENDOR_ONLY');
check('anonymous vendor API → 401', (await call('GET', '/vendor/profile')).status === 401);

const propBody = { listingType: 'rent', propertyType: 'apartment', title: `2BHK near park ${RUN}`, pricePaise: 2500000, city: CITY, contactPhone: phoneFor(1) };
const mProp = await call('POST', '/properties', { token: M, body: propBody });
check('member cannot list a property → 403 VENDOR_ONLY', mProp.status === 403 && mProp.body?.error?.code === 'VENDOR_ONLY', `${mProp.status}`);
const cats = await call('GET', '/service-offers/categories', { token: M });
const catId = cats.body?.items?.[0]?._id;
check('service categories available', !!catId);
const offerBody = { categoryId: catId, title: `AC Service & Repair ${RUN}`, priceType: 'starting_from', pricePaise: 49900, city: CITY, contactPhone: phoneFor(1) };
const mOffer = await call('POST', '/service-offers', { token: M, body: offerBody });
check('member cannot list a service → 403 VENDOR_ONLY', mOffer.status === 403 && mOffer.body?.error?.code === 'VENDOR_ONLY', `${mOffer.status}`);
check('member cannot upload property photos → 403', (await upload(M, 'property')).status === 403);
check('member cannot upload KYC files → 403', (await upload(M, 'kyc')).status === 403);

const vPropEarly = await call('POST', '/properties', { token: V, body: propBody });
check('vendor without KYC cannot list → 403 KYC_REQUIRED', vPropEarly.status === 403 && vPropEarly.body?.error?.code === 'KYC_REQUIRED');

// ---------------------------------------------------------------- KYC
const prof0 = await call('GET', '/vendor/profile', { token: V });
check('vendor profile: KYC available on this server', prof0.status === 200 && prof0.body?.kycAvailable === true, JSON.stringify(prof0.body?.kycAvailable));
const docs = [];
for (let i = 0; i < 3; i++) docs.push((await upload(V, 'kyc')).body?._id);
check('vendor uploads 3 KYC photos', docs.every(Boolean));
const kycUrlUnsigned = await fetch(`${BASE.replace(/\/$/, '')}/media/${docs[0]}`);
check('KYC photo is private (no signature → 403)', kycUrlUnsigned.status === 403, kycUrlUnsigned.status);

const kyc = { businessName: `Sharma Cooling ${RUN}`, businessType: 'business', city: CITY, address: '12 Market Road', pan: PAN.toLowerCase(), aadhaar: `${AADHAAR.slice(0, 4)} ${AADHAAR.slice(4, 8)} ${AADHAAR.slice(8)}`, bankAccountHolder: 'Ravi Sharma', bankAccountNumber: ACCOUNT, bankIfsc: 'sbin0001234', bankName: 'SBI', panPhoto: docs[0], aadhaarFront: docs[1], aadhaarBack: docs[2], consent: true };
const bad = async (patch, name) => {
  const r = await call('PUT', '/vendor/kyc', { token: V, body: { ...kyc, ...patch } });
  check(`KYC rejects ${name} → 400`, r.status === 400, `${r.status} ${r.body?.error?.message || ''}`);
};
await bad({ pan: 'ABC123' }, 'invalid PAN');
await bad({ aadhaar: AADHAAR_BAD }, 'Aadhaar with wrong checksum');
await bad({ aadhaar: '123456789012' }, 'Aadhaar starting with 1');
await bad({ bankIfsc: 'SBIN1234567' }, 'invalid IFSC');
await bad({ bankAccountNumber: '12ab' }, 'invalid account number');
await bad({ consent: false }, 'missing consent');
await bad({ aadhaarFront: docs[0] }, 'same photo reused');
await bad({ extra: 'x' }, 'unknown field');
const v2Doc = (await upload(V2, 'kyc')).body?._id;
await bad({ panPhoto: v2Doc }, "another vendor's photo");

const sub = await call('PUT', '/vendor/kyc', { token: V, body: kyc });
check('KYC submitted → pending', sub.status === 200 && sub.body?.kycStatus === 'pending', `${sub.status} ${sub.body?.error?.message || ''}`);
const subTxt = JSON.stringify(sub.body || {});
check('KYC response is masked (no full PAN / Aadhaar / account)', !subTxt.includes(PAN) && !subTxt.includes(AADHAAR) && !subTxt.includes(ACCOUNT) && sub.body?.aadhaar === `XXXX XXXX ${AADHAAR.slice(-4)}`);
check('KYC normalised: PAN upper-case last 4, IFSC upper-case', sub.body?.pan?.endsWith(PAN.slice(-4)) && sub.body?.bankIfsc === 'SBIN0001234');
check('KYC documents come back as signed links', Object.values(sub.body?.documents || {}).every((d) => d?.url?.includes('sig=')));

// Encryption at rest: read the raw document from the local test database.
try {
  const require = createRequire(new URL('../../Backend/package.json', import.meta.url));
  const mongoose = require('mongoose');
  const conn = await mongoose.createConnection(process.env.CHECK_MONGODB_URI || 'mongodb://127.0.0.1:27027/addaapp?replicaSet=rs0').asPromise();
  const raw = await conn.db.collection('vendorprofiles').findOne({ user: new mongoose.Types.ObjectId(vId) });
  const rawTxt = JSON.stringify(raw || {});
  check('KYC numbers are encrypted at rest', !!raw?.panEnc?.startsWith('v1.') && !rawTxt.includes(PAN) && !rawTxt.includes(AADHAAR) && !rawTxt.includes(ACCOUNT), raw ? '' : 'profile not found in DB');
  await conn.close();
} catch (err) {
  check('KYC numbers are encrypted at rest', false, `could not read DB: ${err.message}`);
}

check('vendor still cannot list while KYC pending → 403 KYC_REQUIRED', (await call('POST', '/properties', { token: V, body: propBody })).body?.error?.code === 'KYC_REQUIRED');

// Platform review
const vendors = await call('GET', '/platform/vendors?kycStatus=pending&limit=100', { token: T });
check('owner lists pending vendors', vendors.status === 200 && vendors.body.items.some((x) => x._id === vId));
check('vendor list masks phones', vendors.body.items.every((x) => !x.phone || x.phone.includes('•')));
const vDetail = await call('GET', `/platform/vendors/${vId}`, { token: T });
check('owner sees vendor detail with masked KYC and document links', vDetail.status === 200 && vDetail.body?.profile?.aadhaar?.startsWith('XXXX') && !!vDetail.body?.profile?.documents?.panPhoto?.url);
const doc = await fetch(vDetail.body.profile.documents.panPhoto.url.replace(/^https?:\/\/[^/]+/, BASE.replace(/\/$/, '')));
check('signed KYC document link opens', doc.status === 200, doc.status);
check('reveal needs a reason → 400', (await call('POST', `/platform/vendors/${vId}/reveal`, { token: T, body: {} })).status === 400);
const reveal = await call('POST', `/platform/vendors/${vId}/reveal`, { token: T, body: { reason: 'Verify PAN against document' } });
check('reveal returns decrypted numbers', reveal.status === 200 && reveal.body?.pan === PAN && reveal.body?.aadhaar === AADHAAR && reveal.body?.bankAccountNumber === ACCOUNT);
const auditLog = await call('GET', '/platform/audit-logs?limit=10', { token: T });
check('reveal is written to the audit log', (auditLog.body?.items || []).some((a) => a.action === 'privacy.kyc_reveal' && a.targetId === vId));
check('reject without a note → 400', (await call('POST', `/platform/vendors/${vId}/kyc`, { token: T, body: { decision: 'rejected' } })).status === 400);
check('member token cannot use platform vendors → 403', (await call('GET', '/platform/vendors', { token: M })).status === 403);
const approve = await call('POST', `/platform/vendors/${vId}/kyc`, { token: T, body: { decision: 'approved' } });
check('owner approves KYC', approve.status === 200 && approve.body?.kycStatus === 'approved');
check('approving twice → 409', (await call('POST', `/platform/vendors/${vId}/kyc`, { token: T, body: { decision: 'approved' } })).status === 409);
check('approved KYC cannot be resubmitted → 409', (await call('PUT', '/vendor/kyc', { token: V, body: kyc })).status === 409);


// ---------------------------------------------------------------- shop: name, logo, location
const SHOP_NAME = `Sharma Cooling Shop ${RUN}`;
const logoUp = await upload(V, 'vendor_logo');
check('vendor uploads a shop logo → 201 public URL', logoUp.status === 201 && !!logoUp.body?.url && !logoUp.body.url.includes('sig='), JSON.stringify(logoUp.body));
check('member cannot upload a shop logo → 403', (await upload(M, 'vendor_logo')).status === 403);
const shopSet = await call('PUT', '/vendor/shop', { token: V, body: { shopName: SHOP_NAME, logoId: logoUp.body?._id, location: SHOP_LOC } });
check('vendor saves shop name + logo + location', shopSet.status === 200 && shopSet.body?.shop?.name === SHOP_NAME && !!shopSet.body.shop.logo?.url && shopSet.body.shop.location?.lat === A.lat && shopSet.body.shop.location.lng === A.lng, JSON.stringify(shopSet.body?.shop || shopSet.body));
const logoOpen = await fetch(shopSet.body?.shop?.logo?.url?.replace(/^https?:\/\/[^/]+/, BASE.replace(/\/$/, '')) || BASE);
check('shop logo opens without a signature (public)', logoOpen.status === 200, logoOpen.status);
check('GET /vendor/profile returns the shop', (await call('GET', '/vendor/profile', { token: V })).body?.shop?.name === SHOP_NAME);
check('shop name too short → 400', (await call('PUT', '/vendor/shop', { token: V, body: { shopName: 'A' } })).status === 400);
check('shop latitude 91 → 400', (await call('PUT', '/vendor/shop', { token: V, body: { location: { lat: 91, lng: 80 } } })).status === 400);
check('shop longitude 181 → 400', (await call('PUT', '/vendor/shop', { token: V, body: { location: { lat: 20, lng: 181 } } })).status === 400);
check('empty shop update → 400', (await call('PUT', '/vendor/shop', { token: V, body: {} })).status === 400);
const otherLogo = (await upload(V2, 'vendor_logo')).body?._id;
check("another vendor's logo id → 400", (await call('PUT', '/vendor/shop', { token: V, body: { logoId: otherLogo } })).status === 400);
check('member cannot change a shop → 403', (await call('PUT', '/vendor/shop', { token: M, body: { shopName: 'Hack Shop' } })).status === 403);
const vDash0 = await call('GET', '/vendor/dashboard', { token: V });
check('vendor dashboard shows the shop name', vDash0.body?.shopName === SHOP_NAME);
// ---------------------------------------------------------------- listings
const photo = (await upload(V, 'property')).body?._id;
const prop = await call('POST', '/properties', { token: V, body: { ...propBody, photos: [photo] } });
check('KYC-approved vendor lists a property', prop.status === 201, `${prop.status} ${prop.body?.error?.message || ''}`);
check('vendor property has no society', prop.body && !prop.body.society);
const offer = await call('POST', '/service-offers', { token: V, body: offerBody });
check('KYC-approved vendor lists a service', offer.status === 201, `${offer.status} ${offer.body?.error?.message || ''}`);
check('old society-visibility field is rejected', (await call('POST', '/service-offers', { token: V, body: { ...offerBody, visibility: 'society' } })).status === 400);
const propId = prop.body?._id;
const offerId = offer.body?._id;
if (prop.body?.moderationStatus === 'pending') await call('POST', `/platform/listings/property/${propId}/moderate`, { token: T, body: { decision: 'approved' } });
if (offer.body?.moderationStatus === 'pending') await call('POST', `/platform/listings/service/${offerId}/moderate`, { token: T, body: { decision: 'approved' } });
const browse = await call('GET', `/properties?city=${CITY}`, { token: M });
check('member browses the approved property', browse.status === 200 && browse.body.items.some((l) => l._id === propId));

// ---------------------------------------------------------------- bookings
const bk = (body, token = M, id = offerId) => call('POST', `/service-offers/${id}/bookings`, { token, body });
const bookBody = { preferredDate: inDays(2), preferredTime: '10:30', address: 'Flat 12, Green Valley, Pune', note: 'AC not cooling' };
check('booking in the past → 400', (await bk({ ...bookBody, preferredDate: '2020-01-01' })).status === 400);
check('booking > 90 days ahead → 400', (await bk({ ...bookBody, preferredDate: inDays(120) })).status === 400);
check('booking without address → 400', (await bk({ ...bookBody, address: '' })).status === 400);
check('vendor cannot book → 403 MEMBER_ONLY', (await bk(bookBody, V2)).body?.error?.code === 'MEMBER_ONLY');
const b1 = await bk(bookBody);
check('member books a service → 201 requested', b1.status === 201 && b1.body?.status === 'requested', `${b1.status} ${b1.body?.error?.message || ''}`);
check('customer sees vendor contact, not their own', !!b1.body?.vendor?.phone && b1.body?.customer === undefined);
check('second open booking for same service → 409', (await bk(bookBody)).status === 409);
const bId = b1.body?._id;

const vList = await call('GET', '/vendor/bookings?status=open', { token: V });
const vRow = vList.body?.items?.find((x) => x._id === bId);
check('vendor sees the booking with customer contact', !!vRow && vRow.customer?.phone === phoneFor(2) && vRow.address === bookBody.address);
check('vendor actions on a new booking: accept / decline / cancel', JSON.stringify(vRow?.actions) === JSON.stringify(['accept', 'decline', 'cancel']), JSON.stringify(vRow?.actions));
check('another vendor cannot see it → 404', (await call('GET', `/vendor/bookings/${bId}`, { token: V2 })).status === 404);
check('another vendor cannot accept it → 404', (await call('POST', `/vendor/bookings/${bId}/accept`, { token: V2, body: {} })).status === 404);
check('unknown action → 404', (await call('POST', `/vendor/bookings/${bId}/approve`, { token: V, body: {} })).status === 404);
check('mark paid before job is done → 409', (await call('POST', `/vendor/bookings/${bId}/mark-paid`, { token: V, body: { amountPaise: 49900 } })).status === 409);
check('complete before accept → 409', (await call('POST', `/vendor/bookings/${bId}/complete`, { token: V, body: {} })).status === 409);
check('vendor accepts', (await call('POST', `/vendor/bookings/${bId}/accept`, { token: V, body: { note: 'Will come at 10:30' } })).body?.status === 'accepted');
check('vendor completes', (await call('POST', `/vendor/bookings/${bId}/complete`, { token: V, body: {} })).body?.status === 'completed');
check('customer cannot cancel a completed booking → 409', (await call('POST', `/service-bookings/${bId}/cancel`, { token: M, body: {} })).status === 409);
check('mark paid with 0 → 400', (await call('POST', `/vendor/bookings/${bId}/mark-paid`, { token: V, body: { amountPaise: 0 } })).status === 400);
check('mark paid with fractional paise → 400', (await call('POST', `/vendor/bookings/${bId}/mark-paid`, { token: V, body: { amountPaise: 499.5 } })).status === 400);
const paid = await call('POST', `/vendor/bookings/${bId}/mark-paid`, { token: V, body: { amountPaise: 59900, note: 'Gas top-up included' } });
check('vendor marks cash payment', paid.status === 200 && paid.body?.payment?.status === 'paid' && paid.body?.payment?.method === 'cash' && paid.body?.payment?.amountPaise === 59900);
check('mark paid twice → 409 ALREADY_PAID', (await call('POST', `/vendor/bookings/${bId}/mark-paid`, { token: V, body: { amountPaise: 1 } })).body?.error?.code === 'ALREADY_PAID');
const mine = await call('GET', '/service-bookings', { token: M });
const myRow = mine.body?.items?.find((x) => x._id === bId);
check('customer sees completed + paid booking', myRow?.status === 'completed' && myRow?.payment?.status === 'paid');
check('customer timeline shows each step', ['requested', 'accepted', 'completed', 'paid'].every((s) => myRow?.timeline?.some((t) => t.status === s)));
const dash = await call('GET', '/vendor/dashboard', { token: V });
check('vendor dashboard counts cash collected', dash.status === 200 && dash.body?.cashCollectedPaise === 59900 && dash.body?.bookings?.completed === 1);

const b2 = await bk({ ...bookBody, preferredDate: today });
check('booking for today is allowed', b2.status === 201, b2.status);
check('vendor declines', (await call('POST', `/vendor/bookings/${b2.body?._id}/decline`, { token: V, body: { note: 'Fully booked today' } })).body?.status === 'declined');
const b3 = await bk(bookBody);
check('customer cancels a requested booking', (await call('POST', `/service-bookings/${b3.body?._id}/cancel`, { token: M, body: {} })).body?.status === 'cancelled');
check('other member cannot cancel my booking → 404', (await call('POST', `/service-bookings/${b1.body?._id}/cancel`, { token: (await register(5, `Other ${RUN}`)).body.accessToken, body: {} })).status === 404);

// ---------------------------------------------------------------- ads
const ad = (body, token = V) => call('POST', '/vendor/ads', { token, body });
check('member cannot create ads → 403', (await ad({ kind: 'property', listingId: propId, city: CITY, days: 7 }, M)).status === 403);
check('unverified vendor cannot create ads → 403 KYC_REQUIRED', (await ad({ kind: 'property', listingId: propId, city: CITY, days: 7 }, V2)).body?.error?.code === 'KYC_REQUIRED');
check('ad days must be 1–30 → 400', (await ad({ kind: 'property', listingId: propId, city: CITY, days: 45 })).status === 400);
check('ad needs a location → 400', (await ad({ kind: 'property', listingId: propId, city: '', days: 7 })).status === 400);
const prop2 = await call('POST', '/properties', { token: V, body: { ...propBody, title: `Pending flat ${RUN}` } });
if (prop2.body?.moderationStatus === 'pending') {
  check('cannot boost a listing still under review → 400', (await ad({ kind: 'property', listingId: prop2.body._id, city: CITY, days: 7 })).body?.error?.code === 'LISTING_NOT_LIVE');
}
const ad1 = await ad({ kind: 'property', listingId: propId, city: CITY, area: 'Baner', days: 7 });
check('vendor submits a property boost → pending', ad1.status === 201 && ad1.body?.status === 'pending', `${ad1.status} ${ad1.body?.error?.message || ''}`);
check('second boost for the same listing → 409', (await ad({ kind: 'property', listingId: propId, city: CITY, days: 3 })).status === 409);
const pendingAds = await call('GET', '/platform/ads?status=pending', { token: T });
check('owner sees the pending ad', pendingAds.status === 200 && pendingAds.body.items.some((a) => a._id === ad1.body._id));
const adDetail = await call('GET', `/platform/ads/${ad1.body._id}`, { token: T });
check('owner sees full ad: listing + vendor KYC status', adDetail.status === 200 && adDetail.body?.listingDetail?.title === propBody.title && adDetail.body?.vendor?.kycStatus === 'approved');
check('reject without a note → 400', (await call('POST', `/platform/ads/${ad1.body._id}/review`, { token: T, body: { decision: 'rejected' } })).status === 400);

// Organic listing from another vendor so the sponsored order is observable.
const V3reg = await register(6, `Vendor three ${RUN}`, 'vendor');
const V3 = V3reg.body.accessToken;
const d3 = [];
for (let i = 0; i < 3; i++) d3.push((await upload(V3, 'kyc')).body?._id);
await call('PUT', '/vendor/kyc', { token: V3, body: { ...kyc, aadhaar: withVerhoeff(`3${String(Date.now()).slice(-10)}`), panPhoto: d3[0], aadhaarFront: d3[1], aadhaarBack: d3[2] } });
await call('POST', `/platform/vendors/${V3reg.body.user._id}/kyc`, { token: T, body: { decision: 'approved' } });
check("verified vendor cannot boost another vendor's listing → 404", (await ad({ kind: 'property', listingId: propId, city: CITY, days: 7 }, V3)).status === 404);
const newer = await call('POST', '/properties', { token: V3, body: { ...propBody, title: `Newest flat ${RUN}` } });
if (newer.body?.moderationStatus === 'pending') await call('POST', `/platform/listings/property/${newer.body._id}/moderate`, { token: T, body: { decision: 'approved' } });
const before = await call('GET', `/properties?city=${CITY}`, { token: M });
check('before approval: newest listing first, nothing sponsored', before.body.items[0]?._id === newer.body?._id && !before.body.items.some((l) => l.sponsored));

const approveAd = await call('POST', `/platform/ads/${ad1.body._id}/review`, { token: T, body: { decision: 'approved' } });
check('owner approves the ad → active with 7-day window', approveAd.status === 200 && approveAd.body?.status === 'active' && Math.round((new Date(approveAd.body.endsAt) - new Date(approveAd.body.startsAt)) / 86_400_000) === 7);
const after = await call('GET', `/properties?city=${CITY}`, { token: M });
check('sponsored property is first and marked sponsored', after.body.items[0]?._id === propId && after.body.items[0]?.sponsored === true && after.body.sponsoredCount === 1);
check('sponsored property is not repeated below', after.body.items.filter((l) => l._id === propId).length === 1);
check('member with that city sees it without filtering', (await call('GET', '/properties', { token: M })).body.items[0]?._id === propId);
const elsewhere = await call('GET', `/properties?city=Elsewhere${RUN}`, { token: M });
check('ad does not show in another city', !elsewhere.body.items.some((l) => l.sponsored));
check('page 2 has no sponsored rows', !(await call('GET', `/properties?city=${CITY}&page=2&limit=1`, { token: M })).body.items.some((l) => l.sponsored));
const rentOnly = await call('GET', `/properties?city=${CITY}&listingType=sale`, { token: M });
check('sponsored respects the category filter (sale ≠ rent)', !rentOnly.body.items.some((l) => l._id === propId));
check('approving again → 409', (await call('POST', `/platform/ads/${ad1.body._id}/review`, { token: T, body: { decision: 'approved' } })).status === 409);
const vAds = await call('GET', '/vendor/ads', { token: V });
check('vendor sees the ad as active', vAds.body?.items?.find((a) => a._id === ad1.body._id)?.status === 'active');

const adS = await ad({ kind: 'service', listingId: offerId, city: CITY, days: 3 });
const rejS = await call('POST', `/platform/ads/${adS.body?._id}/review`, { token: T, body: { decision: 'rejected', note: 'Photo missing' } });
check('owner rejects a service ad with a note', rejS.status === 200 && rejS.body?.status === 'rejected');
check('rejected ad is not sponsored', !(await call('GET', `/service-offers?city=${CITY}`, { token: M })).body.items.some((l) => l.sponsored));
const adS2 = await ad({ kind: 'service', listingId: offerId, city: CITY, days: 3 });
check('vendor can boost again after a rejection', adS2.status === 201);
await call('POST', `/platform/ads/${adS2.body?._id}/review`, { token: T, body: { decision: 'approved' } });
const svc = await call('GET', `/service-offers?city=${CITY}`, { token: M });
check('sponsored service is first in services', svc.body.items[0]?._id === offerId && svc.body.items[0]?.sponsored === true);

const stop = await call('POST', `/vendor/ads/${ad1.body._id}/cancel`, { token: V });
check('vendor stops a running ad', stop.status === 200 && stop.body?.status === 'cancelled');
check('stopped ad is no longer sponsored', !(await call('GET', `/properties?city=${CITY}`, { token: M })).body.items.some((l) => l.sponsored));
check('owner overview counts vendors / pending KYC / pending ads', typeof (await call('GET', '/platform/overview', { token: T })).body?.counts?.pendingKyc === 'number');

// ---------------------------------------------------------------- admin-managed service categories
const catName = `Solar Cleaning ${RUN}`;
check('service category with an unknown icon → 400', (await call('POST', '/platform/categories', { token: T, body: { kind: 'service', name: catName, icon: 'rocket-ship' } })).status === 400);
const newCat = await call('POST', '/platform/categories', { token: T, body: { kind: 'service', name: catName, icon: 'solar', sortOrder: 0 } });
check('owner adds a service category with a NIVASA icon', newCat.status === 201 && newCat.body?.icon === 'solar', `${newCat.status} ${newCat.body?.error?.message || ''}`);
const appCats = await call('GET', '/service-offers/categories', { token: M });
const seenCat = appCats.body?.items?.find((c) => c._id === newCat.body?._id);
check('app receives the new category with its icon', seenCat?.icon === 'solar' && seenCat?.name === catName);
check('app categories come in admin order (sortOrder)', appCats.body?.items?.every((c, i, a) => i === 0 || (a[i - 1].sortOrder ?? 0) <= (c.sortOrder ?? 0)));
check('changing to an unknown icon → 400', (await call('PATCH', `/platform/categories/${newCat.body?._id}`, { token: T, body: { icon: 'nope' } })).status === 400);
check('owner changes icon + order', (await call('PATCH', `/platform/categories/${newCat.body?._id}`, { token: T, body: { icon: 'cleaning', sortOrder: 99 } })).body?.icon === 'cleaning');
check('complaint categories keep free icon text', (await call('POST', '/platform/categories', { token: T, body: { kind: 'complaint', name: `Noise ${RUN}`, icon: 'volume-high' } })).status === 201);
check('member cannot delete categories → 403', (await call('DELETE', `/platform/categories/${newCat.body?._id}`, { token: M })).status === 403);
const usedDel = await call('DELETE', `/platform/categories/${catId}`, { token: T });
check('category used by a listing cannot be deleted → 409 CATEGORY_IN_USE', usedDel.status === 409 && usedDel.body?.error?.code === 'CATEGORY_IN_USE', `${usedDel.status} ${usedDel.body?.error?.code}`);
check('owner deletes an unused category', (await call('DELETE', `/platform/categories/${newCat.body?._id}`, { token: T })).status === 200);
check('deleted category is gone from the app', !(await call('GET', '/service-offers/categories', { token: M })).body?.items?.some((c) => c._id === newCat.body?._id));
check('deleting twice → 404', (await call('DELETE', `/platform/categories/${newCat.body?._id}`, { token: T })).status === 404);

// ---------------------------------------------------------------- boost durations (admin setting)
const cfg0 = await call('GET', '/public/config');
check('public config lists boost day options', Array.isArray(cfg0.body?.ads?.dayOptions) && cfg0.body.ads.dayOptions.length > 0, JSON.stringify(cfg0.body?.ads));
check('invalid day options rejected → 400', (await call('PUT', '/platform/settings/ads.dayOptions', { token: T, body: { value: '3,45' } })).status === 400);
check('duplicate day options rejected → 400', (await call('PUT', '/platform/settings/ads.dayOptions', { token: T, body: { value: '5,5' } })).status === 400);
check('owner sets day options (normalised)', (await call('PUT', '/platform/settings/ads.dayOptions', { token: T, body: { value: ' 10, 5 ' } })).body?.value === '5,10');
check('app sees the new options', JSON.stringify((await call('GET', '/public/config')).body?.ads?.dayOptions) === '[5,10]');
const offerAd = await ad({ kind: 'service', listingId: offerId, city: CITY, days: 7 });
check('ad with a duration not offered → 400', offerAd.status === 400, `${offerAd.status} ${offerAd.body?.error?.message || ''}`);
await call('PUT', '/platform/settings/ads.dayOptions', { token: T, body: { value: '3,7,15,30' } });

// ---------------------------------------------------------------- removed features stay removed
check('coupon check route is gone → 404', (await call('POST', `/service-offers/${offerId}/coupon`, { token: M, body: { code: 'SAVE10' } })).status === 404);
check('platform coupons are gone → 404', (await call('GET', '/platform/coupons', { token: T })).status === 404);
check('platform-wide commission setting is gone → 400', (await call('PUT', '/platform/settings/services.commissionPercent', { token: T, body: { value: 10 } })).status === 400);
check('settings list has no commission key', !(await call('GET', '/platform/settings', { token: T })).body?.items?.some((i) => i.key === 'services.commissionPercent'));
check('public config has no commission and no Vendor Panel link', (() => { const c = cfg0.body || {}; return !('services' in c) && !('vendorPanelUrl' in c); })(), JSON.stringify(Object.keys(cfg0.body || {})));
check('booking with a couponCode → 400 (unknown field)', (await call('POST', `/service-offers/${offerId}/bookings`, { token: (await register(9, `Coupon try ${RUN}`)).body.accessToken, body: { ...bookBody, couponCode: 'SAVE10' } })).status === 400);

// ---------------------------------------------------------------- per-vendor pricing (Master Admin)
const PR = (id = vId) => `/platform/vendors/${id}/pricing`;
check('pricing: commission over 100 → 400', (await call('PATCH', PR(), { token: T, body: { commissionPercent: 101 } })).status === 400);
check('pricing: 3 decimals → 400', (await call('PATCH', PR(), { token: T, body: { commissionPercent: 12.345 } })).status === 400);
check('pricing: negative discount → 400', (await call('PATCH', PR(), { token: T, body: { memberDiscountPercent: -1 } })).status === 400);
check('pricing: empty body → 400', (await call('PATCH', PR(), { token: T, body: {} })).status === 400);
check('pricing: string percent → 400', (await call('PATCH', PR(), { token: T, body: { commissionPercent: '20' } })).status === 400);
check('pricing: member account is not a vendor → 404', (await call('PATCH', PR(mReg.body.user._id), { token: T, body: { commissionPercent: 20 } })).status === 404);
check('member cannot set pricing → 403', (await call('PATCH', PR(), { token: M, body: { commissionPercent: 20 } })).status === 403);
check('vendor cannot set own pricing → 403', (await call('PATCH', PR(), { token: V, body: { commissionPercent: 0 } })).status === 403);
const setP = await call('PATCH', PR(), { token: T, body: { commissionPercent: 20, memberDiscountPercent: 50 } });
check('owner sets 20% commission + 50% member discount', setP.status === 200 && setP.body?.pricing?.commissionPercent === 20 && setP.body.pricing.memberDiscountPercent === 50, JSON.stringify(setP.body));
check('only one field may be sent (discount stays)', (await call('PATCH', PR(), { token: T, body: { commissionPercent: 20 } })).body?.pricing?.memberDiscountPercent === 50);
const auditP = await call('GET', '/platform/audit-logs?action=vendor.pricing_updated&limit=5', { token: T });
check('pricing change is audited (vendor.pricing_updated)', (auditP.body?.items || []).some((a) => a.targetId === vId), JSON.stringify(auditP.body?.items?.[0]));
const vlist = await call('GET', `/platform/vendors?q=${encodeURIComponent(`Vendor ${RUN}`)}&limit=50`, { token: T });
check('vendor list shows the rates', vlist.body?.items?.find((x) => x._id === vId)?.pricing?.commissionPercent === 20, JSON.stringify(vlist.body?.items?.find((x) => x._id === vId)?.pricing));
check('vendor detail shows the rates', (await call('GET', `/platform/vendors/${vId}`, { token: T })).body?.pricing?.memberDiscountPercent === 50);
// Sub-admin without vendors.manage can't change pricing.
const helperEmail = `vc.helper.${RUN}@nivasa.local`;
const helper = await call('POST', '/platform/subadmins', { token: T, body: { name: 'Vendor check helper', email: helperEmail, password: 'Helper2026secure', permissions: ['vendors.view'] } });
const HT = (await call('POST', '/auth/admin/login', { body: { email: helperEmail, password: 'Helper2026secure' } })).body?.accessToken;
const hp = await call('PATCH', PR(), { token: HT, body: { commissionPercent: 1 } });
check('sub-admin with vendors.view only → 403 PERMISSION_DENIED on pricing', helper.status === 201 && hp.status === 403 && code(hp) === 'PERMISSION_DENIED', `${helper.status} ${hp.status} ${code(hp)}`);
check('…but can read the vendor with its rates', (await call('GET', `/platform/vendors/${vId}`, { token: HT })).body?.pricing?.commissionPercent === 20);
await call('POST', `/platform/subadmins/${helper.body?._id}/status`, { token: T, body: { status: 'disabled' } });

// ---------------------------------------------------------------- pricing math on services
const approveSvc = async (r) => {
  if (r.body?.moderationStatus === 'pending') await call('POST', `/platform/listings/service/${r.body._id}/moderate`, { token: T, body: { decision: 'approved' } });
  return r.body?._id;
};
const kId = await approveSvc(await call('POST', '/service-offers', { token: V, body: { ...offerBody, title: `Deep cleaning ${RUN}`, priceType: 'fixed', pricePaise: 100000 } }));
const VENDOR_ONLY_KEYS = ['vendorPricePaise', 'commissionBps', 'commissionPercent', 'commissionPaise', 'memberDiscountPercent', 'discountBps', 'netToPlatformPaise', 'vendorEarningsPaise'];
const leaks = (obj) => VENDOR_ONLY_KEYS.filter((k) => JSON.stringify(obj ?? {}).includes(`"${k}"`));
const mSvc = await call('GET', `/service-offers/${kId}`, { token: M });
check('₹1,000 at 20% → member price ₹1,200', mSvc.body?.pricePaise === 120000 && mSvc.body?.pricing?.memberPricePaise === 120000, JSON.stringify(mSvc.body?.pricing));
check('member sees the discount offer: ₹100 off → ₹1,100', mSvc.body?.pricing?.discountAvailable === true && mSvc.body.pricing.discountPaise === 10000 && mSvc.body.pricing.payableWithDiscountPaise === 110000);
check('member JSON has no vendor price or rates', leaks(mSvc.body).length === 0 && !hasNumber(mSvc.body, 100000), leaks(mSvc.body).join(','));
check('service shows the shop name + logo', mSvc.body?.shop?.name === SHOP_NAME && !!mSvc.body?.shop?.logoUrl, JSON.stringify(mSvc.body?.shop));
const mBrowse = await call('GET', `/service-offers?city=${CITY}&limit=50`, { token: M });
const mRow = mBrowse.body?.items?.find((x) => x._id === kId);
check('browse list: member price, shop, no vendor fields', mRow?.pricePaise === 120000 && mRow?.shop?.name === SHOP_NAME && leaks(mBrowse.body).length === 0, leaks(mBrowse.body).join(','));
const vSvc = await call('GET', `/service-offers/${kId}`, { token: V });
check('vendor sees own price ₹1,000, member price ₹1,200 and the rates', vSvc.body?.pricePaise === 100000 && vSvc.body?.pricing?.vendorPricePaise === 100000 && vSvc.body.pricing.memberPricePaise === 120000 && vSvc.body.pricing.commissionPercent === 20 && vSvc.body.pricing.memberDiscountPercent === 50 && vSvc.body.pricing.commissionPaise === 20000, JSON.stringify(vSvc.body?.pricing));
const mine2 = await call('GET', '/service-offers/mine', { token: V });
check('vendor "my services" carries the pricing', mine2.body?.items?.find((x) => x._id === kId)?.pricing?.vendorPricePaise === 100000);
const vdash0 = await call('GET', '/vendor/dashboard', { token: V });
check('vendor dashboard: own rates, no global commission', vdash0.body?.pricing?.commissionPercent === 20 && vdash0.body.pricing.memberDiscountPercent === 50 && vdash0.body.commissionPercent === undefined, JSON.stringify(vdash0.body?.pricing));

// Bookings: discount applied / not applied / not available.
const MA = (await register(10, `Pricing member A ${RUN}`)).body.accessToken;
const MB = (await register(11, `Pricing member B ${RUN}`)).body.accessToken;
const bA = await call('POST', `/service-offers/${kId}/bookings`, { token: MA, body: { ...bookBody, applyDiscount: true } });
check('booking with "Apply discount": ₹1,200 − ₹100 = ₹1,100', bA.status === 201 && bA.body?.pricing?.memberPricePaise === 120000 && bA.body.pricing.discountPaise === 10000 && bA.body.pricing.payablePaise === 110000 && bA.body.pricing.discountApplied === true, JSON.stringify(bA.body?.pricing || bA.body));
check('member booking JSON has no vendor price or rates', leaks(bA.body).length === 0 && !hasNumber(bA.body, 100000), leaks(bA.body).join(','));
const bB = await call('POST', `/service-offers/${kId}/bookings`, { token: MB, body: bookBody });
check('booking without the discount pays ₹1,200', bB.status === 201 && bB.body?.pricing?.payablePaise === 120000 && bB.body.pricing.discountPaise === 0, JSON.stringify(bB.body?.pricing));
const qId = await approveSvc(await call('POST', '/service-offers', { token: V, body: { ...offerBody, title: `Quote job ${RUN}`, priceType: 'on_quote' } }));
const mq = await call('GET', `/service-offers/${qId}`, { token: M });
check('"price on request": no price, no discount shown', mq.body?.pricing?.memberPricePaise === null && mq.body.pricing.discountAvailable === false && leaks(mq.body).length === 0, JSON.stringify(mq.body?.pricing));
const nd = await call('POST', `/service-offers/${qId}/bookings`, { token: MA, body: { ...bookBody, applyDiscount: true } });
check('discount on "price on request" → 409 NO_DISCOUNT', nd.status === 409 && code(nd) === 'NO_DISCOUNT', `${nd.status} ${code(nd)}`);
const v3Svc = await approveSvc(await call('POST', '/service-offers', { token: V3, body: { ...offerBody, title: `Plain vendor job ${RUN}`, pricePaise: 50000, contactPhone: phoneFor(6) } }));
const nd2 = await call('POST', `/service-offers/${v3Svc}/bookings`, { token: MA, body: { ...bookBody, applyDiscount: true } });
check('discount on a vendor with 0% discount → 409 NO_DISCOUNT', nd2.status === 409 && code(nd2) === 'NO_DISCOUNT', `${nd2.status} ${code(nd2)}`);
const vbA = await call('GET', `/vendor/bookings/${bA.body?._id}`, { token: V });
check('vendor sees the booking snapshot: own price ₹1,000, commission ₹200, 20% / 50%', vbA.body?.pricing?.vendorPricePaise === 100000 && vbA.body.pricing.commissionPaise === 20000 && vbA.body.pricing.commissionPercent === 20 && vbA.body.pricing.memberDiscountPercent === 50 && vbA.body.pricing.payablePaise === 110000, JSON.stringify(vbA.body?.pricing));
// Rates are live for services, fixed for bookings.
await call('PATCH', PR(), { token: T, body: { commissionPercent: 10, memberDiscountPercent: 0 } });
check('rate change applies at once to the service (₹1,100, no discount)', await (async () => { const s = (await call('GET', `/service-offers/${kId}`, { token: M })).body; return s?.pricePaise === 110000 && s.pricing.discountAvailable === false; })());
check('…but the booking keeps its snapshot (₹1,100 payable, ₹200 commission)', await (async () => { const b = (await call('GET', `/vendor/bookings/${bA.body?._id}`, { token: V })).body; return b?.pricing?.payablePaise === 110000 && b.pricing.commissionPaise === 20000; })());
await call('PATCH', PR(), { token: T, body: { commissionPercent: 20, memberDiscountPercent: 50 } });

// ---------------------------------------------------------------- mark paid → settlement → earnings
const earnBefore = (await call('GET', '/vendor/earnings', { token: V })).body?.totals;
const platBefore = (await call('GET', `/platform/earnings?vendorId=${vId}`, { token: T })).body?.totals;
await call('POST', `/vendor/bookings/${bA.body?._id}/accept`, { token: V, body: {} });
await call('POST', `/vendor/bookings/${bA.body?._id}/complete`, { token: V, body: {} });
const paidA = await call('POST', `/vendor/bookings/${bA.body?._id}/mark-paid`, { token: V, body: { amountPaise: 110000 } });
const pA = paidA.body?.payment || {};
check('mark-paid ₹1,100 → commission ₹200, discount ₹100, NIVASA net ₹100, vendor ₹1,000', paidA.status === 200 && pA.cashPaise === 110000 && pA.commissionPaise === 20000 && pA.discountPaise === 10000 && pA.netToPlatformPaise === 10000 && pA.vendorEarningsPaise === 100000, JSON.stringify(pA));
const memberView = (await call('GET', '/service-bookings', { token: MA })).body?.items?.find((x) => x._id === bA.body?._id);
check('member sees paid ₹1,100 but never the settlement', memberView?.payment?.status === 'paid' && memberView.payment.amountPaise === 110000 && leaks(memberView).length === 0, leaks(memberView).join(','));
const ve = await call('GET', '/vendor/earnings', { token: V });
const dv = (k) => (ve.body?.totals?.[k] ?? NaN) - (earnBefore?.[k] ?? NaN);
check('vendor earnings → 200 with totals, months, items', ve.status === 200 && Array.isArray(ve.body?.months) && Array.isArray(ve.body?.items), ve.status);
check('vendor earnings grew by one job: cash ₹1,100, commission ₹200, discounts ₹100, NIVASA ₹100, vendor ₹1,000', dv('paidJobs') === 1 && dv('cashCollectedPaise') === 110000 && dv('commissionPaise') === 20000 && dv('memberDiscountsPaise') === 10000 && dv('platformNetPaise') === 10000 && dv('vendorEarningsPaise') === 100000, JSON.stringify({ before: earnBefore, after: ve.body?.totals }));
check('earnings totals use the new names (no couponCostPaise)', 'memberDiscountsPaise' in (ve.body?.totals || {}) && !('couponCostPaise' in (ve.body?.totals || {})));
check('latest paid job first, with its own numbers', ve.body?.items?.[0]?._id === bA.body?._id && ve.body.items[0].vendorEarningsPaise === 100000 && ve.body.items[0].commissionPercent === 20 && ve.body.items[0].vendorPricePaise === 100000 && ve.body.items[0].memberPricePaise === 120000, JSON.stringify(ve.body?.items?.[0]));
check('this month appears in the monthly list', ve.body?.months?.[0]?.month === today.slice(0, 7) && ve.body.months[0].paidJobs >= 1, JSON.stringify(ve.body?.months?.[0]));
const tomorrow = inDays(1);
check('date filter from tomorrow → nothing', (await call('GET', `/vendor/earnings?from=${tomorrow}`, { token: V })).body?.totals?.paidJobs === 0);
check('date filter today..today includes it', (await call('GET', `/vendor/earnings?from=${today}&to=${today}`, { token: V })).body?.items?.some((x) => x._id === bA.body?._id));
check('from after to → 400', (await call('GET', `/vendor/earnings?from=${tomorrow}&to=${today}`, { token: V })).status === 400);
check('member cannot read vendor earnings → 403', (await call('GET', '/vendor/earnings', { token: M })).status === 403);
check('vendor sees no other vendors (no vendor fields, no top list)', !ve.body?.items?.some((x) => x.vendor) && !ve.body?.topVendors);
const pe = await call('GET', `/platform/earnings?vendorId=${vId}`, { token: T });
const dp = (k) => (pe.body?.totals?.[k] ?? NaN) - (platBefore?.[k] ?? NaN);
check('platform earnings for this vendor grew the same: commission ₹200, discounts ₹100, NIVASA net ₹100, vendor ₹1,000', pe.status === 200 && dp('commissionPaise') === 20000 && dp('memberDiscountsPaise') === 10000 && dp('platformNetPaise') === 10000 && dp('vendorEarningsPaise') === 100000, JSON.stringify(pe.body?.totals));
const pall = await call('GET', '/platform/earnings', { token: T });
check('platform earnings (all vendors) lists top vendors with names', pall.status === 200 && pall.body?.topVendors?.some((x) => String(x.vendor?._id) === vId && x.vendor?.name), JSON.stringify(pall.body?.topVendors?.slice(0, 2)));
check('vendor cannot read platform earnings → 403', (await call('GET', '/platform/earnings', { token: V })).status === 403);
const vdash = await call('GET', '/vendor/dashboard', { token: V });
check('vendor dashboard settlement: member discounts + vendor earnings', vdash.body?.settlement?.memberDiscountsPaise >= 10000 && vdash.body.settlement.vendorEarningsPaise >= 100000 && !('couponCreditsPaise' in vdash.body.settlement), JSON.stringify(vdash.body?.settlement));
const pb = await call('GET', `/platform/service-bookings?vendorId=${vId}&paid=true`, { token: T });
const pbRow = pb.body?.items?.find((x) => x._id === bA.body?._id);
check('owner sees the booking: prices, discount, settlement', pbRow?.vendorPricePaise === 100000 && pbRow.memberPricePaise === 120000 && pbRow.discountPaise === 10000 && pbRow.payment?.vendorEarningsPaise === 100000 && pbRow.payment.netToPlatformPaise === 10000 && typeof pb.body?.totals?.vendorEarningsPaise === 'number', JSON.stringify(pbRow));

// "Price on request": commission comes out of the recorded cash, no discount.
const bq = await call('POST', `/service-offers/${qId}/bookings`, { token: MB, body: bookBody });
await call('POST', `/vendor/bookings/${bq.body?._id}/accept`, { token: V, body: {} });
await call('POST', `/vendor/bookings/${bq.body?._id}/complete`, { token: V, body: {} });
const pq = (await call('POST', `/vendor/bookings/${bq.body?._id}/mark-paid`, { token: V, body: { amountPaise: 50000 } })).body?.payment || {};
check('price on request: ₹500 cash at 20% → commission ₹100 out of it, vendor ₹400', pq.cashPaise === 50000 && pq.commissionPaise === 10000 && pq.discountPaise === 0 && pq.netToPlatformPaise === 10000 && pq.vendorEarningsPaise === 40000, JSON.stringify(pq));

// Rounding: ₹333.33 at 12.5% → commission ₹41.67.
await call('PATCH', PR(), { token: T, body: { commissionPercent: 12.5 } });
const oddId = await approveSvc(await call('POST', '/service-offers', { token: V, body: { ...offerBody, title: `Odd price ${RUN}`, pricePaise: 33333 } }));
const MC = (await register(12, `Pricing member C ${RUN}`)).body.accessToken;
const bo = await call('POST', `/service-offers/${oddId}/bookings`, { token: MC, body: bookBody });
const vbo = await call('GET', `/vendor/bookings/${bo.body?._id}`, { token: V });
check('rounding: ₹333.33 at 12.5% → commission ₹41.67, member price ₹375.00', vbo.body?.pricing?.commissionPaise === 4167 && bo.body?.pricing?.memberPricePaise === 37500, JSON.stringify(vbo.body?.pricing));
await call('PATCH', PR(), { token: T, body: { commissionPercent: 20 } });

// ---------------------------------------------------------------- near me
const near = (q, token = M) => call('GET', `/service-offers?${q}`, { token });
const nm5 = await near(`lat=${ME.lat}&lng=${ME.lng}&radiusKm=5&sort=nearest&limit=100`);
const ids5 = (nm5.body?.items || []).map((x) => x._id);
check('near me (5 km): shop A service inside, shop B outside', nm5.status === 200 && ids5.includes(offerId) && !ids5.includes(v3Svc), `${nm5.status} ${JSON.stringify(ids5.slice(0, 5))}`);
check('service without a shop location is left out of near me', !ids5.includes(v3Svc));
// Shop B moves its location → its existing services follow.
const shopB = await call('PUT', '/vendor/shop', { token: V3, body: { shopName: `Shop B ${RUN}`, location: { ...B, label: 'Shop B' } } });
check('vendor B sets the shop location', shopB.status === 200 && shopB.body?.shop?.location?.lat === B.lat, JSON.stringify(shopB.body?.shop));
const nm25 = await near(`lat=${ME.lat}&lng=${ME.lng}&radiusKm=25&sort=nearest&limit=100`);
const items25 = nm25.body?.items || [];
const iA = items25.findIndex((x) => x._id === offerId);
const iB = items25.findIndex((x) => x._id === v3Svc);
check('near me (25 km): both shops, nearest first', iA >= 0 && iB >= 0 && iA < iB, `${iA} ${iB}`);
check('results are ordered by distance', items25.every((x, i) => i === 0 || items25[i - 1].distanceKm <= x.distanceKm));
const expA = haversine(ME, A);
const expB = haversine(ME, B);
check(`distanceKm A ≈ ${expA.toFixed(2)} km (±0.2)`, Math.abs(items25[iA]?.distanceKm - expA) <= 0.2, items25[iA]?.distanceKm);
check(`distanceKm B ≈ ${expB.toFixed(2)} km (±0.2)`, Math.abs(items25[iB]?.distanceKm - expB) <= 0.2, items25[iB]?.distanceKm);
check('distanceKm has one decimal', items25.every((x) => Math.round(x.distanceKm * 10) === x.distanceKm * 10));
check('near me answer carries the search', nm25.body?.near?.radiusKm === 25 && nm25.body?.sponsoredCount === 0);
check('near-me items keep member pricing (no vendor fields)', leaks(nm25.body).length === 0, leaks(nm25.body).join(','));
check('service shows shop B name', items25[iB]?.shop?.name === `Shop B ${RUN}`);
const pausedId = await approveSvc(await call('POST', '/service-offers', { token: V, body: { ...offerBody, title: `Paused job ${RUN}` } }));
await call('PATCH', `/service-offers/${pausedId}`, { token: V, body: { status: 'paused' } });
check('paused service is not in near me (visibility rules unchanged)', !(await near(`lat=${ME.lat}&lng=${ME.lng}&radiusKm=25&limit=100`)).body?.items?.some((x) => x._id === pausedId));
check('invalid lat (95) → 400', (await near(`lat=95&lng=${ME.lng}&radiusKm=5`)).status === 400);
check('lat not a number → 400', (await near(`lat=abc&lng=${ME.lng}`)).status === 400);
check('radius 101 → 400', (await near(`lat=${ME.lat}&lng=${ME.lng}&radiusKm=101`)).status === 400);
check('radius 0.5 → 400', (await near(`lat=${ME.lat}&lng=${ME.lng}&radiusKm=0.5`)).status === 400);
check('lat without lng → 400', (await near(`lat=${ME.lat}&radiusKm=5`)).status === 400);
check('sort=nearest without a location → 400', (await near('sort=nearest')).status === 400);
// Clearing the shop location removes its services from near me.
await call('PUT', '/vendor/shop', { token: V3, body: { location: null } });
check('shop location cleared → its services leave near me', !(await near(`lat=${ME.lat}&lng=${ME.lng}&radiusKm=25&limit=100`)).body?.items?.some((x) => x._id === v3Svc));


console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length) {
  console.log(failed.map((f) => `  ✗ ${f}`).join('\n'));
  process.exit(1);
}
