#!/usr/bin/env node
/**
 * Cashfree payments + Easy Split checks (skills/cashfree-payments) against a LOCAL backend only, with a FAKE Cashfree
 * gateway on 127.0.0.1:3099 (start the API with the API pointed at http://127.0.0.1:3099/pg with provider cashfree,
 * test app id TEST_APP_ID and the test secret below — see scratch start script). No real gateway, no real money.
 *
 * Covers: config (sandbox mode), vendor payout account (missing email → failed, create → pending → active, secrets
 * never returned), product order online (split = vendor share, paid only after Cashfree says PAID, webhook signature
 * good/bad/duplicate, cancel → refund with refund_splits), amount mismatch, service booking online pay, maintenance
 * invoice + facility fee (society split, receipt, ledger, staff cancel → refund), hosted checkout page token.
 *
 *   cd Adda_App && npm run payments-check
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const [BASE = 'http://localhost:3013', SA_EMAIL = 'admin@addaapp.local', SA_PASSWORD = 'DevAdmin12345'] = process.argv.slice(2);
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(BASE)) {
  console.error('Refusing to run: payments-check only targets a local backend.');
  process.exit(2);
}
const SECRET = process.env.CF_TEST_SECRET || 'test_secret_local_only_1234567890';
const ROOT = BASE.replace(/\/$/, '');
const API = `${ROOT}/api/v1`;
const RUN = Date.now().toString(36).slice(-5);
let passed = 0;
const failed = [];
function check(name, ok, detail) {
  const d = detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)?.slice(0, 300)}`;
  if (ok) passed++;
  else failed.push(name + d);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : d}`);
  return ok;
}
async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, body: json };
}
const code = (r) => r.body?.error?.code;

// ---------------------------------------------------------------- fake Cashfree gateway
const gw = { orders: new Map(), vendors: new Map(), refunds: [], docs: [], vendorStatus: 'IN_BENE_CREATION', refundStatus: 'SUCCESS', calls: [] };
const fake = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const multipart = /multipart\/form-data/.test(req.headers['content-type'] || '');
  const body = raw && !multipart ? JSON.parse(raw) : null;
  const send = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  gw.calls.push({ method: req.method, url: req.url, headers: req.headers, body, multipart, raw: multipart ? raw : undefined });
  if (req.headers['x-client-id'] !== 'TEST_APP_ID' || req.headers['x-client-secret'] !== SECRET || !req.headers['x-api-version']) return send(401, { message: 'authentication failed', code: 'request_failed' });
  const u = new URL(req.url, 'http://x');
  const m = u.pathname.match(/^\/pg\/orders\/([^/]+)(?:\/(payments|refunds))?(?:\/([^/]+))?$/);
  if (req.method === 'POST' && u.pathname === '/pg/orders') {
    if (gw.orders.has(body.order_id)) return send(409, { message: 'order_id already exists' });
    gw.orders.set(body.order_id, { ...body, order_status: 'ACTIVE', payments: [] });
    return send(200, { order_id: body.order_id, order_amount: body.order_amount, order_status: 'ACTIVE', payment_session_id: `session_${body.order_id}` });
  }
  if (m && req.method === 'GET' && !m[2]) {
    const o = gw.orders.get(m[1]);
    return o ? send(200, { order_id: o.order_id, order_amount: o.order_amount, order_status: o.order_status }) : send(404, { message: 'order not found' });
  }
  if (m && req.method === 'GET' && m[2] === 'payments') return send(200, gw.orders.get(m[1])?.payments || []);
  if (m && req.method === 'POST' && m[2] === 'refunds') {
    gw.refunds.push({ orderId: m[1], ...body });
    return send(200, { refund_id: body.refund_id, order_id: m[1], refund_amount: body.refund_amount, refund_status: gw.refundStatus });
  }
  if (m && req.method === 'GET' && m[2] === 'refunds') return send(200, { refund_id: m[3], refund_status: gw.refundStatus });
  if (req.method === 'POST' && u.pathname === '/pg/easy-split/vendors') {
    // Same validation as live Cashfree (the bug that hit production: business_type missing).
    if (!body.kyc_details?.business_type) return send(400, { message: 'kyc_details.business_type : is missing in the request. Value received: ', code: 'kyc_details.business_type_missing' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email || '')) return send(400, { message: 'email: should be valid email.' });
    if (gw.vendors.has(body.vendor_id)) return send(409, { message: 'vendor already exists' });
    gw.vendors.set(body.vendor_id, { ...body, status: gw.vendorStatus });
    return send(200, { vendor_id: body.vendor_id, status: gw.vendorStatus });
  }
  const v = u.pathname.match(/^\/pg\/easy-split\/vendors\/([^/]+)$/);
  if (v && req.method === 'GET') {
    const x = gw.vendors.get(v[1]);
    return x ? send(200, { vendor_id: x.vendor_id, status: x.status, business_type: x.kyc_details?.business_type, related_docs: x.related_docs || [] }) : send(404, { message: 'vendor does not exist' });
  }
  if (v && req.method === 'PATCH') {
    const x = gw.vendors.get(v[1]);
    if (!x) return send(404, { message: 'vendor does not exist' });
    Object.assign(x, body, { kyc_details: { ...x.kyc_details, ...body.kyc_details } });
    return send(200, { vendor_id: x.vendor_id, status: x.status });
  }
  const vd = u.pathname.match(/^\/pg\/easy-split\/vendor-docs\/([^/]+)$/);
  if (vd && req.method === 'POST') {
    if (!multipart) return send(400, { message: 'multipart expected' });
    const docType = (raw.match(/name="doc_type"\r\n\r\n([^\r]*)/) || [])[1];
    const docValue = (raw.match(/name="doc_value"\r\n\r\n([^\r]*)/) || [])[1];
    if (!docType) return send(400, { message: 'doc_type : is missing in the request. Value received: ""', code: 'doc_type_missing' });
    if (!gw.vendors.has(vd[1])) return send(404, { message: 'vendor does not exist' });
    gw.docs.push({ vendorId: vd[1], docType, docValue, hasFile: /name="file"; filename=/.test(raw) });
    return send(200, { vendor_id: vd[1], doc_type: docType, doc_value: 'easySplit/vendorKycDocs/x.png', status: 'IN_REVIEW', remarks: null });
  }
  send(404, { message: 'not found' });
});
await new Promise((r) => fake.listen(3099, '127.0.0.1', r));
let paySeq = Number(String(Date.now()).slice(-9)) * 10;
/** The member "pays" on Cashfree: the order becomes PAID with one SUCCESS payment. */
function gatewayPays(orderId, { rupees, status = 'SUCCESS' } = {}) {
  const o = gw.orders.get(orderId);
  const amount = rupees ?? o.order_amount;
  o.payments.push({ cf_payment_id: ++paySeq, order_id: orderId, payment_amount: amount, payment_status: status, payment_group: 'upi', payment_message: status === 'SUCCESS' ? 'ok' : 'Insufficient funds' });
  if (status === 'SUCCESS') o.order_status = 'PAID';
}
function signedWebhook(payload, { badSig = false } = {}) {
  const raw = JSON.stringify(payload);
  const ts = String(Date.now());
  const sig = crypto.createHmac('sha256', SECRET).update(ts + raw).digest('base64');
  return fetch(`${API}/payments/webhook/cashfree`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-timestamp': ts, 'x-webhook-signature': badSig ? sig.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) : sig }, body: raw }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

// ---------------------------------------------------------------- helpers
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function upload(token, purpose) {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', new Blob([PNG], { type: 'image/png' }), `${purpose}.png`);
  const res = await fetch(`${API}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return res.json().catch(() => null);
}
const D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
const withVerhoeff = (b) => b + INV[b.split('').reverse().reduce((c, d, i) => D[c][P[(i + 1) % 8][Number(d)]], 0)];
const STAMP = Date.now();
const phoneFor = (n) => `7${String(STAMP + n * 15485863).slice(-9)}`;
const register = (n, name, accountType) => call('POST', '/auth/resident/register', { body: { phone: phoneFor(n), name, password: 'PayCheck12345', accountType } });
const ACCOUNT = `7001${String(STAMP).slice(-8)}`;
const PAN = `AXCPE${String(STAMP).slice(-4)}K`;

const owner = await call('POST', '/auth/admin/login', { body: { email: SA_EMAIL, password: SA_PASSWORD } });
if (owner.status !== 200) {
  console.error('Owner sign-in failed — create the local super admin first.');
  fake.close();
  process.exit(2);
}
const T = owner.body.accessToken;
try {
  // ---------------------------------------------------------------- config
  const cfg = await call('GET', '/public/config');
  check('config: Cashfree configured in sandbox (Test mode)', cfg.body?.payments?.gatewayConfigured === true && cfg.body.payments.provider === 'cashfree' && cfg.body.payments.mode === 'sandbox', cfg.body?.payments);
  check('config never exposes keys', !JSON.stringify(cfg.body).includes(SECRET) && !JSON.stringify(cfg.body).includes('TEST_APP_ID'));

  // ---------------------------------------------------------------- vendor payout account
  const vr = await register(1, `Pay vendor ${RUN}`, 'vendor');
  const V = vr.body.accessToken;
  const vId = vr.body.user._id;
  const docs = [await upload(V, 'kyc'), await upload(V, 'kyc'), await upload(V, 'kyc')].map((d) => d?._id);
  await call('PUT', '/vendor/kyc', { token: V, body: { businessName: `Fresh Mart ${RUN}`, businessType: 'individual', city: 'Nagpur', address: '4 Station Road', pan: PAN, aadhaar: withVerhoeff(`4${String(STAMP).slice(-10)}`), bankAccountHolder: 'Sanjay N', bankAccountNumber: ACCOUNT, bankIfsc: 'SBIN0004567', bankName: 'SBI', panPhoto: docs[0], aadhaarFront: docs[1], aadhaarBack: docs[2], consent: true } });
  const appr = await call('POST', `/platform/vendors/${vId}/kyc`, { token: T, body: { decision: 'approved' } });
  check('KYC approved', appr.status === 200);
  await new Promise((r) => setTimeout(r, 500));
  let pv = await call('GET', `/platform/vendors/${vId}`, { token: T });
  check('no email → payout account failed with a clear message', pv.body?.payout?.status === 'failed' && /email/i.test(pv.body.payout.message || ''), pv.body?.payout);
  check('platform vendor view: hasEmail false, no raw email', pv.body?.user?.hasEmail === false && pv.body.user.email === null, pv.body?.user);
  await call('PATCH', '/me', { token: V, body: { email: `vendor.${RUN}@example.com` } });
  // Line of business is required by Cashfree (kyc_details.business_type) — the production failure.
  const noLob = await call('POST', `/platform/vendors/${vId}/payout`, { token: T });
  check('no line of business → failed, nothing sent to Cashfree', noLob.body?.status === 'failed' && /line of business/i.test(noLob.body.message || '') && !gw.calls.some((c) => c.url === '/pg/easy-split/vendors' && c.method === 'POST'), noLob.body);
  const GSTIN = `27${PAN}1Z5`;
  const badLob = await call('PATCH', `/platform/vendors/${vId}/payout-details`, { token: T, body: { lineOfBusiness: 'NBFC' } });
  check('payout-details: unknown line of business → 400', badLob.status === 400, badLob.body);
  const badGst = await call('PATCH', `/platform/vendors/${vId}/payout-details`, { token: T, body: { gstin: '27ABCDE1234F1Z5' } });
  check('payout-details: GSTIN of another PAN → 400 on gstin', badGst.status === 400 && badGst.body?.error?.details?.[0]?.path === 'gstin', badGst.body);
  const vendorTries = await call('PATCH', `/platform/vendors/${vId}/payout-details`, { token: V, body: { lineOfBusiness: 'Retail and Shopping' } });
  check('payout-details: vendor token refused', [401, 403].includes(vendorTries.status), vendorTries.status);
  const det = await call('PATCH', `/platform/vendors/${vId}/payout-details`, { token: T, body: { lineOfBusiness: 'Retail and Shopping', gstin: GSTIN.toLowerCase() } });
  check('Master Admin sets line of business + GSTIN → account created (pending)', det.status === 200 && det.body.payout?.status === 'pending' && det.body.payout.cfVendorId === `nv${vId}` && det.body.profile?.lineOfBusiness === 'Retail and Shopping' && det.body.profile.gstin === GSTIN, det.body);
  const sync1 = { status: det.status, body: det.body?.payout };
  const created = gw.calls.find((c) => c.url === '/pg/easy-split/vendors' && c.method === 'POST' && c.body?.email);
  check('Cashfree vendor created with bank + PAN (decrypted only for the call)', created?.body?.bank?.account_number === ACCOUNT && created.body.kyc_details?.pan === PAN && created.body.bank.ifsc === 'SBIN0004567' && created.body.verify_account === false, created?.body?.bank);
  check('kyc_details: account_type INDIVIDUAL + business_type + gst', created?.body?.kyc_details?.account_type === 'INDIVIDUAL' && created.body.kyc_details.business_type === 'Retail and Shopping' && created.body.kyc_details.gst === GSTIN && !('uidai' in created.body.kyc_details), created?.body?.kyc_details);
  const panDoc = gw.docs.find((d) => d.vendorId === `nv${vId}` && d.docType === 'PAN');
  check('PAN card uploaded to Cashfree vendor-docs (file + PAN number), Aadhaar not sent', panDoc?.hasFile === true && panDoc.docValue === PAN && !gw.docs.some((d) => /UIDAI/.test(d.docType)), gw.docs);
  check('payout shows the PAN document in review', sync1.body?.documents?.some((d) => d.docType === 'PAN' && d.status === 'IN_REVIEW'), sync1.body?.documents);
  check('payout response never contains bank / PAN', !JSON.stringify(det.body).includes(ACCOUNT) && !JSON.stringify(sync1.body).includes(PAN));
  const noChange = await call('POST', `/platform/vendors/${vId}/payout`, { token: T });
  check('refresh with no changes → no update call, PAN not re-uploaded', noChange.body?.status === 'pending' && !gw.calls.some((c) => c.method === 'PATCH' && c.url.startsWith('/pg/easy-split/vendors/')) && gw.docs.filter((d) => d.vendorId === `nv${vId}`).length === 1, { patches: gw.calls.filter((c) => c.method === 'PATCH').map((c) => c.url), docs: gw.docs.map((d) => d.docType + ':' + d.vendorId.slice(-4)) });
  const newMail = `shop.${RUN}@example.com`;
  const em = await call('PATCH', `/platform/vendors/${vId}/payout-details`, { token: T, body: { email: newMail } });
  const upd = gw.calls.find((c) => c.method === 'PATCH' && c.url === `/pg/easy-split/vendors/nv${vId}`);
  check('changed email → sent to Cashfree as a vendor update', em.status === 200 && upd?.body?.email === newMail && upd.body.kyc_details?.business_type === 'Retail and Shopping' && !('vendor_id' in upd.body) && !('status' in upd.body), upd?.body);
  const pv2 = await call('GET', `/platform/vendors/${vId}`, { token: T });
  check('platform vendor view: email masked', pv2.body?.user?.hasEmail === true && pv2.body.user.email !== newMail && /•••@example\.com$/.test(pv2.body.user.email || ''), pv2.body?.user);
  // Cashfree rejects the PAN photo → failed with Cashfree's remark; the vendor may refresh after a fix.
  Object.assign(gw.vendors.get(`nv${vId}`), { status: 'ACTION_REQUIRED', related_docs: [{ doc_type: 'PAN', status: 'ACTION_REQUIRED', remarks: 'Image is blurred' }] });
  const ar = await call('POST', `/platform/vendors/${vId}/payout`, { token: T });
  check('ACTION_REQUIRED → failed with Cashfree’s document remark', ar.body?.status === 'failed' && ar.body.providerStatus === 'ACTION_REQUIRED' && /blurred/i.test(ar.body.message || ''), ar.body);
  check('a PAN file Cashfree rejected is not re-sent unchanged', gw.docs.filter((d) => d.vendorId === `nv${vId}` && d.docType === 'PAN').length === 1 && /new photo/i.test(ar.body.message || ''), gw.docs.length);
  // Fix path: reject KYC → admin enters it again with a new PAN photo + approves → the new file goes to Cashfree.
  await call('POST', `/platform/vendors/${vId}/kyc`, { token: T, body: { decision: 'rejected', note: 'PAN photo blurred' } });
  const adminUp = async () => {
    const form = new FormData();
    form.append('purpose', 'kyc');
    form.append('file', new Blob([PNG], { type: 'image/png' }), 'pan2.png');
    const r = await fetch(`${API}/platform/vendors/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${T}` }, body: form });
    return (await r.json())?._id;
  };
  const newPan = await adminUp();
  const reKyc = await call('PUT', `/platform/vendors/${vId}/kyc-details`, { token: T, body: { businessName: `Fresh Mart ${RUN}`, businessType: 'individual', lineOfBusiness: 'Retail and Shopping', gstin: GSTIN, city: 'Nagpur', pan: PAN, aadhaar: withVerhoeff(`4${String(STAMP).slice(-10)}`), bankAccountHolder: 'Sanjay N', bankAccountNumber: ACCOUNT, bankIfsc: 'SBIN0004567', panPhoto: newPan, aadhaarFront: docs[1], aadhaarBack: docs[2], vendorConsent: true, approve: true } });
  check('re-approved with a new PAN photo → new file uploaded to Cashfree', reKyc.status === 200 && gw.docs.filter((d) => d.vendorId === `nv${vId}` && d.docType === 'PAN').length === 2 && reKyc.body.profile?.lineOfBusiness === 'Retail and Shopping', { status: reKyc.status, docs: gw.docs.length, body: reKyc.body?.error });
  Object.assign(gw.vendors.get(`nv${vId}`), { status: 'IN_KYC_REVIEW', related_docs: [{ doc_type: 'PAN', status: 'IN_REVIEW', remarks: null }] });
  const vr2 = await call('POST', '/vendor/payout/refresh', { token: V });
  check('vendor can refresh a Cashfree-side failure → pending (KYC review)', vr2.body?.status === 'pending' && /reviewing the KYC/i.test(vr2.body.message || ''), vr2.body);
  const subadminNo = await call('POST', `/platform/vendors/${vId}/payout`, { token: V });
  check('vendor token cannot use the platform payout route', [401, 403].includes(subadminNo.status), subadminNo.status);
  await call('PATCH', `/platform/vendors/${vId}/pricing`, { token: T, body: { commissionPercent: 20, memberDiscountPercent: 50 } });

  // product + member
  const cat = await call('POST', '/platform/categories', { token: T, body: { kind: 'product', name: `Pay cat ${RUN}` } });
  const prod = await call('POST', '/products', { token: V, body: { categoryId: cat.body._id, title: `Pay rice ${RUN}`, pricePaise: 100000, stock: 10, maxPerOrder: 5, delivery: true, pickup: true, deliveryChargePaise: 4000 } });
  await call('POST', `/platform/listings/product/${prod.body?._id}/moderate`, { token: T, body: { decision: 'approved' } });
  const mr = await register(2, `Pay member ${RUN}`);
  const M = mr.body.accessToken;
  const M2 = (await register(3, `Other ${RUN}`)).body.accessToken;
  const orderBody = { quantity: 2, fulfilment: 'delivery', address: 'Flat 7, Civil Lines, Nagpur', applyDiscount: true, paymentMethod: 'online' };
  const notReady = await call('POST', `/products/${prod.body._id}/orders`, { token: M, body: orderBody });
  check('online order while payout pending → 409 VENDOR_PAYOUT_NOT_READY (COD still possible)', notReady.status === 409 && code(notReady) === 'VENDOR_PAYOUT_NOT_READY', notReady.body);
  check('…and no stock was taken', (await call('GET', `/products/${prod.body._id}`, { token: V })).body?.stock === 10);
  gw.vendorStatus = 'ACTIVE';
  gw.vendors.get(`nv${vId}`).status = 'ACTIVE';
  const vref = await call('POST', '/vendor/payout/refresh', { token: V });
  check('vendor refreshes → active', vref.body?.status === 'active' && vref.body.ready === true, vref.body);
  const vprof = await call('GET', '/vendor/profile', { token: V });
  check('vendor profile shows payout active', vprof.body?.payout?.status === 'active');

  // ---------------------------------------------------------------- product order paid online
  const o = await call('POST', `/products/${prod.body._id}/orders`, { token: M, body: orderBody });
  const ck = o.body?.checkout;
  check('online order → awaiting_payment + checkout (sandbox)', o.status === 201 && o.body.order.status === 'awaiting_payment' && ck?.orderId?.startsWith('ord_') && ck.mode === 'sandbox' && ck.checkoutUrl?.includes(`/api/v1/pay/checkout/${ck.orderId}?t=`), o.body);
  const gwo = gw.orders.get(ck?.orderId);
  check('Cashfree order: ₹1,840 with split ₹1,640 to the vendor', gwo?.order_amount === 1840 && gwo.order_splits?.[0]?.vendor_id === `nv${vId}` && gwo.order_splits[0].amount === 1640, { amount: gwo?.order_amount, splits: gwo?.order_splits });
  check('return/notify URLs point at the API', gwo?.order_meta?.return_url?.includes(`/api/v1/pay/return?order_id=${ck.orderId}`) && gwo.order_meta.notify_url?.endsWith('/api/v1/payments/webhook/cashfree'));
  check('customer details sent (id + phone)', gwo?.customer_details?.customer_phone === phoneFor(2) && /^u[a-f0-9]{24}$/.test(gwo.customer_details.customer_id));
  check('vendor does not see unpaid online orders', !(await call('GET', '/vendor/orders', { token: V })).body?.items?.some((x) => x._id === o.body.order._id));
  const page = await fetch(ck.checkoutUrl);
  const html = await page.text();
  check('hosted checkout page: Cashfree JS + session + Test mode badge + CSP', page.status === 200 && html.includes('sdk.cashfree.com/js/v3/cashfree.js') && html.includes(`session_${ck.orderId}`) && html.includes('Test mode') && /script-src 'nonce-/.test(page.headers.get('content-security-policy') || ''));
  const badTok = await fetch(ck.checkoutUrl.replace(/t=.*/, 't=wrong'));
  check('checkout page with a wrong token → 404, no session id', badTok.status === 404 && !(await badTok.text()).includes('session_'));
  const r0 = await call('POST', `/payments/checkout/${ck.orderId}/refresh`, { token: M });
  check('refresh before paying → still created (never a fake success)', r0.body?.status === 'created', r0.body);
  check('another member cannot read this checkout → 404', (await call('GET', `/payments/checkout/${ck.orderId}`, { token: M2 })).status === 404);
  // failed attempt first
  gatewayPays(ck.orderId, { status: 'FAILED' });
  const rf = await call('POST', `/payments/checkout/${ck.orderId}/refresh`, { token: M });
  check('failed attempt → still payable, lastError shown', rf.body?.status === 'created' && /Insufficient/.test(rf.body.lastError || ''), rf.body);
  // bad + good webhook
  gatewayPays(ck.orderId);
  const bad = await signedWebhook({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: ck.orderId }, payment: { payment_status: 'SUCCESS' } } }, { badSig: true });
  check('webhook with a bad signature → 400, nothing applied', bad.status === 400 && (await call('GET', `/product-orders/${o.body.order._id}`, { token: M })).body?.status === 'awaiting_payment', bad.status);
  const wh = await signedWebhook({ type: 'PAYMENT_SUCCESS_WEBHOOK', event_time: new Date().toISOString(), data: { order: { order_id: ck.orderId, order_amount: 1840 }, payment: { cf_payment_id: paySeq, payment_status: 'SUCCESS', payment_amount: 1840 } } });
  check('signed webhook → paid', wh.status === 200 && wh.body?.outcome === 'paid', wh.body);
  const again = await signedWebhook({ type: 'PAYMENT_SUCCESS_WEBHOOK', event_time: 'same', data: { order: { order_id: ck.orderId } } });
  const again2 = await fetch(`${API}/payments/webhook/cashfree`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('webhook without signature headers → 400', again2.status === 400);
  check('repeat webhook is harmless', again.status === 200);
  const mo = await call('GET', `/product-orders/${o.body.order._id}`, { token: M });
  check('order placed + paid online ₹1,840', mo.body?.status === 'placed' && mo.body.payment.status === 'paid' && mo.body.payment.method === 'online' && mo.body.payment.amountPaise === 184000, mo.body?.payment);
  const vo = await call('GET', `/vendor/orders/${o.body.order._id}`, { token: V });
  check('vendor settlement: NIVASA ₹200, vendor ₹1,640 (= Cashfree split)', vo.body?.settlement?.netToPlatformPaise === 20000 && vo.body.settlement.vendorEarningsPaise === 164000, vo.body?.settlement);
  const ret = await fetch(`${API}/pay/return?order_id=${ck.orderId}`);
  const retHtml = await ret.text();
  check('return page says successful and links back to the app', ret.status === 200 && retHtml.includes('Payment successful') && retHtml.includes(`addaapp://payment-result?order_id=${ck.orderId}&amp;status=paid`));
  // member cancels → refund with refund_splits
  const cancel = await call('POST', `/product-orders/${o.body.order._id}/cancel`, { token: M, body: { reason: 'Changed my mind' } });
  const refund = gw.refunds.find((r) => r.orderId === ck.orderId);
  check('cancel paid order → Cashfree refund ₹1,840 pulling ₹1,640 back from the vendor', refund?.refund_amount === 1840 && refund.refund_splits?.[0]?.vendor_id === `nv${vId}` && refund.refund_splits[0].amount === 1640, refund);
  check('…order refunded, stock restored', cancel.body?.payment?.status === 'refunded' && (await call('GET', `/products/${prod.body._id}`, { token: V })).body?.stock === 10, cancel.body?.payment);

  // amount mismatch
  const o2 = await call('POST', `/products/${prod.body._id}/orders`, { token: M, body: { ...orderBody, quantity: 1, applyDiscount: false } });
  gatewayPays(o2.body.checkout.orderId, { rupees: 1 });
  const mm = await call('POST', `/payments/checkout/${o2.body.checkout.orderId}/refresh`, { token: M });
  check('Cashfree amount ≠ order amount → amount_mismatch, order not placed', mm.body?.status === 'amount_mismatch' && (await call('GET', `/product-orders/${o2.body.order._id}`, { token: M })).body?.status === 'awaiting_payment', mm.body);
  await call('POST', `/product-orders/${o2.body.order._id}/cancel`, { token: M, body: {} });

  // pay again on an existing awaiting order reuses the checkout
  const o3 = await call('POST', `/products/${prod.body._id}/orders`, { token: M, body: { ...orderBody, quantity: 1 } });
  const re = await call('POST', `/product-orders/${o3.body.order._id}/pay`, { token: M });
  check('"Pay now" again reuses the open checkout', re.status === 201 && re.body.orderId === o3.body.checkout.orderId, re.body);
  const vc = await call('POST', `/product-orders/${o3.body.order._id}/cancel`, { token: M, body: {} });
  check('cancel unpaid online order → no refund call', vc.body?.status === 'cancelled' && !gw.refunds.some((r) => r.orderId === o3.body.checkout.orderId));
  gatewayPays(o3.body.checkout.orderId);
  await call('POST', `/payments/checkout/${o3.body.checkout.orderId}/refresh`, { token: M });
  check('payment arriving after cancel → refunded automatically', gw.refunds.some((r) => r.orderId === o3.body.checkout.orderId) && (await call('GET', `/product-orders/${o3.body.order._id}`, { token: M })).body?.payment?.status === 'refunded');

  // ---------------------------------------------------------------- service booking online
  const scat = (await call('GET', '/service-offers/categories', { token: M })).body.items[0]._id;
  const offer = await call('POST', '/service-offers', { token: V, body: { categoryId: scat, title: `Deep cleaning ${RUN}`, priceType: 'fixed', pricePaise: 100000, city: 'Nagpur', contactPhone: phoneFor(1) } });
  await call('POST', `/platform/listings/service/${offer.body?._id}/moderate`, { token: T, body: { decision: 'approved' } });
  const day = new Date(Date.now() + 330 * 60000 + 86400000).toISOString().slice(0, 10);
  const bk = await call('POST', `/service-offers/${offer.body._id}/bookings`, { token: M, body: { preferredDate: day, address: 'Flat 7, Civil Lines', applyDiscount: true } });
  check('booking made: member pays the listed ₹1,000 − ₹100 discount = ₹900', bk.status === 201 && bk.body?.pricing?.memberPricePaise === 100000 && bk.body.pricing.payablePaise === 90000, bk.body?.pricing);
  check('member booking shows no commission', !JSON.stringify(bk.body).includes('commission'));
  check('pay before the vendor accepts → 409', (await call('POST', `/service-bookings/${bk.body._id}/pay`, { token: M })).status === 409);
  await call('POST', `/vendor/bookings/${bk.body._id}/accept`, { token: V, body: {} });
  const acc = (await call('GET', '/service-bookings', { token: M })).body?.items?.find((x) => x._id === bk.body._id);
  check('accepted booking offers "pay" to the member', acc?.actions?.includes('pay'), acc?.actions);
  const bp = await call('POST', `/service-bookings/${bk.body._id}/pay`, { token: M });
  const bgo = gw.orders.get(bp.body?.orderId);
  check('pay once accepted: checkout ₹900 with ₹800 split to the vendor', bp.status === 201 && bgo?.order_amount === 900 && bgo.order_splits?.[0]?.amount === 800, { status: bp.status, body: bp.body, splits: bgo?.order_splits });
  gatewayPays(bp.body.orderId);
  const bpr = await call('POST', `/payments/checkout/${bp.body.orderId}/refresh`, { token: M });
  await call('POST', `/vendor/bookings/${bk.body._id}/complete`, { token: V, body: {} });
  const vb = await call('GET', `/vendor/bookings/${bk.body._id}`, { token: V });
  check('booking paid online: commission ₹200 − discount ₹100 = NIVASA ₹100, vendor ₹800', bpr.body?.status === 'paid' && vb.body?.payment?.status === 'paid' && vb.body.payment.method === 'online' && vb.body.payment.netToPlatformPaise === 10000 && vb.body.payment.vendorEarningsPaise === 80000, vb.body?.payment || vb.body);
  check('cash mark-paid after online payment → 409', (await call('POST', `/vendor/bookings/${bk.body._id}/mark-paid`, { token: V, body: { amountPaise: 90000 } })).status === 409);
  // Paid in advance, then cancelled → full refund.
  const M3 = (await register(5, `Advance payer ${RUN}`)).body.accessToken;
  const bk2 = await call('POST', `/service-offers/${offer.body._id}/bookings`, { token: M3, body: { preferredDate: day, address: 'Flat 9, Civil Lines' } });
  await call('POST', `/vendor/bookings/${bk2.body?._id}/accept`, { token: V, body: {} });
  const bp2 = await call('POST', `/service-bookings/${bk2.body?._id}/pay`, { token: M3 });
  gatewayPays(bp2.body?.orderId);
  await call('POST', `/payments/checkout/${bp2.body?.orderId}/refresh`, { token: M3 });
  const cx = await call('POST', `/service-bookings/${bk2.body?._id}/cancel`, { token: M3, body: {} });
  const rf2 = gw.refunds.find((r) => r.orderId === bp2.body?.orderId);
  check('paid in advance then cancelled → refund ₹1,000 (₹800 back from the vendor), booking refunded', cx.body?.status === 'cancelled' && cx.body.payment?.status === 'refunded' && rf2?.refund_amount === 1000 && rf2.refund_splits?.[0]?.amount === 800, { p: cx.body?.payment, rf2 });

  // ---------------------------------------------------------------- society: maintenance invoice + facility fee
  const repEmail = `pay.sec.${RUN}@example.com`;
  const reg = await call('POST', '/public/society-registrations', { body: { societyName: `Pay Society ${RUN}`, addressLine: '1 Main Road', area: 'Dharampeth', city: 'Nagpur', state: 'Maharashtra', pincode: '440010', phone: '9822012345', email: `office.${RUN}@example.com`, representative: { name: 'Meera Rao', designation: 'Secretary', phone: '9822012346', email: repEmail } } });
  const regs = await call('GET', '/platform/society-registrations', { token: T });
  const regId = regs.body.items?.find((r) => r.referenceCode === reg.body.referenceCode)?._id;
  const sAppr = await call('POST', `/platform/society-registrations/${regId}/approve`, { token: T, body: {} });
  await call('POST', '/public/society-registrations/activate', { body: { referenceCode: reg.body.referenceCode, accessKey: reg.body.accessKey, password: 'PaySociety12345' } });
  const ADM = (await call('POST', '/auth/admin/login', { body: { email: repEmail, password: 'PaySociety12345' } })).body?.accessToken;
  const societyId = sAppr.body?.society?._id;
  check('society set up', !!ADM && !!societyId);
  await call('PATCH', '/society/billing-settings', { token: ADM, body: { defaultAmountPaise: 150000, dueDayOfMonth: 25 } });
  const bld = await call('POST', '/society/buildings', { token: ADM, body: { name: 'Block P', floors: 2 } });
  await call('POST', '/society/flats/bulk', { token: ADM, body: { buildingId: bld.body._id, fromFloor: 1, toFloor: 1, unitsPerFloor: 1, pattern: '{building}-{floor}{unit}', areaSqft: 900 } });
  const fac = await call('POST', '/society/facilities', { token: ADM, body: { name: 'Club House', feePaise: 50000, openTime: '09:00', closeTime: '22:00', slotMinutes: 60, maxAdvanceDays: 30, requiresApproval: false } });
  const R = (await register(4, `Resident ${RUN}`)).body.accessToken;
  const mem = await call('POST', '/memberships', { token: R, body: { societyId, buildingId: bld.body._id, flatNumber: 'P-101', residentType: 'owner' } });
  await call('POST', `/society/memberships/${mem.body?._id}/approve`, { token: ADM, body: {} });
  const period = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);
  await call('POST', '/society/invoices/generate', { token: ADM, body: { period } });
  const invId = (await call('GET', '/resident/invoices?status=open', { token: R })).body?.items?.[0]?._id;
  const off = await call('POST', `/resident/invoices/${invId}/pay`, { token: R });
  check('society has not enabled online collection → 503 (never simulated)', off.status === 503 && code(off) === 'PAYMENTS_UNAVAILABLE', off.body);
  check('cashfree_split without a vendor id → 400', (await call('PATCH', `/platform/societies/${societyId}/payments`, { token: T, body: { onlineEnabled: true, settlementMode: 'cashfree_split' } })).status === 400);
  const en = await call('PATCH', `/platform/societies/${societyId}/payments`, { token: T, body: { onlineEnabled: true, settlementMode: 'cashfree_split', linkedAccountId: `soc_${RUN}` } });
  check('Master Admin enables Cashfree split to the society account', en.status === 200, en.body);
  const ip = await call('POST', `/resident/invoices/${invId}/pay`, { token: R });
  const igo = gw.orders.get(ip.body?.orderId);
  check('invoice checkout ₹1,500, 100% split to the society', ip.status === 201 && ip.body.provider === 'cashfree' && igo?.order_amount === 1500 && igo.order_splits?.[0]?.vendor_id === `soc_${RUN}` && igo.order_splits[0].amount === 1500, { s: ip.status, b: ip.body, sp: igo?.order_splits });
  const ip2 = await call('POST', `/resident/invoices/${invId}/pay`, { token: R });
  check('tapping Pay again reuses the same order', ip2.body?.orderId === ip.body?.orderId);
  gatewayPays(ip.body.orderId);
  const iwh = await signedWebhook({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: ip.body.orderId } } });
  const invAfter = await call('GET', `/resident/invoices/${invId}`, { token: R });
  check('invoice paid via webhook → receipt issued, balance 0', iwh.body?.outcome === 'paid' && invAfter.body?.balancePaise === 0 && invAfter.body.payments?.[0]?.receipt, { wh: iwh.body, bal: invAfter.body?.balancePaise, st: invAfter.status, pays: invAfter.body?.payments });
  const ledger = await call('GET', '/society/ledger?limit=20', { token: ADM });
  check('society ledger has the gateway credit', JSON.stringify(ledger.body || {}).includes('150000'), ledger.status);
  // facility
  const fday = new Date(Date.now() + 330 * 60000 + 2 * 86400000).toISOString().slice(0, 10);
  const fb = await call('POST', '/resident/bookings', { token: R, body: { facilityId: fac.body._id, date: fday, startTime: '10:00' } });
  const fp = await call('POST', `/resident/bookings/${fb.body?._id}/pay`, { token: R });
  check('facility fee checkout ₹500 → society split', fp.status === 201 && gw.orders.get(fp.body?.orderId)?.order_amount === 500, fp.body);
  gatewayPays(fp.body.orderId);
  check('facility paid', (await call('POST', `/payments/checkout/${fp.body.orderId}/refresh`, { token: R })).body?.status === 'paid');
  const mine = (await call('GET', '/resident/bookings?limit=20', { token: R })).body?.items?.find((x) => x._id === fb.body._id);
  check('booking shows fee paid', mine?.payment?.status === 'paid' && mine.payment.amountPaise === 50000, mine?.payment);
  check('member cannot cancel a paid booking → 409 PAID_BOOKING', code(await call('POST', `/resident/bookings/${fb.body._id}/cancel`, { token: R })) === 'PAID_BOOKING');
  const sc = await call('POST', `/society/bookings/${fb.body._id}/cancel`, { token: ADM, body: { reason: 'Hall under repair' } });
  const frf = gw.refunds.find((r) => r.orderId === fp.body.orderId);
  const mine2 = (await call('GET', '/resident/bookings?limit=20', { token: R })).body?.items?.find((x) => x._id === fb.body._id);
  check('staff cancel → full refund ₹500 from the society account', sc.status === 200 && frf?.refund_amount === 500 && frf.refund_splits?.[0]?.vendor_id === `soc_${RUN}` && mine2?.payment?.status === 'refunded', { frf, p: mine2?.payment });

  // pending refund → webhook completes it
  gw.refundStatus = 'PENDING';
  const o4 = await call('POST', `/products/${prod.body._id}/orders`, { token: M, body: { ...orderBody, quantity: 1 } });
  gatewayPays(o4.body.checkout.orderId);
  await call('POST', `/payments/checkout/${o4.body.checkout.orderId}/refresh`, { token: M });
  const c4 = await call('POST', `/product-orders/${o4.body.order._id}/cancel`, { token: M, body: {} });
  check('refund pending at Cashfree → order shows refund_pending', c4.body?.payment?.status === 'refund_pending', c4.body?.payment);
  const r4 = gw.refunds.find((r) => r.orderId === o4.body.checkout.orderId);
  const rwh = await signedWebhook({ type: 'REFUND_STATUS_WEBHOOK', data: { refund: { order_id: o4.body.checkout.orderId, refund_id: r4?.refund_id, refund_status: 'SUCCESS', refund_amount: r4?.refund_amount } } });
  check('REFUND_STATUS_WEBHOOK SUCCESS → refunded', rwh.body?.outcome === 'refund_success' && (await call('GET', `/product-orders/${o4.body.order._id}`, { token: M })).body?.payment?.status === 'refunded', rwh.body);
  gw.refundStatus = 'SUCCESS';
  const po = await call('GET', `/platform/product-orders?vendorId=${vId}`, { token: T });
  check('platform orders list shows online orders', po.status === 200 && po.body.items.some((x) => x.paymentMethod === 'online'));
} finally {
  fake.close();
}
console.log(`\n${passed} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  ✗ ${f}`);
process.exit(failed.length ? 1 : 0);
