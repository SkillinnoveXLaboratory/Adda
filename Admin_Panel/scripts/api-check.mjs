#!/usr/bin/env node
/**
 * Live contract check for the Master Admin console: owner sign-in, society workspace bridge
 * (/platform/societies/:sid/manage/*), masking + logged reveal, members directory, member profile and
 * owner actions, vendors (KYC review + logged reveal), vendor-only listings and ads (boost) review.
 * Seeds its own society, flats, residents and a vendor. LOCAL backend only (default http://127.0.0.1:3013).
 *
 *   npm run api-check
 *   API_BASE=http://127.0.0.1:3013 SA_EMAIL=… SA_PASSWORD=… node scripts/api-check.mjs
 */
import { superAdminLogin } from './sa-login.mjs';

const BASE = (process.env.API_BASE || 'http://127.0.0.1:3013').replace(/\/$/, '');
if (/adda\.skillinnovex\.in|mongodb\.net/.test(BASE)) {
  console.error('Refusing to run against production. Use a local backend.');
  process.exit(2);
}
const API = `${BASE}/api/v1`;
const SA = { email: process.env.SA_EMAIL || 'admin@addaapp.local', password: process.env.SA_PASSWORD || 'DevAdmin12345' };
const RUN = Date.now().toString(36).toUpperCase();
const PASSWORD = 'Adda2026secure';

const results = [];
let section = '';
const ok = (name, cond, detail) => {
  results.push({ section, name, pass: Boolean(cond), detail });
  console.log(`  ${cond ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m'} ${name}${!cond && detail !== undefined ? `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}` : ''}`);
  return Boolean(cond);
};
const head = (s) => {
  section = s;
  console.log(`\n\x1b[1m${s}\x1b[0m`);
};

async function call(method, path, { token, body, reason } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (reason) headers['X-Action-Reason'] = encodeURIComponent(reason);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json };
}
async function expect(name, status, method, path, opts) {
  const r = await call(method, path, opts);
  const want = [].concat(status);
  ok(`${method} ${path.split('?')[0]} → ${want.join('|')}${name ? ` (${name})` : ''}`, want.includes(r.status), `got ${r.status} ${JSON.stringify(r.json?.error || r.json || '').slice(0, 300)}`);
  if (r.status === 429) {
    console.error('\nRate limited by the backend. Start the local API with LOGIN_RATE_LIMIT=2000 or wait 15 minutes.');
    process.exit(1);
  }
  return r.json;
}
const randPhone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
const isMasked = (v) => typeof v === 'string' && v.includes('•');
const isPaged = (j) => j && Array.isArray(j.items) && ['page', 'limit', 'total', 'pages'].every((k) => typeof j[k] === 'number');

// 1×1 PNG (the server sniffs magic bytes, so this is a real image upload).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function upload(token, purpose) {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', new Blob([PNG], { type: 'image/png' }), `${purpose}.png`);
  const res = await fetch(`${API}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => null) };
}
// Verhoeff check digit → valid test Aadhaar numbers (12 digits, not starting with 0/1).
const VD = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const VP = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const VINV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
const withVerhoeff = (base11) => base11 + VINV[base11.split('').reverse().reduce((c, d, i) => VD[c][VP[(i + 1) % 8][Number(d)]], 0)];

/** Vendor accounts, KYC review + logged reveal, vendor-only listings and ad (boost) review — everything the Vendors / Ads screens use. */
async function vendorsAndAds(T, { AT, MT }) {
  head('Vendors: accounts & KYC review');
  const ov0 = await expect('overview', 200, 'GET', '/platform/overview', { token: T });
  ok('overview counts include vendors, pendingKyc, pendingAds', ['vendors', 'pendingKyc', 'pendingAds'].every((k) => typeof ov0?.counts?.[k] === 'number'), ov0?.counts);
  const vPhone = randPhone();
  const vName = `Vendor ${RUN}`;
  const business = `Sharma Cooling ${RUN}`;
  const vReg = await expect('register vendor', 201, 'POST', '/auth/resident/register', { body: { phone: vPhone, name: vName, password: PASSWORD, accountType: 'vendor' } });
  const V = vReg.accessToken;
  const vId = vReg.user?._id;
  ok('vendor account type + KYC not submitted', vReg.user?.accountType === 'vendor' && vReg.vendor?.kycStatus === 'not_submitted', { user: vReg.user, vendor: vReg.vendor });

  const vt = await expect('accounts filter: vendors', 200, 'GET', `/platform/users?accountType=vendor&q=${vPhone}`, { token: T });
  ok('accountType=vendor finds the vendor (with accountType, masked phone)', vt.total === 1 && vt.items[0].accountType === 'vendor' && isMasked(vt.items[0].phone), vt.items?.[0]);
  const mt = await expect('accounts filter: members', 200, 'GET', `/platform/users?accountType=member&q=${vPhone}`, { token: T });
  ok('accountType=member excludes the vendor', mt.total === 0, mt.total);
  const memberRow = await expect('', 200, 'GET', `/platform/users?accountType=member&limit=5`, { token: T });
  ok('member rows are accountType member', memberRow.items.length > 0 && memberRow.items.every((u) => (u.accountType || 'member') === 'member'), memberRow.items.map((u) => u.accountType));

  const ns = await expect('vendors: not submitted', 200, 'GET', `/platform/vendors?kycStatus=not_submitted&q=${encodeURIComponent(vName)}`, { token: T });
  const nsRow = ns.items?.find((x) => x._id === vId);
  ok('list item shape (user id, masked phone, kycStatus)', isPaged(ns) && nsRow && ['profileId', 'name', 'phone', 'status', 'businessName', 'city', 'kycStatus', 'submittedAt', 'createdAt'].every((k) => k in nsRow) && isMasked(nsRow.phone) && nsRow.kycStatus === 'not_submitted', nsRow);
  const d0 = await expect('vendor detail', 200, 'GET', `/platform/vendors/${vId}`, { token: T });
  ok('detail: user + profile + counts + kycAvailable', d0?.user?._id === vId && isMasked(d0.user.phone) && d0.profile?.kycStatus === 'not_submitted' && ['properties', 'services', 'bookings', 'ads'].every((k) => d0.counts?.[k] === 0) && d0.kycAvailable === true, d0);
  ok('detail: no documents before KYC', d0?.profile?.documents && Object.values(d0.profile.documents).every((x) => x === null), d0?.profile?.documents);
  await expect('reveal before KYC', 404, 'POST', `/platform/vendors/${vId}/reveal`, { token: T, body: { reason: 'Check before submission' } });
  await expect('approve without submission', 409, 'POST', `/platform/vendors/${vId}/kyc`, { token: T, body: { decision: 'approved' } });
  await expect('member id is not a vendor', 404, 'GET', `/platform/vendors/${(await call('GET', '/me', { token: MT })).json?.user?._id}`, { token: T });
  await expect('unknown vendor', 404, 'GET', '/platform/vendors/5f0000000000000000000000', { token: T });
  await expect('society admin → vendors', 403, 'GET', '/platform/vendors', { token: AT });
  await expect('member → vendors', 403, 'GET', '/platform/vendors', { token: MT });

  const docs = [];
  for (let i = 0; i < 3; i++) docs.push((await upload(V, 'kyc')).json?._id);
  ok('vendor uploads 3 KYC photos', docs.every(Boolean), docs);
  const AADHAAR = withVerhoeff(`2${String(Date.now()).slice(-10)}`);
  const PAN = `ABCDE${String(Date.now()).slice(-4)}F`;
  const ACCOUNT = `5001${String(Date.now()).slice(-8)}`;
  const kyc = { businessName: business, businessType: 'business', city: 'Kolkata', address: '12 Market Road', pan: PAN, aadhaar: AADHAAR, bankAccountHolder: vName, bankAccountNumber: ACCOUNT, bankIfsc: 'SBIN0001234', bankName: 'SBI', panPhoto: docs[0], aadhaarFront: docs[1], aadhaarBack: docs[2], consent: true };
  const sub = await expect('submit KYC', 200, 'PUT', '/vendor/kyc', { token: V, body: kyc });
  ok('KYC pending', sub?.kycStatus === 'pending', sub);
  const ov1 = await expect('', 200, 'GET', '/platform/overview', { token: T });
  ok('pendingKyc badge +1 and vendors +1', ov1.counts.pendingKyc === ov0.counts.pendingKyc + 1 && ov1.counts.vendors === ov0.counts.vendors + 1, { before: ov0.counts, after: ov1.counts });
  const pend = await expect('vendors: pending', 200, 'GET', '/platform/vendors?kycStatus=pending&limit=100', { token: T });
  ok('pending tab lists the vendor with submittedAt + business', pend.items?.some((x) => x._id === vId && x.submittedAt && x.businessName === business && x.city === 'Kolkata'), pend.items?.length);
  ok('pending tab has only pending', pend.items?.every((x) => x.kycStatus === 'pending'), pend.items?.map((x) => x.kycStatus));
  const byBiz = await expect('search by business', 200, 'GET', `/platform/vendors?q=${encodeURIComponent(business)}`, { token: T });
  ok('search by business name', byBiz.total === 1 && byBiz.items[0]._id === vId, byBiz.total);
  const byPhone = await expect('search by mobile', 200, 'GET', `/platform/vendors?q=${vPhone}`, { token: T });
  ok('search by mobile', byPhone.total === 1 && byPhone.items[0]._id === vId, byPhone.total);
  const all = await expect('vendors: all', 200, 'GET', `/platform/vendors?q=${encodeURIComponent(vName)}`, { token: T });
  ok('no status = all', all.items?.some((x) => x._id === vId), all.total);

  const d1 = await expect('vendor detail after KYC', 200, 'GET', `/platform/vendors/${vId}`, { token: T });
  const p1 = d1?.profile || {};
  const d1txt = JSON.stringify(d1 || {});
  ok('KYC masked in detail', p1.pan?.endsWith(PAN.slice(-4)) && p1.pan.includes('•') && p1.aadhaar === `XXXX XXXX ${AADHAAR.slice(-4)}` && p1.bankAccount?.endsWith(ACCOUNT.slice(-4)) && !d1txt.includes(PAN) && !d1txt.includes(AADHAAR) && !d1txt.includes(ACCOUNT) && !d1txt.includes(vPhone), p1);
  ok('business + bank fields', p1.businessName === business && p1.businessType === 'business' && p1.address && p1.bankIfsc === 'SBIN0001234' && p1.bankName === 'SBI' && p1.bankAccountHolder === vName && p1.submittedAt && p1.consentAt, p1);
  const docLinks = ['panPhoto', 'aadhaarFront', 'aadhaarBack'].map((k) => p1.documents?.[k]);
  ok('3 documents as signed links with mimeType', docLinks.every((x) => x?.url?.includes('sig=') && x.mimeType === 'image/png'), docLinks);
  const docRes = await fetch(docLinks[0].url.replace(/^https?:\/\/[^/]+/, BASE));
  ok('signed document link opens', docRes.status === 200, docRes.status);
  const unsigned = await fetch(`${BASE}${new URL(docLinks[0].url).pathname}`);
  ok('document is private without the signature', unsigned.status === 403, unsigned.status);

  await expect('reveal needs a reason', 400, 'POST', `/platform/vendors/${vId}/reveal`, { token: T, body: {} });
  const rev = await expect('reveal', 200, 'POST', `/platform/vendors/${vId}/reveal`, { token: T, body: { reason: 'Match PAN against the card photo' } });
  ok('reveal returns decrypted PAN / Aadhaar / account / phone', rev?.pan === PAN && rev.aadhaar === AADHAAR && rev.bankAccountNumber === ACCOUNT && rev.phone === vPhone, rev && Object.keys(rev));
  const log = await expect('', 200, 'GET', '/platform/audit-logs?limit=20', { token: T });
  ok('reveal audited with the reason (privacy.kyc_reveal)', log.items?.some((a) => a.action === 'privacy.kyc_reveal' && a.targetId === vId && /PAN against/.test(a.summary || '')), log.items?.slice(0, 3).map((a) => a.action));

  await expect('reject needs a note', 400, 'POST', `/platform/vendors/${vId}/kyc`, { token: T, body: { decision: 'rejected' } });
  await expect('bad decision', 400, 'POST', `/platform/vendors/${vId}/kyc`, { token: T, body: { decision: 'maybe' } });
  const rej = await expect('reject', 200, 'POST', `/platform/vendors/${vId}/kyc`, { token: T, body: { decision: 'rejected', note: 'Aadhaar back photo is blurred' } });
  ok('rejected with note + reviewedAt', rej?.kycStatus === 'rejected' && rej.kycNote === 'Aadhaar back photo is blurred' && rej.reviewedAt, rej);
  await expect('reject twice', 409, 'POST', `/platform/vendors/${vId}/kyc`, { token: T, body: { decision: 'rejected', note: 'again' } });
  const rejList = await expect('vendors: rejected', 200, 'GET', '/platform/vendors?kycStatus=rejected&limit=100', { token: T });
  ok('rejected tab lists the vendor', rejList.items?.some((x) => x._id === vId), rejList.total);
  const ovR = await expect('', 200, 'GET', '/platform/overview', { token: T });
  ok('pendingKyc badge back down after the decision', ovR.counts.pendingKyc === ov0.counts.pendingKyc, ovR.counts);
  const propBody = { listingType: 'rent', propertyType: 'apartment', title: `2BHK near lake ${RUN}`, description: 'Sunny flat, 2 balconies', pricePaise: 2500000, bedrooms: 2, bathrooms: 2, areaSqft: 950, city: 'Kolkata', locality: 'Salt Lake', contactPhone: vPhone };
  const early = await call('POST', '/properties', { token: V, body: propBody });
  ok('rejected vendor cannot list (403 KYC_REQUIRED)', early.status === 403 && early.json?.error?.code === 'KYC_REQUIRED', early);
  const memberList = await call('POST', '/properties', { token: MT, body: propBody });
  ok('member cannot list a property (403 VENDOR_ONLY)', memberList.status === 403 && memberList.json?.error?.code === 'VENDOR_ONLY', memberList);
  const appr = await expect('approve after rejection', 200, 'POST', `/platform/vendors/${vId}/kyc`, { token: T, body: { decision: 'approved', note: 'New photo is clear' } });
  ok('KYC approved', appr?.kycStatus === 'approved', appr);
  await expect('approve twice', 409, 'POST', `/platform/vendors/${vId}/kyc`, { token: T, body: { decision: 'approved' } });
  const apprList = await expect('vendors: approved', 200, 'GET', '/platform/vendors?kycStatus=approved&limit=100', { token: T });
  ok('approved tab lists the vendor', apprList.items?.some((x) => x._id === vId), apprList.total);

  head('Vendor listings (platform-moderated)');
  const photo = (await upload(V, 'property')).json?._id;
  const prop = await expect('vendor lists a property', 201, 'POST', '/properties', { token: V, body: { ...propBody, photos: [photo] } });
  ok('vendor property has no society', prop && !prop.society, prop?.society);
  const cats = await expect('', 200, 'GET', '/service-offers/categories', { token: V });
  const svcBody = { categoryId: cats.items?.[0]?._id, title: `AC Service & Repair ${RUN}`, description: 'Split and window AC', priceType: 'starting_from', pricePaise: 49900, experienceYears: 6, serviceArea: 'Salt Lake', city: 'Kolkata', contactPhone: vPhone };
  const svc = await expect('vendor lists a service', 201, 'POST', '/service-offers', { token: V, body: svcBody });
  if (prop?.moderationStatus === 'pending') {
    const q = await expect('', 200, 'GET', '/platform/listings?kind=property&status=pending&scope=independent&limit=100', { token: T });
    ok('vendor property waits in platform moderation', q.items?.some((l) => l._id === prop._id && !l.society), q.total);
    await expect('approve property', 200, 'POST', `/platform/listings/property/${prop._id}/moderate`, { token: T, body: { decision: 'approved' } });
  }
  if (svc?.moderationStatus === 'pending') await expect('approve service', 200, 'POST', `/platform/listings/service/${svc._id}/moderate`, { token: T, body: { decision: 'approved' } });
  const d2 = await expect('', 200, 'GET', `/platform/vendors/${vId}`, { token: T });
  ok('vendor counts: 1 property, 1 service', d2.counts?.properties === 1 && d2.counts?.services === 1, d2.counts);

  head('Ads (boosts) review');
  await expect('boost for a duration the admin does not offer → 400', 400, 'POST', '/vendor/ads', { token: V, body: { kind: 'property', listingId: prop._id, city: 'Kolkata', days: 5 } });
  const ad1 = await expect('vendor requests a property boost', 201, 'POST', '/vendor/ads', { token: V, body: { kind: 'property', listingId: prop._id, city: 'Kolkata', area: 'Salt Lake', days: 7 } });
  const ovA = await expect('', 200, 'GET', '/platform/overview', { token: T });
  ok('pendingAds badge +1', ovA.counts.pendingAds === ov0.counts.pendingAds + 1, ovA.counts);
  const pendAds = await expect('ads: default = pending', 200, 'GET', '/platform/ads?limit=100', { token: T });
  const row = pendAds.items?.find((a) => a._id === ad1._id);
  ok('pending list item: listing photo + title, vendor, location, days', isPaged(pendAds) && row && row.kind === 'property' && row.listing?.title === propBody.title && row.listing?.photo?.url && row.vendor?._id === vId && row.vendor?.name === vName && row.city === 'Kolkata' && row.area === 'Salt Lake' && row.days === 7 && row.status === 'pending' && row.createdAt && row.startsAt === null, row);
  const svcOnly = await expect('ads: kind=service', 200, 'GET', '/platform/ads?status=pending&kind=service&limit=100', { token: T });
  ok('kind filter excludes the property ad', !svcOnly.items?.some((a) => a._id === ad1._id) && svcOnly.items.every((a) => a.kind === 'service'), svcOnly.items?.length);
  const det = await expect('ad detail', 200, 'GET', `/platform/ads/${ad1._id}`, { token: T });
  ok('detail: full listing with photos and fields', det?.listingDetail?.title === propBody.title && det.listingDetail.photos?.[0]?.url && det.listingDetail.description === propBody.description && det.listingDetail.pricePaise === propBody.pricePaise && det.listingDetail.bedrooms === 2, det?.listingDetail);
  ok('detail: vendor with KYC status + masked phone + business', det?.vendor?.kycStatus === 'approved' && isMasked(det.vendor.phone) && det.vendor.businessName === business && det.vendor._id === vId, det?.vendor);
  ok('detail: no unmasked vendor phone anywhere except listing contact', !JSON.stringify(det.vendor).includes(vPhone), det?.vendor);
  await expect('unknown ad', 404, 'GET', '/platform/ads/5f0000000000000000000000', { token: T });
  await expect('member → ads', 403, 'GET', '/platform/ads', { token: MT });
  await expect('reject needs a note', 400, 'POST', `/platform/ads/${ad1._id}/review`, { token: T, body: { decision: 'rejected' } });
  const okAd = await expect('approve ad', 200, 'POST', `/platform/ads/${ad1._id}/review`, { token: T, body: { decision: 'approved' } });
  ok('approved ad is active for exactly 7 days from now', okAd?.status === 'active' && Math.round((new Date(okAd.endsAt) - new Date(okAd.startsAt)) / 86_400_000) === 7 && Math.abs(new Date(okAd.startsAt) - Date.now()) < 60_000, okAd);
  await expect('approve twice', 409, 'POST', `/platform/ads/${ad1._id}/review`, { token: T, body: { decision: 'approved' } });
  const act = await expect('ads: active', 200, 'GET', '/platform/ads?status=active&limit=100', { token: T });
  ok('active tab lists it with start/end', act.items?.some((a) => a._id === ad1._id && a.startsAt && a.endsAt), act.total);
  const pend2 = await expect('', 200, 'GET', '/platform/ads?status=pending&limit=100', { token: T });
  ok('no longer pending', !pend2.items?.some((a) => a._id === ad1._id), pend2.total);
  const browse = await expect('', 200, 'GET', '/properties?city=Kolkata', { token: MT });
  const at = browse.items?.findIndex((l) => l._id === prop._id) ?? -1;
  const firstOrganic = browse.items?.findIndex((l) => !l.sponsored) ?? -1;
  ok('approved ad is in the sponsored block at the top, marked sponsored', at >= 0 && browse.items[at].sponsored === true && (firstOrganic === -1 || at < firstOrganic) && browse.sponsoredCount >= 1, browse.items?.slice(0, 4).map((l) => [l.title, l.sponsored]));

  const ad2 = await expect('vendor requests a service boost', 201, 'POST', '/vendor/ads', { token: V, body: { kind: 'service', listingId: svc._id, city: 'Kolkata', days: 3 } });
  const svcPend = await expect('', 200, 'GET', '/platform/ads?status=pending&kind=service&limit=100', { token: T });
  ok('kind=service lists the service ad', svcPend.items?.some((a) => a._id === ad2._id && a.kind === 'service' && a.area === null), svcPend.total);
  const det2 = await expect('service ad detail', 200, 'GET', `/platform/ads/${ad2._id}`, { token: T });
  ok('service detail has category + pricing', det2?.listingDetail?.category?.name && det2.listingDetail.priceType === 'starting_from', det2?.listingDetail);
  const rj = await expect('reject ad with note', 200, 'POST', `/platform/ads/${ad2._id}/review`, { token: T, body: { decision: 'rejected', note: 'Add a photo of your work' } });
  ok('rejected with review note', rj?.status === 'rejected' && rj.reviewNote === 'Add a photo of your work', rj);
  await expect('decide a rejected ad', 409, 'POST', `/platform/ads/${ad2._id}/review`, { token: T, body: { decision: 'approved' } });
  const rjList = await expect('ads: rejected', 200, 'GET', '/platform/ads?status=rejected&limit=100', { token: T });
  ok('rejected tab lists it with the note', rjList.items?.some((a) => a._id === ad2._id && a.reviewNote), rjList.total);

  const ad3 = await expect('boost again after rejection', 201, 'POST', '/vendor/ads', { token: V, body: { kind: 'service', listingId: svc._id, city: 'Kolkata', days: 15 } });
  await expect('vendor pauses the service', 200, 'PATCH', `/service-offers/${svc._id}`, { token: V, body: { status: 'paused' } });
  const notLive = await call('POST', `/platform/ads/${ad3._id}/review`, { token: T, body: { decision: 'approved' } });
  ok('approving an ad whose listing went off-line → 409 LISTING_NOT_LIVE', notLive.status === 409 && notLive.json?.error?.code === 'LISTING_NOT_LIVE', notLive);
  await expect('reject it instead', 200, 'POST', `/platform/ads/${ad3._id}/review`, { token: T, body: { decision: 'rejected', note: 'Service is paused' } });

  await expect('vendor stops the running ad', 200, 'POST', `/vendor/ads/${ad1._id}/cancel`, { token: V });
  const can = await expect('ads: cancelled', 200, 'GET', '/platform/ads?status=cancelled&limit=100', { token: T });
  ok('cancelled tab lists the stopped ad', can.items?.some((a) => a._id === ad1._id && a.status === 'cancelled'), can.total);
  const allAds = await expect('ads: all', 200, 'GET', '/platform/ads?status=all&limit=100', { token: T });
  ok('all tab lists every ad of this run with its status', [ad1._id, ad2._id, ad3._id].every((id) => allAds.items?.some((a) => a._id === id)) && allAds.items.every((a) => ['pending', 'active', 'expired', 'rejected', 'cancelled'].includes(a.status)), allAds.total);
  const exp = await expect('ads: expired', 200, 'GET', '/platform/ads?status=expired&limit=100', { token: T });
  ok('expired tab is a paged list of expired ads (stopped ads are cancelled, not expired)', isPaged(exp) && !exp.items.some((a) => a._id === ad1._id) && exp.items.every((a) => a.status === 'expired'), exp.items?.map((a) => a.status));
  const ovZ = await expect('', 200, 'GET', '/platform/overview', { token: T });
  ok('pendingAds badge back to where it started', ovZ.counts.pendingAds === ov0.counts.pendingAds, ovZ.counts);
  const d3 = await expect('', 200, 'GET', `/platform/vendors/${vId}`, { token: T });
  ok('vendor detail counts 3 ads', d3.counts?.ads === 3, d3.counts);
  const log2 = await expect('', 200, 'GET', '/platform/audit-logs?limit=40', { token: T });
  ok('KYC and ad decisions audited', ['platform.vendor_kyc_approved', 'platform.vendor_kyc_rejected', 'platform.ad_approved', 'platform.ad_rejected'].every((a) => log2.items?.some((x) => x.action === a)), log2.items?.map((a) => a.action).slice(0, 12));
}

async function main() {
  console.log(`Master Admin API check against ${API} (run ${RUN})`);

  // ------------------------------------------------------------------ owner sign-in
  head('Owner sign-in');
  await expect('wrong password', 401, 'POST', '/auth/admin/login', { body: { ...SA, password: 'Wrong-pass-123' } });
  const login = await superAdminLogin(API, SA.email, SA.password);
  ok('email + password issue a panel session for the owner', login.status === 200 && login.body?.accessToken && login.body?.refreshToken && login.body?.user?.platformRole === 'super_admin', login);
  await expect('two-step endpoints are gone', 404, 'POST', '/auth/2fa/verify', { body: {} });
  const T = login.body.accessToken;
  await expect('', 200, 'GET', '/platform/overview', { token: T });

  // ------------------------------------------------------------------ seed a society
  head('Seed: society, flats, residents');
  const repEmail = `master.rep.${RUN.toLowerCase()}@example.com`;
  const reg = await expect('application', 201, 'POST', '/public/society-registrations', {
    body: {
      societyName: `Master Check ${RUN}`,
      addressLine: '1 Test Road, Near Park',
      city: 'Kolkata',
      state: 'West Bengal',
      pincode: '700091',
      phone: '3322345678',
      email: `office.${RUN.toLowerCase()}@example.com`,
      representative: { name: 'Rina Das', phone: randPhone(), email: repEmail },
      documents: [],
      submit: true,
    },
  });
  const queue = await expect('', 200, 'GET', `/platform/society-registrations?q=${reg.referenceCode}`, { token: T });
  const appr = await expect('approve', 200, 'POST', `/platform/society-registrations/${queue.items[0]._id}/approve`, { token: T, body: {} });
  const sid = appr.society._id;
  await expect('activate admin', 200, 'POST', '/public/society-registrations/activate', { body: { referenceCode: reg.referenceCode, accessKey: reg.accessKey, password: PASSWORD } });
  const adm = await expect('society admin login (no 2FA for society staff)', 200, 'POST', '/auth/admin/login', { body: { email: repEmail, password: PASSWORD } });
  ok('society admin gets tokens', Boolean(adm?.accessToken), adm);
  const AT = adm.accessToken;
  const bA = await expect('building', 201, 'POST', '/society/buildings', { token: AT, body: { name: 'Block A', floors: 2 } });
  await expect('flats', 201, 'POST', '/society/flats/bulk', { token: AT, body: { buildingId: bA._id, fromFloor: 1, toFloor: 2, unitsPerFloor: 2, pattern: '{building}-{floor}{unit}', areaSqft: 900 } });
  const flats = await expect('', 200, 'GET', `/society/flats?buildingId=${bA._id}&limit=50`, { token: AT });
  const flatNo = (n) => flats.items.find((f) => f.number.endsWith(n));
  ok('4 flats created', flats.items.length === 4, flats.items.map((f) => f.number));
  const p1 = randPhone();
  const p2 = randPhone();
  const r1 = await expect('resident 1', 201, 'POST', '/auth/resident/register', { body: { phone: p1, name: 'Arjun Sen', password: PASSWORD } });
  const r2 = await expect('resident 2', 201, 'POST', '/auth/resident/register', { body: { phone: p2, name: 'Mitali Roy', password: PASSWORD } });
  const m1 = await expect('join 1', 201, 'POST', '/memberships', { token: r1.accessToken, body: { societyId: sid, buildingId: bA._id, flatNumber: flatNo('101').number, residentType: 'owner' } });
  const m2 = await expect('join 2', 201, 'POST', '/memberships', { token: r2.accessToken, body: { societyId: sid, buildingId: bA._id, flatNumber: flatNo('102').number, residentType: 'tenant' } });

  // ------------------------------------------------------------------ access control
  head('Only the owner reaches /platform');
  await expect('society admin → platform', 403, 'GET', '/platform/members', { token: AT });
  await expect('society admin → workspace bridge', 403, 'GET', `/platform/societies/${sid}/manage/overview`, { token: AT });
  await expect('resident → platform', 403, 'GET', '/platform/overview', { token: r1.accessToken });
  await expect('no token', 401, 'GET', `/platform/societies/${sid}/manage/overview`);

  // ------------------------------------------------------------------ workspace bridge
  head('Society workspace bridge');
  const M = `/platform/societies/${sid}/manage`;
  const ov = await expect('overview', 200, 'GET', `${M}/overview`, { token: T });
  ok('overview is for the chosen society', ov?.society?._id === sid && ov?.counts?.pendingMembers === 2, ov?.society);
  await expect('unknown society', 404, 'GET', `/platform/societies/5f0000000000000000000000/manage/overview`, { token: T });
  await expect('bad society id', 400, 'GET', `/platform/societies/nope/manage/overview`, { token: T });
  const pend = await expect('pending memberships', 200, 'GET', `${M}/memberships?status=pending`, { token: T });
  const row = pend.items?.find((m) => m._id === m1._id);
  ok('member phone is masked in workspace lists', isMasked(row?.user?.phone) && !String(row?.user?.phone).includes(p1.slice(2, 8)), row?.user);
  await expect('write without a reason', 400, 'POST', `${M}/memberships/${m1._id}/approve`, { token: T, body: {} });
  const noReason = await call('POST', `${M}/memberships/${m1._id}/approve`, { token: T, body: {} });
  ok('error code REASON_REQUIRED', noReason.json?.error?.code === 'REASON_REQUIRED', noReason.json);
  await expect('approve with reason', 200, 'POST', `${M}/memberships/${m1._id}/approve`, { token: T, body: {}, reason: 'Admin on leave — approved on request (test)' });
  await expect('approve 2 (reason with unicode)', 200, 'POST', `${M}/memberships/${m2._id}/approve`, { token: T, body: {}, reason: 'Verified — résident docs ✓' });
  await expect('same state machine: cannot approve twice', 400, 'POST', `${M}/memberships/${m1._id}/approve`, { token: T, body: {}, reason: 'again' });
  const b2 = await expect('create building via bridge', 201, 'POST', `${M}/buildings`, { token: T, body: { name: 'Block B', floors: 1 }, reason: 'Missing block reported by society' });
  await expect('flat in block B', 201, 'POST', `${M}/flats`, { token: T, body: { buildingId: b2._id, number: 'B-001', floor: 0 }, reason: 'Adding ground-floor unit' });
  const audit = await expect('society audit', 200, 'GET', `${M}/audit-logs?limit=50`, { token: T });
  const bridgeEntry = audit.items?.find((a) => a.action === 'platform.society_action' && /Admin on leave/.test(a.summary || ''));
  ok('bridge write logged with the reason', bridgeEntry && /memberships\/.+\/approve/.test(bridgeEntry.summary), audit.items?.slice(0, 3));
  const approveEntry = audit.items?.find((a) => a.action === 'membership.approve' && a.actorRole === 'super_admin');
  ok('handler audit records the owner as actor (super_admin)', Boolean(approveEntry), audit.items?.map((a) => [a.action, a.actorRole]).slice(0, 6));
  const unicodeEntry = audit.items?.find((a) => a.action === 'platform.society_action' && a.summary?.includes('résident docs ✓'));
  ok('non-ASCII reason stored intact', Boolean(unicodeEntry), audit.items?.filter((a) => a.action === 'platform.society_action').map((a) => a.summary));
  const staff = await expect('', 200, 'GET', `${M}/staff`, { token: T });
  ok('staff emails masked', staff.items?.length && staff.items.every((s) => !s.user?.email || isMasked(s.user.email)), staff.items?.[0]?.user);
  const adminSee = await expect('society admin still sees full data in their own panel', 200, 'GET', '/society/memberships?status=approved', { token: AT });
  ok('no masking for the society admin', adminSee.items?.some((m) => m.user?.phone === p1), adminSee.items?.map((m) => m.user?.phone));

  // ------------------------------------------------------------------ members directory
  head('Members directory & accounts');
  const dir = await expect('', 200, 'GET', `/platform/members?societyId=${sid}`, { token: T });
  ok('paged, 2 members, populated + masked', isPaged(dir) && dir.total === 2 && dir.items.every((m) => m.society?.name && m.flat?.number && isMasked(m.user?.phone)), dir.items?.[0]);
  const byName = await expect('search by name', 200, 'GET', `/platform/members?q=arjun&societyId=${sid}`, { token: T });
  ok('search by name finds Arjun', byName.total === 1 && byName.items[0].user?.name === 'Arjun Sen', byName.items?.map((m) => m.user?.name));
  const byPhone = await expect('search by full mobile', 200, 'GET', `/platform/members?q=${p2}`, { token: T });
  ok('search by mobile finds Mitali (still masked in result)', byPhone.total === 1 && isMasked(byPhone.items[0].user?.phone), byPhone.items?.[0]?.user);
  const byFlat = await expect('search by flat number', 200, 'GET', `/platform/members?q=${flatNo('102').number}&societyId=${sid}`, { token: T });
  ok('search by flat finds the tenant', byFlat.total === 1 && byFlat.items[0].residentType === 'tenant', byFlat.items?.length);
  const tenants = await expect('filter by type', 200, 'GET', `/platform/members?societyId=${sid}&residentType=tenant&status=approved`, { token: T });
  ok('type + status filter', tenants.total === 1, tenants.total);
  const users = await expect('', 200, 'GET', `/platform/users?q=${p1}`, { token: T });
  ok('accounts list masks phone', users.items?.length === 1 && isMasked(users.items[0].phone), users.items?.[0]);

  // ------------------------------------------------------------------ profile + reveal
  head('Member profile & logged reveal');
  const u1 = r1.user._id;
  const prof = await expect('', 200, 'GET', `/platform/users/${u1}/profile`, { token: T });
  ok('profile has every section', ['user', 'memberships', 'occupancies', 'staff', 'sessions', 'complaints', 'payments', 'invoices', 'bookings', 'counts', 'notifications', 'audit'].every((k) => k in (prof || {})), prof && Object.keys(prof));
  ok('profile phone masked', isMasked(prof?.user?.phone), prof?.user);
  ok('profile counts include services', typeof prof?.counts?.serviceOffers === 'number', prof?.counts);
  ok('profile hides secrets', prof?.user && !('passwordHash' in prof.user), prof?.user && Object.keys(prof.user));
  ok('membership approved, occupancy recorded, session listed', prof?.memberships?.[0]?.status === 'approved' && prof.occupancies?.length === 1 && prof.sessions?.length >= 1, { m: prof?.memberships?.[0]?.status, o: prof?.occupancies?.length, s: prof?.sessions?.length });
  await expect('reveal needs a reason', 400, 'POST', `/platform/users/${u1}/reveal`, { token: T, body: {} });
  const rev = await expect('reveal', 200, 'POST', `/platform/users/${u1}/reveal`, { token: T, body: { reason: 'Calling resident about flat transfer' } });
  ok('reveal returns the real number', rev?.phone === p1, rev);
  const revLog = await expect('', 200, 'GET', '/platform/audit-logs?limit=20', { token: T });
  ok('reveal is in the audit log with the reason', revLog.items?.some((a) => a.action === 'privacy.reveal' && a.targetId === u1 && /flat transfer/.test(a.summary)), revLog.items?.slice(0, 3).map((a) => a.action));
  await expect('unknown user', 404, 'GET', '/platform/users/5f0000000000000000000000/profile', { token: T });

  // ------------------------------------------------------------------ owner actions
  head('Owner actions on a member');
  await expect('weak password', 400, 'POST', `/platform/users/${u1}/password`, { token: T, body: { password: 'short', reason: 'Resident forgot password' } });
  await expect('password needs a reason', 400, 'POST', `/platform/users/${u1}/password`, { token: T, body: { password: 'NewPass2026x' } });
  await expect('set password', 200, 'POST', `/platform/users/${u1}/password`, { token: T, body: { password: 'NewPass2026x', reason: 'Resident forgot password (helpline)' } });
  await expect('old session ended', 401, 'GET', '/me', { token: r1.accessToken });
  await expect('old password refused', 401, 'POST', '/auth/resident/login', { body: { phone: p1, password: PASSWORD } });
  const r1b = await expect('new password works', 200, 'POST', '/auth/resident/login', { body: { phone: p1, password: 'NewPass2026x' } });
  await expect('sign-out-all needs a reason', 400, 'POST', `/platform/users/${u1}/sign-out-all`, { token: T, body: {} });
  const so = await expect('sign out everywhere', 200, 'POST', `/platform/users/${u1}/sign-out-all`, { token: T, body: { reason: 'Lost phone reported' } });
  ok('sessionsEnded ≥ 1', so?.sessionsEnded >= 1, so);
  await expect('session ended', 401, 'GET', '/me', { token: r1b.accessToken });
  await expect('invalid new mobile', 400, 'POST', `/platform/users/${u1}/phone`, { token: T, body: { phone: '12345', reason: 'Typo at sign-up' } });
  await expect('mobile used by another account', 409, 'POST', `/platform/users/${u1}/phone`, { token: T, body: { phone: p2, reason: 'Typo at sign-up' } });
  const p1new = randPhone();
  await expect('change mobile', 200, 'POST', `/platform/users/${u1}/phone`, { token: T, body: { phone: p1new, reason: 'Typo at sign-up, verified in person' } });
  await expect('sign in with new mobile', 200, 'POST', '/auth/resident/login', { body: { phone: p1new, password: 'NewPass2026x' } });
  const otherSociety = await expect('', 200, 'GET', '/platform/societies?limit=100', { token: T });
  const foreignFlat = await (async () => {
    const other = otherSociety.items?.find((s) => s._id !== sid);
    if (!other) return null;
    const f = await call('GET', `/platform/societies/${other._id}/manage/flats?limit=1`, { token: T });
    return f.json?.items?.[0]?._id || null;
  })();
  if (foreignFlat) await expect('cannot move into another society’s flat', 400, 'POST', `/platform/memberships/${m1._id}/move`, { token: T, body: { flatId: foreignFlat, reason: 'Wrong flat' } });
  await expect('move needs a reason', 400, 'POST', `/platform/memberships/${m1._id}/move`, { token: T, body: { flatId: flatNo('201')._id } });
  const mv = await expect('move to 201', 200, 'POST', `/platform/memberships/${m1._id}/move`, { token: T, body: { flatId: flatNo('201')._id, reason: 'Resident registered the wrong flat' } });
  ok('moved', mv?.flat === flatNo('201')._id, mv);
  const prof2 = await expect('', 200, 'GET', `/platform/users/${u1}/profile`, { token: T });
  ok('profile shows new flat and closed old occupancy', prof2.memberships[0].flat?.number === flatNo('201').number && prof2.occupancies.filter((o) => o.active).length === 1 && prof2.occupancies.length === 2, prof2.occupancies);
  ok('owner actions in the member’s audit trail', ['user.password_set_by_admin', 'user.signed_out_everywhere', 'user.phone_changed', 'membership.moved', 'privacy.reveal'].every((a) => prof2.audit.some((x) => x.action === a)), prof2.audit.map((a) => a.action));
  const phoneLog = prof2.audit.find((a) => a.action === 'user.phone_changed');
  ok('phone change log keeps numbers masked', phoneLog && isMasked(phoneLog.changes?.from) && isMasked(phoneLog.changes?.to), phoneLog?.changes);
  const ownerId = login.body.user._id;
  await expect('cannot target own account', 403, 'POST', `/platform/users/${ownerId}/password`, { token: T, body: { password: 'Another2026x', reason: 'test' } });
  await expect('decide via bridge: suspend needs reason (body)', 400, 'POST', `${M}/memberships/${m2._id}/suspend`, { token: T, body: {}, reason: 'header only' });
  await expect('suspend via bridge', 200, 'POST', `${M}/memberships/${m2._id}/suspend`, { token: T, body: { reason: 'Unpaid dues dispute' }, reason: 'Unpaid dues dispute' });

  await vendorsAndAds(T, { AT, MT: r2.accessToken });

  // ------------------------------------------------------------------ insights
  head('Dashboard insights');
  const ins = await expect('', 200, 'GET', '/platform/overview/insights', { token: T });
  ok('6 months + trend series', ins?.months?.length === 6 && ['newResidents', 'complaintsOpened', 'complaintsResolved', 'billedPaise', 'collectedPaise'].every((k) => ins.trends?.[k]?.length === 6), ins?.trends);
  ok('attention + top lists', Array.isArray(ins?.attention?.staleApplications) && Array.isArray(ins?.attention?.societiesWithoutAdmin) && Array.isArray(ins?.top?.bySize), ins && Object.keys(ins));
  ok('this run’s residents counted this month', ins.trends.newResidents[5] >= 2, ins.trends.newResidents);

  // ------------------------------------------------------------------ owner security
  head('Owner security');
  await expect('wrong current password', 400, 'POST', '/me/password', { token: T, body: { currentPassword: 'nope-nope-1', newPassword: 'Owner2026change' } });
  await expect('weak new password', 400, 'POST', '/me/password', { token: T, body: { currentPassword: SA.password, newPassword: 'aaaaaaaaaaaa' } });
  await expect('change own password', 200, 'POST', '/me/password', { token: T, body: { currentPassword: SA.password, newPassword: 'Owner2026change' } });
  await expect('current session still works', 200, 'GET', '/platform/overview', { token: T });
  await expect('change it back', 200, 'POST', '/me/password', { token: T, body: { currentPassword: 'Owner2026change', newPassword: SA.password } });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n\x1b[1mmaster api-check: ${results.length - failed.length}/${results.length} passed\x1b[0m`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  [${f.section}] ${f.name} → ${typeof f.detail === 'string' ? f.detail : JSON.stringify(f.detail)}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
