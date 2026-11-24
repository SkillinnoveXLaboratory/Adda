#!/usr/bin/env node
/**
 * SMART CHECK for skills/admin-vendor-onboarding — Master Admin / sub-admin "Add vendor", admin-entered KYC +
 * documents, approve → Cashfree payout account, "added by", sub-admin Activity. LOCAL backend only (never Atlas).
 *
 *   API_BASE=http://127.0.0.1:3013 node scripts/vendor-onboarding-check.mjs
 */
import { Buffer } from 'node:buffer';

const BASE = (process.env.API_BASE || 'http://127.0.0.1:3013').replace(/\/$/, '');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error('Refusing to run: vendor-onboarding-check only targets a local backend.');
  process.exit(2);
}
const API = `${BASE}/api/v1`;
const SA = { email: process.env.SA_EMAIL || 'admin@addaapp.local', password: process.env.SA_PASSWORD || 'DevAdmin12345' };
const RUN = Date.now().toString(36).slice(-5);
const STAMP = Date.now();
let passed = 0;
const failed = [];
function ok(name, cond, detail) {
  const d = detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)?.slice(0, 300)}`;
  if (cond) passed++;
  else failed.push(name + d);
  console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : d}`);
  return cond;
}
async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // not JSON
  }
  return { status: res.status, body: json };
}
const code = (r) => r.body?.error?.code;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function upload(token, purpose, path = '/platform/vendors/uploads') {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', new Blob([PNG], { type: 'image/png' }), `${purpose}.png`);
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
const withVerhoeff = (b) => b + INV[b.split('').reverse().reduce((c, d, i) => D[c][P[(i + 1) % 8][Number(d)]], 0)];
const phoneFor = (n) => `6${String(STAMP + n * 7907).slice(-9)}`;
const PASSWORD = 'VendorOnboard2026!';
const PAN = `ABKPV${String(STAMP).slice(-4)}Q`;
const AADHAAR = withVerhoeff(`5${String(STAMP).slice(-10)}`);
const ACCOUNT = `9001${String(STAMP).slice(-8)}`;

const login = async (email, password) => (await call('POST', '/auth/admin/login', { body: { email, password } })).body?.accessToken;
const T = await login(SA.email, SA.password);
if (!T) {
  console.error('Owner sign-in failed — create the local super admin first.');
  process.exit(2);
}
const docs = async (token) => {
  const out = [];
  for (let i = 0; i < 3; i++) out.push((await upload(token, 'kyc')).body?._id);
  return out;
};
const kycOf = (d, extra = {}) => ({ businessName: `Onboard Traders ${RUN}`, businessType: 'business', city: 'Pune', address: '7 MG Road', pan: PAN.toLowerCase(), aadhaar: `${AADHAAR.slice(0, 4)} ${AADHAAR.slice(4, 8)} ${AADHAAR.slice(8)}`, bankAccountHolder: 'Ravi Patil', bankAccountNumber: ACCOUNT, bankIfsc: 'icic0001234', bankName: 'ICICI', panPhoto: d[0], aadhaarFront: d[1], aadhaarBack: d[2], vendorConsent: true, ...extra });

// ---------------------------------------------------------------- owner adds a vendor with KYC + approve
const up = await upload(T, 'kyc');
ok('owner uploads a KYC document → 201, private', up.status === 201 && up.body?._id && up.body.purpose === 'kyc', up.body);
const unsigned = await fetch(`${BASE}/media/${up.body?._id}`);
ok('KYC upload is private (no signature → 403)', unsigned.status === 403, unsigned.status);
ok('wrong purpose → 400', (await upload(T, 'product')).status === 400);
const logo = await upload(T, 'vendor_logo');
const d1 = [up.body?._id, (await upload(T, 'kyc')).body?._id, (await upload(T, 'kyc')).body?._id];
const base = { name: `Ravi Patil ${RUN}`, phone: phoneFor(1), email: `ravi.${RUN}@example.com`, password: PASSWORD, shopName: `Patil Stores ${RUN}`, logoId: logo.body?._id, location: { lat: 18.52, lng: 73.85, label: 'MG Road, Pune' }, commissionPercent: 10, memberDiscountPercent: 20 };

// validation first — and the mobile must stay free after each failure
for (const [why, patch] of [
  ['weak password', { password: 'short' }],
  ['bad PAN', { kyc: kycOf(d1, { pan: 'ABC123' }) }],
  ['Aadhaar with wrong checksum', { kyc: kycOf(d1, { aadhaar: `${AADHAAR.slice(0, 11)}${(Number(AADHAAR[11]) + 1) % 10}` }) }],
  ['bad IFSC', { kyc: kycOf(d1, { bankIfsc: 'ICIC1234567' }) }],
  ['bad account number', { kyc: kycOf(d1, { bankAccountNumber: '12ab' }) }],
  ['same photo twice', { kyc: kycOf([d1[0], d1[0], d1[2]]) }],
  ['missing vendor consent', { kyc: kycOf(d1, { vendorConsent: false }) }],
  ['unknown field', { commissionBps: 1000 }],
  ['bad location', { location: { lat: 99, lng: 10 } }],
]) {
  const r = await call('POST', '/platform/vendors', { token: T, body: { ...base, ...patch } });
  ok(`invalid: ${why} → 400`, r.status === 400, `${r.status} ${r.body?.error?.message || ''}`);
}
const v1 = await call('POST', '/platform/vendors', { token: T, body: { ...base, kyc: kycOf(d1, { approve: true }) } });
ok('owner adds vendor with full KYC + approve → 201 (mobile was still free after the failures)', v1.status === 201 && v1.body?._id, v1.body);
const txt = JSON.stringify(v1.body || {});
ok('KYC approved, reviewed by the owner', v1.body?.profile?.kycStatus === 'approved', v1.body?.profile?.kycStatus);
ok('response is masked: no full PAN / Aadhaar / account', !txt.includes(PAN) && !txt.includes(AADHAAR) && !txt.includes(ACCOUNT) && v1.body?.profile?.aadhaar === `XXXX XXXX ${AADHAAR.slice(-4)}`, v1.body?.profile);
ok('rates set: 10% / 20%', v1.body?.pricing?.commissionPercent === 10 && v1.body.pricing.memberDiscountPercent === 20, v1.body?.pricing);
ok('payout object returned (Cashfree account created or status shown)', !!v1.body?.payout?.status, v1.body?.payout);
ok('shop name + location saved', v1.body?.profile?.shop?.name === base.shopName && v1.body.profile.shop.location?.lat === 18.52, v1.body?.profile?.shop);
const vId = v1.body?._id;
ok('duplicate mobile → 409 ACCOUNT_EXISTS', code(await call('POST', '/platform/vendors', { token: T, body: { ...base, email: `other.${RUN}@example.com` } })) === 'ACCOUNT_EXISTS');
ok('duplicate email → 409 EMAIL_EXISTS', code(await call('POST', '/platform/vendors', { token: T, body: { ...base, phone: phoneFor(2) } })) === 'EMAIL_EXISTS');

// the vendor uses the app
const appLogin = await call('POST', '/auth/resident/login', { body: { phone: base.phone, password: PASSWORD, accountType: 'vendor' } });
ok('vendor signs in to the app (mobile + password, Vendor) → KYC approved', appLogin.status === 200 && appLogin.body?.vendor?.kycStatus === 'approved', `${appLogin.status} ${appLogin.body?.error?.message || ''}`);
const V = appLogin.body?.accessToken;
const docAfter = await call('GET', '/vendor/profile', { token: V });
ok('documents now belong to the vendor (signed links in their own profile)', !!docAfter.body?.documents?.panPhoto?.url, docAfter.body?.documents);
const pcat = (await call('GET', '/products/categories', { token: V })).body?.items?.[0]?._id;
const prod = await call('POST', '/products', { token: V, body: { categoryId: pcat, title: `Onboard rice ${RUN}`, pricePaise: 50000, stock: 5 } });
ok('admin-created vendor can add a product (KYC gate passes)', prod.status === 201, `${prod.status} ${prod.body?.error?.code || ''}`);
ok('vendor token cannot add vendors → 401/403', [401, 403].includes((await call('POST', '/platform/vendors', { token: V, body: base })).status));
ok('vendor token cannot use admin uploads → 401/403', [401, 403].includes((await upload(V, 'kyc')).status));

// ---------------------------------------------------------------- foreign documents
const vr = await call('POST', '/auth/resident/register', { body: { phone: phoneFor(3), name: `Self vendor ${RUN}`, password: PASSWORD, accountType: 'vendor' } });
const SV = vr.body?.accessToken;
const theirDoc = (await upload(SV, 'kyc', '/uploads')).body?._id;
const d2 = await docs(T);
const foreign = await call('POST', '/platform/vendors', { token: T, body: { ...base, phone: phoneFor(4), email: `f.${RUN}@example.com`, kyc: kycOf([theirDoc, d2[1], d2[2]]) } });
ok("another vendor's document → 400 (and no account created)", foreign.status === 400 && (await call('POST', '/auth/resident/login', { body: { phone: phoneFor(4), password: PASSWORD } })).status === 401, foreign.status);

// ---------------------------------------------------------------- vendor without KYC → admin enters it
const v2 = await call('POST', '/platform/vendors', { token: T, body: { name: `No KYC ${RUN}`, phone: phoneFor(5), email: `nokyc.${RUN}@example.com`, password: PASSWORD } });
ok('vendor without KYC → kycStatus not_submitted', v2.status === 201 && v2.body?.profile?.kycStatus === 'not_submitted', v2.body?.profile?.kycStatus);
const k2 = await call('PUT', `/platform/vendors/${v2.body?._id}/kyc-details`, { token: T, body: kycOf(d2) });
ok('admin enters KYC (no approve) → pending review', k2.status === 200 && k2.body?.profile?.kycStatus === 'pending', k2.body);
const appr = await call('POST', `/platform/vendors/${v2.body?._id}/kyc`, { token: T, body: { decision: 'approved' } });
ok('normal approve works on admin-entered KYC', appr.status === 200 && appr.body?.kycStatus === 'approved', appr.status);
ok('editing approved KYC → 409 KYC_APPROVED', code(await call('PUT', `/platform/vendors/${v2.body?._id}/kyc-details`, { token: T, body: kycOf(await docs(T)) })) === 'KYC_APPROVED');
ok('kyc-details on a member → 404', (await call('PUT', `/platform/vendors/${(await call('POST', '/auth/resident/register', { body: { phone: phoneFor(6), name: 'Member', password: PASSWORD } })).body?.user?._id}/kyc-details`, { token: T, body: kycOf(await docs(T)) })).status === 404);

// ---------------------------------------------------------------- sub-admins
const mkSub = async (n, permissions) => {
  const email = `sub${n}.${RUN}@example.com`;
  const r = await call('POST', '/platform/subadmins', { token: T, body: { name: `Sub ${n} ${RUN}`, email, password: 'SubAdmin2026secure', permissions } });
  return { id: r.body?._id, token: await login(email, 'SubAdmin2026secure') };
};
const S1 = await mkSub(1, ['vendors.manage']);
const S2 = await mkSub(2, ['vendors.view']);
ok('two sub-admins created', !!S1.token && !!S2.token);
const sd = await docs(S1.token);
const v3 = await call('POST', '/platform/vendors', { token: S1.token, body: { name: `Sub added ${RUN}`, phone: phoneFor(7), email: `subadded.${RUN}@example.com`, password: PASSWORD, shopName: `Sub Shop ${RUN}`, kyc: kycOf(sd) } });
ok('sub-admin with vendors.manage adds a vendor (KYC pending)', v3.status === 201 && v3.body?.profile?.kycStatus === 'pending', `${v3.status} ${v3.body?.error?.message || ''}`);
ok('vendors.view sub-admin: create → 403', code(await call('POST', '/platform/vendors', { token: S2.token, body: { ...base, phone: phoneFor(8), email: `x.${RUN}@example.com` } })) === 'PERMISSION_DENIED');
ok('vendors.view sub-admin: upload → 403', (await upload(S2.token, 'kyc')).status === 403);
ok('vendors.view sub-admin: kyc-details → 403', (await call('PUT', `/platform/vendors/${v2.body?._id}/kyc-details`, { token: S2.token, body: kycOf(sd) })).status === 403);
ok("sub-admin can't use the owner's uploaded documents", (await call('PUT', `/platform/vendors/${v3.body?._id}/kyc-details`, { token: S1.token, body: kycOf(await docs(T)) })).status === 400);
const list = await call('GET', `/platform/vendors?q=${encodeURIComponent(`Sub added ${RUN}`)}`, { token: T });
const row = list.body?.items?.find((x) => x._id === v3.body?._id);
ok('vendor list shows Added by = the sub-admin', row?.addedBy?.name === `Sub 1 ${RUN}` && row.addedBy.role === 'sub_admin', row?.addedBy);
const det = await call('GET', `/platform/vendors/${v3.body?._id}`, { token: T });
ok('vendor detail shows addedBy + kycEnteredBy', det.body?.addedBy?.role === 'sub_admin' && det.body?.kycEnteredBy?.name === `Sub 1 ${RUN}`, { a: det.body?.addedBy, k: det.body?.kycEnteredBy });
const det1 = await call('GET', `/platform/vendors/${vId}`, { token: T });
ok('owner-added vendor shows Added by owner', det1.body?.addedBy?.role === 'super_admin', det1.body?.addedBy);

// ---------------------------------------------------------------- activity
const act = await call('GET', `/platform/subadmins/${S1.id}/activity`, { token: T });
ok('owner sees the sub-admin activity: vendor_created for that vendor, vendorsAdded = 1', act.status === 200 && act.body?.counts?.vendorsAdded === 1 && act.body.items?.some((a) => a.action === 'platform.vendor_created' && a.targetId === v3.body?._id), act.body?.counts);
ok('activity filter by action', (await call('GET', `/platform/subadmins/${S1.id}/activity?action=platform.vendor_created`, { token: T })).body?.items?.every((a) => a.action === 'platform.vendor_created'));
ok('a sub-admin cannot read activity → 403', (await call('GET', `/platform/subadmins/${S1.id}/activity`, { token: S1.token })).status === 403);
ok('activity of a non-sub-admin id → 404', (await call('GET', `/platform/subadmins/${vId}/activity`, { token: T })).status === 404);
const al = await call('GET', `/platform/audit-logs?actorId=${S1.id}&limit=50`, { token: T });
ok('audit log filters by actorId', al.status === 200 && al.body?.items?.length >= 1 && al.body.items.every((a) => String(a.actor?._id || a.actor) === String(S1.id)), al.body?.items?.length);
ok('the owner add is audited too', (await call('GET', '/platform/audit-logs?action=platform.vendor_created&limit=50', { token: T })).body?.items?.some((a) => a.targetId === vId));

console.log(`\nvendor-onboarding-check: ${passed}/${passed + failed.length} passed`);
for (const f of failed) console.log(`  ✗ ${f}`);
process.exit(failed.length ? 1 : 0);
