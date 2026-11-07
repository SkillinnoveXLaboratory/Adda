#!/usr/bin/env node
/**
 * Vendor marketplace checks against a LOCAL backend (never production / Atlas):
 * account types, society isolation, KYC (validation, encryption at rest, masking, reveal + audit, review),
 * vendor-only listings, service bookings (status flow, cash "mark as paid"), boosted ads (review, sponsored order).
 *
 *   cd Backend && node server.js dev:db
 *   cd Backend && MONGODB_URI=mongodb://127.0.0.1:27027/?replicaSet=rs0 PORT=3013 RESIDENT_PASSWORD_LOGIN=true \
 *     LOGIN_RATE_LIMIT=2000 KYC_ENCRYPTION_KEY=<64 hex> node server.js
 *   node scripts/vendor-check.mjs http://localhost:3013 admin@addaapp.local DevAdmin12345
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
async function register(n, name, accountType) {
  const r = await call('POST', '/auth/resident/register', { body: { phone: phoneFor(n), name, password: 'VendorCheck12345', accountType } });
  return r;
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

// ---------------------------------------------------------------- platform commission + coupons
check('commission must be a number 0–50 → 400', (await call('PUT', '/platform/settings/services.commissionPercent', { token: T, body: { value: 75 } })).status === 400);
check('commission with 3 decimals → 400', (await call('PUT', '/platform/settings/services.commissionPercent', { token: T, body: { value: 10.125 } })).status === 400);
check('owner sets 10% commission', (await call('PUT', '/platform/settings/services.commissionPercent', { token: T, body: { value: 10 } })).status === 200);
check('app config shows the commission', (await call('GET', '/public/config')).body?.services?.commissionPercent === 10);
const cOffer = await call('POST', '/service-offers', { token: V, body: { ...offerBody, title: `Deep cleaning ${RUN}`, pricePaise: 100000 } });
check('new service snapshots the commission (1000 bps)', cOffer.status === 201 && cOffer.body?.commissionBps === 1000, `${cOffer.status} ${cOffer.body?.commissionBps}`);
if (cOffer.body?.moderationStatus === 'pending') await call('POST', `/platform/listings/service/${cOffer.body._id}/moderate`, { token: T, body: { decision: 'approved' } });
const cId = cOffer.body?._id;
check('members never see the commission rate', (await call('GET', `/service-offers/${cId}`, { token: M })).body?.commissionBps === undefined);
check('the vendor sees it on their own service', (await call('GET', `/service-offers/${cId}`, { token: V })).body?.commissionBps === 1000);

const COUPON = `SAVE${RUN}`.toUpperCase().slice(0, 20);
const mkCoupon = await call('POST', '/platform/coupons', { token: T, body: { code: COUPON.toLowerCase(), discountPaise: 15000, maxUses: 2, description: 'Festive offer' } });
check('owner creates a coupon (code upper-cased)', mkCoupon.status === 201 && mkCoupon.body?.code === COUPON && mkCoupon.body?.allMembers === true, `${mkCoupon.status} ${mkCoupon.body?.error?.message || ''}`);
check('duplicate coupon code → 409', (await call('POST', '/platform/coupons', { token: T, body: { code: COUPON, discountPaise: 100, maxUses: 1 } })).status === 409);
check('coupon with discount below ₹1 → 400', (await call('POST', '/platform/coupons', { token: T, body: { code: `LOW${RUN}`, discountPaise: 50, maxUses: 1 } })).status === 400);
check('member cannot create coupons → 403', (await call('POST', '/platform/coupons', { token: M, body: { code: `HACK${RUN}`, discountPaise: 100, maxUses: 1 } })).status === 403);
const cpath = `/service-offers/${cId}/coupon`;
check('unknown coupon → 400 COUPON_INVALID', (await call('POST', cpath, { token: M, body: { code: 'NOPE-123' } })).body?.error?.code === 'COUPON_INVALID');
check('vendor cannot use coupons → 403', (await call('POST', cpath, { token: V2, body: { code: COUPON } })).status === 403);
const chk = await call('POST', cpath, { token: M, body: { code: COUPON.toLowerCase() } });
check('member checks the coupon: ₹1000 − ₹150 = ₹850', chk.status === 200 && chk.body?.discountPaise === 15000 && chk.body?.payablePaise === 85000, JSON.stringify(chk.body));
check('coupon on a "price on request" service → 400 COUPON_NEEDS_PRICE', await (async () => {
  const q = await call('POST', '/service-offers', { token: V, body: { ...offerBody, title: `Quote job ${RUN}`, priceType: 'on_quote' } });
  if (q.body?.moderationStatus === 'pending') await call('POST', `/platform/listings/service/${q.body._id}/moderate`, { token: T, body: { decision: 'approved' } });
  return (await call('POST', `/service-offers/${q.body?._id}/coupon`, { token: M, body: { code: COUPON } })).body?.error?.code === 'COUPON_NEEDS_PRICE';
})());
const cb1 = await call('POST', `/service-offers/${cId}/bookings`, { token: M, body: { ...bookBody, couponCode: COUPON } });
check('booking with coupon → discount + payable on the booking', cb1.status === 201 && cb1.body?.pricing?.discountPaise === 15000 && cb1.body?.pricing?.payablePaise === 85000 && cb1.body?.pricing?.commissionPercent === undefined, JSON.stringify(cb1.body?.pricing || cb1.body));
check('coupon use counted', (await call('GET', `/platform/coupons/${mkCoupon.body?._id}`, { token: T })).body?.usedCount === 1);
check('same member cannot use it again → 409 COUPON_ALREADY_USED', (await call('POST', cpath, { token: M, body: { code: COUPON } })).body?.error?.code === 'COUPON_ALREADY_USED');
check('member cancels → coupon use given back', (await call('POST', `/service-bookings/${cb1.body?._id}/cancel`, { token: M, body: {} })).status === 200 && (await call('GET', `/platform/coupons/${mkCoupon.body?._id}`, { token: T })).body?.usedCount === 0);
const cb2 = await call('POST', `/service-offers/${cId}/bookings`, { token: M, body: { ...bookBody, couponCode: COUPON } });
check('member can use it again after the cancellation', cb2.status === 201 && cb2.body?.pricing?.discountPaise === 15000);
const M2 = (await register(7, `Member two ${RUN}`)).body.accessToken;
const M3 = (await register(8, `Member three ${RUN}`)).body.accessToken;
check('second member uses the last use', (await call('POST', `/service-offers/${cId}/bookings`, { token: M2, body: { ...bookBody, couponCode: COUPON } })).status === 201);
check('third member → 409 COUPON_EXHAUSTED', (await call('POST', cpath, { token: M3, body: { code: COUPON } })).body?.error?.code === 'COUPON_EXHAUSTED');
check('used coupon cannot be deleted → 409', (await call('DELETE', `/platform/coupons/${mkCoupon.body?._id}`, { token: T })).status === 409);
check("used coupon's code cannot change → 409", (await call('PATCH', `/platform/coupons/${mkCoupon.body?._id}`, { token: T, body: { code: `NEW${RUN}` } })).status === 409);
check('max uses below used count → 400', (await call('PATCH', `/platform/coupons/${mkCoupon.body?._id}`, { token: T, body: { maxUses: 1 } })).status === 400);
const off = await call('POST', '/platform/coupons', { token: T, body: { code: `OFF${RUN}`.toUpperCase(), discountPaise: 5000, maxUses: 5, active: false } });
check('inactive coupon → 400 COUPON_INVALID', (await call('POST', cpath, { token: M3, body: { code: off.body?.code } })).body?.error?.code === 'COUPON_INVALID');
check('unused coupon can be deleted', (await call('DELETE', `/platform/coupons/${off.body?._id}`, { token: T })).status === 200);

// Settlement: vendor collects ₹850 cash on a ₹1000 job with a ₹150 coupon at 10% → commission ₹100, net ₹100 − ₹150 = −₹50.
const bId2 = cb2.body?._id;
await call('POST', `/vendor/bookings/${bId2}/accept`, { token: V, body: {} });
await call('POST', `/vendor/bookings/${bId2}/complete`, { token: V, body: {} });
const vb2 = await call('GET', `/vendor/bookings/${bId2}`, { token: V });
check('vendor sees payable ₹850 and the 10% rate', vb2.body?.pricing?.payablePaise === 85000 && vb2.body?.pricing?.commissionPercent === 10);
const paid2 = await call('POST', `/vendor/bookings/${bId2}/mark-paid`, { token: V, body: { amountPaise: 85000 } });
const p2 = paid2.body?.payment || {};
check('settlement: gross ₹1000, commission ₹100, coupon credit ₹150, net −₹50', p2.grossPaise === 100000 && p2.commissionPaise === 10000 && p2.discountPaise === 15000 && p2.netToPlatformPaise === -5000, JSON.stringify(p2));
check('member never sees the settlement', (await call('GET', '/service-bookings', { token: M })).body?.items?.find((x) => x._id === bId2)?.payment?.commissionPaise === undefined);
const vdash = await call('GET', '/vendor/dashboard', { token: V });
check('vendor dashboard settlement includes it', vdash.body?.settlement?.commissionPaise >= 10000 && vdash.body?.settlement?.couponCreditsPaise >= 15000 && vdash.body?.commissionPercent === 10);
const pb = await call('GET', `/platform/service-bookings?vendorId=${vId}&paid=true`, { token: T });
check('owner sees the booking with settlement + totals', pb.status === 200 && pb.body?.items?.some((x) => x._id === bId2 && x.payment?.netToPlatformPaise === -5000) && typeof pb.body?.totals?.netToPlatformPaise === 'number');
check('rounding: 10% of ₹333.33 → ₹33.33', await (async () => {
  const o = await call('POST', '/service-offers', { token: V, body: { ...offerBody, title: `Odd price ${RUN}`, pricePaise: 33333 } });
  if (o.body?.moderationStatus === 'pending') await call('POST', `/platform/listings/service/${o.body._id}/moderate`, { token: T, body: { decision: 'approved' } });
  const bk = await call('POST', `/service-offers/${o.body?._id}/bookings`, { token: M3, body: bookBody });
  await call('POST', `/vendor/bookings/${bk.body?._id}/accept`, { token: V, body: {} });
  await call('POST', `/vendor/bookings/${bk.body?._id}/complete`, { token: V, body: {} });
  const pd = await call('POST', `/vendor/bookings/${bk.body?._id}/mark-paid`, { token: V, body: { amountPaise: 33333 } });
  return pd.body?.payment?.commissionPaise === 3333 && pd.body?.payment?.netToPlatformPaise === 3333;
})());
await call('PUT', '/platform/settings/services.commissionPercent', { token: T, body: { value: 0 } });

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length) {
  console.log(failed.map((f) => `  ✗ ${f}`).join('\n'));
  process.exit(1);
}
