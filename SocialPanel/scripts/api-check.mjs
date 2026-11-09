#!/usr/bin/env node
/**
 * Live contract check for every endpoint the SocialPanel uses.
 * Runs against a LOCAL backend only (default http://127.0.0.1:3013 — never production / Atlas).
 *
 *   node scripts/api-check.mjs            # full run
 *   API_BASE=http://127.0.0.1:3013 SA_EMAIL=… SA_PASSWORD=… node scripts/api-check.mjs
 *
 * Writes .e2e-state.json (gitignored) with the accounts it created so screenshots/e2e can reuse them.
 */
import { writeFileSync } from 'node:fs';
import { superAdminLogin } from './sa-login.mjs';

const BASE = (process.env.API_BASE || 'http://127.0.0.1:3013').replace(/\/$/, '');
if (/adda\.skillinnovex\.in|mongodb\.net/.test(BASE)) {
  console.error('Refusing to run against production. Use a local backend.');
  process.exit(2);
}
const API = `${BASE}/api/v1`;
const SA = { email: process.env.SA_EMAIL || 'admin@addaapp.local', password: process.env.SA_PASSWORD || 'DevAdmin12345' };
const RUN = Date.now().toString(36);
const PASSWORD = 'Adda2026secure';

const results = [];
const warnings = [];
/** Known backend issues: reported, not counted as panel failures. */
const warn = (name, cond, detail) => {
  if (!cond) {
    warnings.push({ name, detail });
    console.log(`  [33m⚠[0m BACKEND ISSUE: ${name}${detail ? `  → ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  } else console.log(`  [32m✔[0m ${name}`);
};
let section = '';
const ok = (name, cond, detail) => {
  results.push({ section, name, pass: Boolean(cond), detail });
  const mark = cond ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m';
  console.log(`  ${mark} ${name}${!cond && detail ? `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}` : ''}`);
  return Boolean(cond);
};
const head = (s) => {
  section = s;
  console.log(`\n\x1b[1m${s}\x1b[0m`);
};

// The backend allows 300 requests / minute per IP; this run makes more than that, so pace to stay under it.
const WINDOW_MS = 60_000;
const WINDOW_MAX = 280;
const sent = [];
async function throttle() {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] >= WINDOW_MS) sent.shift();
    if (sent.length < WINDOW_MAX) break;
    await new Promise((r) => setTimeout(r, WINDOW_MS - (now - sent[0]) + 50));
  }
  sent.push(Date.now());
}

async function call(method, path, { token, body, form, society, raw = false, root = false } = {}) {
  await throttle();
  const headers = { Accept: raw ? '*/*' : 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (society) headers['X-Society-Id'] = society;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${root ? BASE : API}${path}`, { method, headers, body: payload });
  let json = null;
  let buf = null;
  if (raw) buf = Buffer.from(await res.arrayBuffer());
  else {
    const text = await res.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { _raw: text };
    }
  }
  return { status: res.status, json, buf, headers: res.headers };
}

/** Call + assert status. Returns json (or the full response when raw). */
async function expect(name, status, method, path, opts) {
  const r = await call(method, path, opts);
  const want = [].concat(status);
  ok(`${method} ${path.split('?')[0]} → ${want.join('|')}${name ? ` (${name})` : ''}`, want.includes(r.status), `got ${r.status} ${JSON.stringify(r.json?.error || r.json || '').slice(0, 300)}`);
  if (r.status === 429) {
    console.error('\nRate limited by the backend (login/public-form limiter). Wait 15 minutes and re-run.');
    summary();
    process.exit(1);
  }
  return opts?.raw ? r : r.json;
}

const has = (obj, keys) => keys.every((k) => obj && Object.prototype.hasOwnProperty.call(obj, k));
const isPaged = (j) => j && Array.isArray(j.items) && ['page', 'limit', 'total', 'pages'].every((k) => typeof j[k] === 'number');
const randPhone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
const istDay = (offsetDays = 0) => new Date(Date.now() + 330 * 60000 + offsetDays * 86400000).toISOString().slice(0, 10);
const period = (offsetMonths = 0) => {
  const d = new Date(Date.now() + 330 * 60000);
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
};
// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const pngForm = (extra = {}) => {
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), 'doc.png');
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
};
/** POST /uploads body (purpose first, then the file). */
const uploadForm = (purpose) => {
  const fd = new FormData();
  fd.append('purpose', purpose);
  fd.append('file', new Blob([PNG], { type: 'image/png' }), `${purpose}.png`);
  return fd;
};
// Verhoeff check digit, to build a valid test Aadhaar number for vendor KYC.
const VD = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const VP = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const VINV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
const withVerhoeff = (base11) => base11 + VINV[base11.split('').reverse().reduce((c, d, i) => VD[c][VP[(i + 1) % 8][Number(d)]], 0)];

function summary() {
  const failed = results.filter((r) => !r.pass);
  if (warnings.length) {
    console.log(`
Known backend issues (${warnings.length}) — the panel works around these:`);
    for (const w of warnings) console.log(`  ⚠ ${w.name} → ${JSON.stringify(w.detail).slice(0, 300)}`);
  }
  console.log(`\n\x1b[1mapi-check: ${results.length - failed.length}/${results.length} passed\x1b[0m`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  [${f.section}] ${f.name} → ${typeof f.detail === 'string' ? f.detail : JSON.stringify(f.detail)}`);
  }
  return failed.length;
}

async function main() {
  console.log(`API check against ${API} (run ${RUN})`);
  const state = { run: RUN, api: BASE, superAdmin: SA };

  // ------------------------------------------------------------------ public
  head('Public');
  const cfg = await expect('', 200, 'GET', '/public/config');
  ok('config has otp/passwordLogin/payments/uploads', has(cfg, ['otp', 'passwordLogin', 'payments', 'uploads']), cfg);
  const cats = await expect('', 200, 'GET', '/public/categories?kind=complaint');
  ok('public categories items[]', Array.isArray(cats?.items), cats);

  head('Super admin login');
  const sa = await superAdminLogin(API, SA.email, SA.password);
  ok('owner signs in with email + password', sa.status === 200, sa);
  const saLogin = sa.body;
  ok('login returns tokens + user.platformRole=super_admin', saLogin?.accessToken && saLogin?.refreshToken && saLogin?.user?.platformRole === 'super_admin', saLogin?.user);
  const saT = saLogin.accessToken;

  // ------------------------------------------------------------------ registration
  head('Registration → status → approve → activate');
  const doc = await expect('document upload', 201, 'POST', '/public/society-registrations/documents', { form: pngForm() });
  ok('document has _id/mimeType/size/originalName', has(doc, ['_id', 'mimeType', 'size', 'originalName']), doc);
  const repEmail = `rep.${RUN}@example.com`;
  const regBody = {
    societyName: `Green Meadows ${RUN.toUpperCase()}`,
    addressLine: '12 Park Street, Near City Mall',
    area: 'Baner',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411045',
    phone: randPhone(),
    email: `office.${RUN}@example.com`,
    totalUnits: 48,
    representative: { name: 'Anita Rao', designation: 'Secretary', phone: randPhone(), email: repEmail },
    documents: [doc._id],
    submit: true,
  };
  await expect('bad pincode', 400, 'POST', '/public/society-registrations', { body: { ...regBody, pincode: '12' } });
  const reg = await expect('submit', 201, 'POST', '/public/society-registrations', { body: regBody });
  ok('registration returns referenceCode + accessKey + status=submitted', reg?.referenceCode && reg?.accessKey && reg?.status === 'submitted', reg);
  const creds = { referenceCode: reg.referenceCode, accessKey: reg.accessKey };
  let st = await expect('status', 200, 'POST', '/public/society-registrations/status', { body: creds });
  ok('status submitted, no activation yet', st?.status === 'submitted' && !st.activation, st);
  await expect('wrong key', 404, 'POST', '/public/society-registrations/status', { body: { ...creds, accessKey: 'wrongwrongwrong' } });
  await expect('activate before approval', 400, 'POST', '/public/society-registrations/activate', { body: { ...creds, password: PASSWORD } });

  const queue = await expect('', 200, 'GET', '/platform/society-registrations', { token: saT });
  ok('queue paged + contains our application', isPaged(queue) && queue.items.some((r) => r.referenceCode === reg.referenceCode), queue?.items?.length);
  const regRow = queue.items.find((r) => r.referenceCode === reg.referenceCode);
  ok('queue rows do not expose accessKeyHash', regRow && !('accessKeyHash' in regRow), regRow && Object.keys(regRow));
  const regDetail = await expect('', 200, 'GET', `/platform/society-registrations/${regRow._id}`, { token: saT });
  ok('detail has representative + documents[url]', regDetail?.representative?.email === repEmail && regDetail?.documents?.[0]?.url, regDetail?.documents);
  if (regDetail?.documents?.[0]?.url) {
    await throttle();
    const d = await fetch(regDetail.documents[0].url);
    ok('signed document url loads (200)', d.status === 200, d.status);
  }
  await expect('', 200, 'POST', `/platform/society-registrations/${regRow._id}/review`, { token: saT });
  st = await expect('status under review', 200, 'POST', '/public/society-registrations/status', { body: creds });
  ok('status under_review', st?.status === 'under_review', st?.status);
  const appr = await expect('', 200, 'POST', `/platform/society-registrations/${regRow._id}/approve`, { token: saT, body: {} });
  ok('approve returns society.code + adminEmail + setupLink', appr?.society?.code && appr?.adminEmail === repEmail && typeof appr?.setupLink === 'string', appr);
  ok('setupLink points to panel /set-password?token=', /\/set-password\?token=/.test(appr?.setupLink || ''), appr?.setupLink);
  st = await expect('status approved', 200, 'POST', '/public/society-registrations/status', { body: creds });
  ok('approved: society + adminEmail + activation=required', st?.status === 'approved' && st?.society?.code === appr.society.code && st?.adminEmail === repEmail && st?.activation === 'required', st);
  await expect('weak password', 400, 'POST', '/public/society-registrations/activate', { body: { ...creds, password: 'short' } });
  const act = await expect('activate', 200, 'POST', '/public/society-registrations/activate', { body: { ...creds, password: PASSWORD } });
  ok('activate → ok, email, activation=done', act?.ok && act?.email === repEmail && act?.activation === 'done', act);
  await expect('activate twice', 409, 'POST', '/public/society-registrations/activate', { body: { ...creds, password: PASSWORD } });
  st = await expect('status after activation', 200, 'POST', '/public/society-registrations/status', { body: creds });
  ok('activation=done', st?.activation === 'done', st?.activation);
  const societyId = appr.society._id;

  // Reject path
  const reg2 = await expect('second application', 201, 'POST', '/public/society-registrations', { body: { ...regBody, societyName: `Rejected Towers ${RUN}`, documents: [], representative: { ...regBody.representative, email: `rej.${RUN}@example.com` } } });
  const q2 = await expect('', 200, 'GET', `/platform/society-registrations?q=${reg2.referenceCode}`, { token: saT });
  const reg2Row = q2.items?.[0];
  await expect('reject without reason', 400, 'POST', `/platform/society-registrations/${reg2Row?._id}/reject`, { token: saT, body: {} });
  await expect('reject', 200, 'POST', `/platform/society-registrations/${reg2Row?._id}/reject`, { token: saT, body: { reason: 'Documents missing' } });
  const st2 = await expect('rejected status', 200, 'POST', '/public/society-registrations/status', { body: { referenceCode: reg2.referenceCode, accessKey: reg2.accessKey } });
  ok('rejected status shows decisionReason', st2?.status === 'rejected' && st2?.decisionReason === 'Documents missing', st2);
  const qRejected = await expect('filter rejected', 200, 'GET', '/platform/society-registrations?status=rejected', { token: saT });
  ok('status filter works', qRejected.items.every((r) => r.status === 'rejected'), qRejected.items.map((r) => r.status));

  // ------------------------------------------------------------------ society admin
  head('Society admin session');
  const adm = await expect('society admin login', 200, 'POST', '/auth/admin/login', { body: { email: repEmail, password: PASSWORD } });
  ok('staffRoles[0] = admin of new society', adm?.staffRoles?.[0]?.role === 'admin' && adm.staffRoles[0].society?._id === societyId, adm?.staffRoles);
  ok('society admin is not super admin', adm?.user?.platformRole !== 'super_admin', adm?.user?.platformRole);
  const T = adm.accessToken;
  const me = await expect('', 200, 'GET', '/me', { token: T });
  ok('/me has user + staffRoles', me?.user?.email === repEmail && Array.isArray(me?.staffRoles), me);
  await expect('society admin blocked from platform', 403, 'GET', '/platform/overview', { token: T });
  state.societyAdmin = { email: repEmail, password: PASSWORD, societyId, societyCode: appr.society.code, societyName: regBody.societyName };

  let ov = await expect('', 200, 'GET', '/society/overview', { token: T });
  ok('overview shape (society, role, counts, complaints, finance, trend[6], recentComplaints)', has(ov, ['society', 'role', 'counts', 'complaints', 'finance', 'trend', 'recentComplaints']) && ov.trend.length === 6 && has(ov.finance, ['outstandingPaise', 'overduePaise', 'openInvoices', 'collectedThisMonthPaise', 'balancePaise']), ov);
  ok('overview counts keys', has(ov.counts, ['flats', 'buildings', 'residents', 'pendingMembers', 'pendingBookings', 'openServiceRequests', 'pendingListings', 'openReports']), ov.counts);

  head('Profile & settings');
  const prof = await expect('', 200, 'GET', '/society/profile', { token: T });
  ok('profile has billing + settings + payments', has(prof, ['name', 'code', 'billing', 'settings']), Object.keys(prof || {}));
  const prof2 = await expect('', 200, 'PATCH', '/society/profile', { token: T, body: { description: 'A green, friendly community.', settings: { bookingsRequireApproval: true, listingsRequireApproval: true } } });
  ok('profile patch persisted', prof2?.settings?.bookingsRequireApproval === true, prof2?.settings);
  await expect('bad pincode', 400, 'PATCH', '/society/profile', { token: T, body: { pincode: '12' } });
  const bill = await expect('', 200, 'PATCH', '/society/billing-settings', { token: T, body: { defaultAmountPaise: 250000, dueDayOfMonth: 10, lateFeePaise: 10000, invoicePrefix: 'GM' } });
  ok('billing settings returned', bill?.defaultAmountPaise === 250000 && bill?.invoicePrefix === 'GM', bill);

  head('Buildings & flats');
  const bA = await expect('', 201, 'POST', '/society/buildings', { token: T, body: { name: 'Tower A', floors: 4 } });
  const bB = await expect('', 201, 'POST', '/society/buildings', { token: T, body: { name: 'Tower B', floors: 3 } });
  const bProbe = await expect('partial patch probe', 200, 'PATCH', `/society/buildings/${bB._id}`, { token: T, body: { description: 'Garden-facing' } });
  warn('PATCH /society/buildings/:id with only {description} keeps floors (zod .partial() + .default() resets omitted fields)', bProbe?.floors === 3, { floorsAfter: bProbe?.floors, expected: 3 });
  await expect('full patch (as the panel sends)', 200, 'PATCH', `/society/buildings/${bB._id}`, { token: T, body: { name: 'Tower B', floors: 3, description: 'Garden-facing', active: true } });
  const bulk = await expect('bulk', 201, 'POST', '/society/flats/bulk', { token: T, body: { buildingId: bA._id, fromFloor: 1, toFloor: 4, unitsPerFloor: 2, pattern: '{building}-{floor}{unit}', areaSqft: 950 } });
  ok('bulk → requested 8, created 8', bulk?.requested === 8 && bulk?.created === 8, bulk);
  const bulk2 = await expect('bulk repeat', 201, 'POST', '/society/flats/bulk', { token: T, body: { buildingId: bA._id, fromFloor: 1, toFloor: 1, unitsPerFloor: 2 } });
  ok('bulk repeat skips existing', bulk2?.created === 0 && bulk2?.skippedExisting === 2, bulk2);
  await expect('bulk B', 201, 'POST', '/society/flats/bulk', { token: T, body: { buildingId: bB._id, fromFloor: 0, toFloor: 2, unitsPerFloor: 2, pattern: '{floor}{unit}', areaSqft: 1200 } });
  const single = await expect('single flat', 201, 'POST', '/society/flats', { token: T, body: { buildingId: bB._id, number: 'B-PH1', floor: 3, areaSqft: 2400, category: 'Penthouse', maintenanceAmountPaise: 500000 } });
  const blds = await expect('', 200, 'GET', '/society/buildings', { token: T });
  ok('buildings have flatCount', blds?.items?.find((b) => b._id === bA._id)?.flatCount === 8, blds?.items);
  const flatsA = await expect('', 200, 'GET', `/society/flats?buildingId=${bA._id}&limit=100`, { token: T });
  ok('flats paged with building + residents[]', isPaged(flatsA) && flatsA.items[0]?.building?.name === 'Tower A' && Array.isArray(flatsA.items[0]?.residents), flatsA?.items?.[0]);
  ok('bulk numbering A-101', flatsA.items.some((f) => f.number === 'A-101'), flatsA.items.map((f) => f.number));
  const pf = await expect('override', 200, 'PATCH', `/society/flats/${single._id}`, { token: T, body: { maintenanceAmountPaise: 450000 } });
  ok('flat override saved', pf?.maintenanceAmountPaise === 450000, pf);
  const pf2 = await expect('clear override', 200, 'PATCH', `/society/flats/${single._id}`, { token: T, body: { maintenanceAmountPaise: null } });
  ok('override cleared', pf2 && pf2.maintenanceAmountPaise === undefined, pf2);
  const flatSearch = await expect('search', 200, 'GET', '/society/flats?q=a-1', { token: T });
  ok('flat search q works (case-insensitive upper)', flatSearch.items.every((f) => f.number.includes('A-1')), flatSearch.items.map((f) => f.number));

  head('Staff & roles');
  const tEmail = `treasurer.${RUN}@example.com`;
  const inv = await expect('invite treasurer', 201, 'POST', '/society/staff', { token: T, body: { name: 'Vikram Shah', email: tEmail, role: 'treasurer', title: 'Treasurer' } });
  ok('invite returns staff + setupLink', inv?.staff?._id && typeof inv?.setupLink === 'string', inv);
  const staffList = await expect('', 200, 'GET', '/society/staff', { token: T });
  ok('staff list with populated user', staffList?.items?.some((s) => s.user?.email === tEmail), staffList?.items?.map((s) => s.user));
  const relink = await expect('regenerate link', 200, 'POST', `/society/staff/${inv.staff._id}/setup-link`, { token: T });
  ok('regenerated setupLink', typeof relink?.setupLink === 'string', relink);
  const token = new URL(relink.setupLink).searchParams.get('token');
  const setup = await expect('setup', 200, 'POST', '/auth/password/setup', { body: { token, password: PASSWORD } });
  ok('setup → ok + email', setup?.ok && setup?.email === tEmail, setup);
  const mEmail = `manager.${RUN}@example.com`;
  const invM = await expect('invite manager', 201, 'POST', '/society/staff', { token: T, body: { name: 'Meera Iyer', email: mEmail, role: 'manager' } });
  await expect('change role', 200, 'PATCH', `/society/staff/${invM.staff._id}`, { token: T, body: { role: 'committee' } });
  await expect('disable', 200, 'PATCH', `/society/staff/${invM.staff._id}`, { token: T, body: { status: 'disabled' } });
  const selfStaff = staffList.items.find((s) => s.user?.email === repEmail);
  await expect('cannot demote self', 403, 'PATCH', `/society/staff/${selfStaff._id}`, { token: T, body: { role: 'committee' } });
  await expect('duplicate invite', 409, 'POST', '/society/staff', { token: T, body: { name: 'Vikram Shah', email: tEmail, role: 'treasurer' } });
  const reset = await expect('forgot password (generic)', 200, 'POST', '/auth/password/reset-request', { body: { email: tEmail } });
  ok('reset-request returns ok + emailDelivery + message', reset?.ok === true && typeof reset?.emailDelivery === 'boolean' && typeof reset?.message === 'string', reset);

  head('Treasurer role restrictions');
  const tre = await expect('treasurer login', 200, 'POST', '/auth/admin/login', { body: { email: tEmail, password: PASSWORD } });
  const TT = tre.accessToken;
  ok('treasurer staffRoles role=treasurer', tre?.staffRoles?.[0]?.role === 'treasurer', tre?.staffRoles);
  const forb = await expect('treasurer add building', 403, 'POST', '/society/buildings', { token: TT, body: { name: 'Tower Z', floors: 1 } });
  ok('403 carries a human message', typeof forb?.error?.message === 'string' && /treasurer/i.test(forb.error.message), forb);
  await expect('treasurer reads buildings', 200, 'GET', '/society/buildings', { token: TT });
  await expect('treasurer complaints', 403, 'GET', '/society/complaints', { token: TT });
  await expect('treasurer staff invite', 403, 'POST', '/society/staff', { token: TT, body: { name: 'X Y', email: `x.${RUN}@example.com`, role: 'committee' } });
  await expect('treasurer finance', 200, 'GET', '/society/charges', { token: TT });
  await expect('treasurer approve member', 403, 'POST', `/society/memberships/${selfStaff._id}/approve`, { token: TT, body: {} });
  state.treasurer = { email: tEmail, password: PASSWORD };

  // ------------------------------------------------------------------ residents
  head('Residents & memberships');
  const r1Phone = randPhone();
  const r1 = await expect('resident register', 201, 'POST', '/auth/resident/register', { body: { phone: r1Phone, name: 'Rahul Verma', password: PASSWORD } });
  const R1 = r1.accessToken;
  const pubBld = await expect('public buildings', 200, 'GET', `/public/societies/${societyId}/buildings`);
  ok('public buildings list', pubBld?.buildings?.length >= 2, pubBld);
  const m1 = await expect('join', 201, 'POST', '/memberships', { token: R1, body: { societyId, buildingId: bA._id, flatNumber: 'A-101', residentType: 'owner' } });
  ok('membership pending', m1?.status === 'pending', m1);
  const r2 = await expect('resident 2 register', 201, 'POST', '/auth/resident/register', { body: { phone: randPhone(), name: 'Priya Nair', password: PASSWORD } });
  const R2 = r2.accessToken;
  const m2 = await expect('join 2', 201, 'POST', '/memberships', { token: R2, body: { societyId, buildingId: bA._id, flatNumber: 'A-102', residentType: 'tenant' } });
  await expect('unknown flat', 400, 'POST', '/memberships', { token: R2, body: { societyId, buildingId: bA._id, flatNumber: 'ZZ-999', residentType: 'tenant' } });
  const pend = await expect('', 200, 'GET', '/society/memberships?status=pending', { token: T });
  ok('pending list with user/building/flat populated', isPaged(pend) && pend.items.some((m) => m._id === m1._id && m.user?.name === 'Rahul Verma' && m.flat?.number === 'A-101' && m.building?.name), pend?.items?.[0]);
  const srch = await expect('search by name', 200, 'GET', '/society/memberships?status=pending&q=rahul', { token: T });
  ok('membership search', srch.items.length === 1, srch.items.length);
  await expect('approve', 200, 'POST', `/society/memberships/${m1._id}/approve`, { token: T, body: {} });
  await expect('reject without reason', 400, 'POST', `/society/memberships/${m2._id}/reject`, { token: T, body: {} });
  await expect('approve 2', 200, 'POST', `/society/memberships/${m2._id}/approve`, { token: T, body: {} });
  await expect('suspend', 200, 'POST', `/society/memberships/${m2._id}/suspend`, { token: T, body: { reason: 'Pending verification' } });
  await expect('reactivate', 200, 'POST', `/society/memberships/${m2._id}/approve`, { token: T, body: {} });
  const r3 = await expect('resident 3 register', 201, 'POST', '/auth/resident/register', { body: { phone: randPhone(), name: 'Sanjay Kulkarni', password: PASSWORD } });
  const m3 = await expect('join 3', 201, 'POST', '/memberships', { token: r3.accessToken, body: { societyId, buildingId: bB._id, flatNumber: 'G01', residentType: 'family' } });
  await expect('reject', 200, 'POST', `/society/memberships/${m3._id}/reject`, { token: T, body: { reason: 'Not a resident of this flat' } });
  // (login endpoints share a 20 / 15 min limiter, so resident 3 re-applies instead of registering a 4th user)
  await expect('join again after rejection (left pending)', 201, 'POST', '/memberships', { token: r3.accessToken, body: { societyId, buildingId: bB._id, flatNumber: '101', residentType: 'owner' } });
  const appd = await expect('', 200, 'GET', '/society/memberships?status=approved', { token: T });
  ok('approved directory has 2', appd.total === 2, appd.total);
  const flatsWithRes = await expect('', 200, 'GET', `/society/flats?buildingId=${bA._id}`, { token: T });
  ok('flat A-101 lists resident', flatsWithRes.items.find((f) => f.number === 'A-101')?.residents?.[0]?.name === 'Rahul Verma', flatsWithRes.items.find((f) => f.number === 'A-101'));
  state.resident = { phone: r1Phone, password: PASSWORD };

  // ------------------------------------------------------------------ finance
  head('Charges & invoices');
  const ch = await expect('', 201, 'POST', '/society/charges', { token: T, body: { name: 'Maintenance', calculation: 'per_sqft', amountPaise: 300 } });
  await expect('', 201, 'POST', '/society/charges', { token: T, body: { name: 'Sinking fund', calculation: 'fixed', amountPaise: 50000 } });
  const chProbe = await expect('partial patch probe', 200, 'PATCH', `/society/charges/${ch._id}`, { token: T, body: { amountPaise: 350 } });
  warn('PATCH /society/charges/:id with only {amountPaise} keeps calculation=per_sqft', chProbe?.calculation === 'per_sqft', { calculationAfter: chProbe?.calculation });
  await expect('full patch (as the panel sends)', 200, 'PATCH', `/society/charges/${ch._id}`, { token: T, body: { name: 'Maintenance', calculation: 'per_sqft', amountPaise: 350, active: true } });
  const charges = await expect('', 200, 'GET', '/society/charges', { token: T });
  ok('charges: items + billing + onlinePayments{available,reason}', Array.isArray(charges?.items) && charges?.billing && typeof charges?.onlinePayments?.available === 'boolean', charges?.onlinePayments);
  await expect('bad period', 400, 'POST', '/society/invoices/generate', { token: T, body: { period: '2026-13' } });
  const gen = await expect('generate current', 201, 'POST', '/society/invoices/generate', { token: T, body: { period: period(0), dueDate: istDay(10) } });
  ok('generate → created/alreadyBilled/zeroAmount', typeof gen?.created === 'number' && gen.created > 0 && has(gen, ['alreadyBilled', 'zeroAmount']), gen);
  const gen2 = await expect('generate again (idempotent)', 201, 'POST', '/society/invoices/generate', { token: T, body: { period: period(0) } });
  ok('second run bills nothing new', gen2?.created === 0 && gen2?.alreadyBilled === gen.created, gen2);
  const genPrev = await expect('generate previous month', 201, 'POST', '/society/invoices/generate', { token: T, body: { period: period(-1), buildingId: bB._id, dueDate: istDay(-5) } });
  ok('building-scoped generate', genPrev?.created > 0, genPrev);
  const invs = await expect('', 200, 'GET', `/society/invoices?period=${period(0)}&limit=50`, { token: T });
  ok('invoices paged + totals + balancePaise/overdue', isPaged(invs) && has(invs.totals, ['billedPaise', 'collectedPaise', 'outstandingPaise']) && has(invs.items[0], ['invoiceNumber', 'totalPaise', 'paidPaise', 'balancePaise', 'status', 'dueDate', 'overdue', 'flat', 'building']), invs?.items?.[0]);
  const overdue = await expect('overdue filter', 200, 'GET', '/society/invoices?overdue=true', { token: T });
  ok('overdue filter returns overdue only', overdue.items.length > 0 && overdue.items.every((i) => i.overdue), overdue.items.length);
  const a101 = flatsWithRes.items.find((f) => f.number === 'A-101');
  const invA101 = (await expect('flat filter', 200, 'GET', `/society/invoices?flatId=${a101._id}&period=${period(0)}`, { token: T })).items[0];
  const invDet = await expect('', 200, 'GET', `/society/invoices/${invA101._id}`, { token: T });
  ok('invoice detail lines + payments[]', Array.isArray(invDet?.lines) && Array.isArray(invDet?.payments) && invDet?.flat?.number === 'A-101', invDet);
  await expect('over balance', 400, 'POST', `/society/invoices/${invA101._id}/payments`, { token: T, body: { amountPaise: invDet.totalPaise + 100, method: 'cash' } });
  const pay1 = await expect('partial offline payment', 201, 'POST', `/society/invoices/${invA101._id}/payments`, { token: T, body: { amountPaise: Math.floor(invDet.totalPaise / 3), method: 'upi_direct', paidOn: istDay(0), referenceNumber: 'UPI123', idempotencyKey: `k-${RUN}-1` } });
  ok('payment has receipt + status', pay1?._id && (pay1?.receipt || pay1?.receiptId), pay1);
  const pay1dup = await expect('idempotent retry', [200, 201], 'POST', `/society/invoices/${invA101._id}/payments`, { token: T, body: { amountPaise: Math.floor(invDet.totalPaise / 3), method: 'upi_direct', paidOn: istDay(0), referenceNumber: 'UPI123', idempotencyKey: `k-${RUN}-1` } });
  ok('idempotency key returns the same payment', pay1dup?._id === pay1._id, { first: pay1?._id, second: pay1dup?._id });
  const pays = await expect('', 200, 'GET', '/society/payments?channel=offline', { token: T });
  ok('payments paged with invoice/flat/receipt populated', isPaged(pays) && pays.items[0]?.invoice?.invoiceNumber && pays.items[0]?.receipt?.receiptNumber && pays.items[0]?.flat?.number, pays?.items?.[0]);
  const receiptId = pays.items[0].receipt._id;
  const pdf = await expect('receipt pdf', 200, 'GET', `/society/receipts/${receiptId}/pdf`, { token: T, raw: true });
  ok('receipt is a PDF', pdf.buf?.subarray(0, 4).toString() === '%PDF', pdf.buf?.subarray(0, 8).toString());
  ok('CORS exposes Content-Disposition (filename)', /attachment/.test(pdf.headers.get('content-disposition') || ''), pdf.headers.get('content-disposition'));
  await expect('', 200, 'GET', `/society/payments/${pay1._id}`, { token: T });
  await expect('reverse without reason', 400, 'POST', `/society/payments/${pay1._id}/reverse`, { token: T, body: {} });
  const rev = await expect('reverse', 200, 'POST', `/society/payments/${pay1._id}/reverse`, { token: T, body: { reason: 'Entered against wrong flat' } });
  ok('reversed status', rev?.status === 'reversed' || rev?.payment?.status === 'reversed', rev);
  const pay2 = await expect('full payment', 201, 'POST', `/society/invoices/${invA101._id}/payments`, { token: T, body: { amountPaise: invDet.totalPaise, method: 'cheque', referenceNumber: 'CHQ-0091' } });
  const paidInv = await expect('', 200, 'GET', `/society/invoices/${invA101._id}`, { token: T });
  ok('invoice now paid', paidInv?.status === 'paid' && paidInv?.balancePaise === 0, { status: paidInv?.status, bal: paidInv?.balancePaise });
  await expect('cancel paid invoice', 409, 'POST', `/society/invoices/${invA101._id}/cancel`, { token: T, body: { reason: 'Duplicate' } });
  const prevInvs = await expect('', 200, 'GET', `/society/invoices?period=${period(-1)}`, { token: T });
  await expect('cancel unpaid', 200, 'POST', `/society/invoices/${prevInvs.items[0]._id}/cancel`, { token: T, body: { reason: 'Billed in error' } });
  const partInv = prevInvs.items[1];
  if (partInv) await expect('partial on overdue', 201, 'POST', `/society/invoices/${partInv._id}/payments`, { token: T, body: { amountPaise: Math.floor(partInv.totalPaise / 2), method: 'cash' } });
  const rem = await expect('reminders', 200, 'POST', '/society/invoices/reminders', { token: T });
  ok('reminders → reminded n', typeof rem?.reminded === 'number', rem);
  await expect('treasurer records payment', 201, 'POST', `/society/invoices/${invs.items.find((i) => i._id !== invA101._id)._id}/payments`, { token: TT, body: { amountPaise: 20000, method: 'bank_transfer', referenceNumber: 'NEFT-778' } });
  void pay2;

  head('Expenses, income, ledger');
  const up = await expect('expense attachment', 201, 'POST', '/uploads', { token: T, form: pngForm({ purpose: 'expense' }) });
  const exp = await expect('expense', 201, 'POST', '/society/expenses', { token: T, body: { category: 'Security', vendor: 'SafeGuard Services', description: 'October guards', amountPaise: 1800000, paidOn: istDay(0), account: 'bank', referenceNumber: 'INV-2231', attachments: [up._id] } });
  const exp2 = await expect('expense 2', 201, 'POST', '/society/expenses', { token: T, body: { category: 'Electricity', vendor: 'MSEDCL', amountPaise: 950000, paidOn: istDay(-3), account: 'bank' } });
  const exps = await expect('', 200, 'GET', '/society/expenses', { token: T });
  ok('expenses paged + categories[] + attachments[url]', isPaged(exps) && Array.isArray(exps.categories) && exps.items.find((e) => e._id === exp._id)?.attachments?.[0]?.url, exps?.items?.[0]);
  await expect('void', 200, 'POST', `/society/expenses/${exp2._id}/void`, { token: T, body: { reason: 'Duplicate entry' } });
  await expect('void twice', 409, 'POST', `/society/expenses/${exp2._id}/void`, { token: T, body: { reason: 'Duplicate entry' } });
  const voided = await expect('voided list', 200, 'GET', '/society/expenses?status=voided', { token: T });
  ok('voided filter', voided.items.some((e) => e._id === exp2._id && e.voidReason), voided.items.length);
  await expect('income', 201, 'POST', '/society/income', { token: T, body: { category: 'Hall rental', description: 'Clubhouse booking', amountPaise: 300000, receivedOn: istDay(0), account: 'cash' } });
  await expect('opening balance', 201, 'POST', '/society/ledger/opening-balance', { token: T, body: { amountPaise: 5000000, asOf: `${period(-2)}-01`, account: 'bank' } });
  await expect('opening balance twice', 409, 'POST', '/society/ledger/opening-balance', { token: T, body: { amountPaise: 100, asOf: istDay(0), account: 'bank' } });
  const adj = await expect('adjustment', 201, 'POST', '/society/ledger/adjustments', { token: T, body: { direction: 'debit', amountPaise: 15000, account: 'bank', category: 'Bank charges', memo: 'Quarterly bank charges' } });
  const led = await expect('', 200, 'GET', '/society/ledger?limit=50', { token: T });
  ok('ledger paged with direction/amount/account/entryType', isPaged(led) && has(led.items[0], ['date', 'direction', 'amountPaise', 'account', 'category', 'entryType']), led?.items?.[0]);
  const ledF = await expect('ledger filters', 200, 'GET', `/society/ledger?entryType=expense&account=bank&from=${istDay(-30)}&to=${istDay(0)}`, { token: T });
  ok('ledger filter works', ledF.items.every((e) => e.entryType === 'expense' && e.account === 'bank'), ledF.items.map((e) => e.entryType));
  await expect('reverse adjustment', 201, 'POST', `/society/ledger/${adj._id}/reverse`, { token: T, body: { reason: 'Charged in error' } });
  const payEntry = led.items.find((e) => e.entryType === 'maintenance_collection');
  if (payEntry) await expect('reverse payment entry blocked', 400, 'POST', `/society/ledger/${payEntry._id}/reverse`, { token: T, body: { reason: 'nope nope' } });

  head('Reports');
  const types = await expect('', 200, 'GET', '/society/reports', { token: T });
  ok('report types list with params', Array.isArray(types?.items) && types.items.length >= 8 && types.items.every((t) => has(t, ['type', 'label', 'params'])), types?.items?.map((t) => t.type));
  const params = { period: period(0), year: String(new Date().getFullYear()), from: istDay(-60), to: istDay(0), flatId: a101._id };
  for (const t of types.items) {
    const qs = new URLSearchParams(Object.fromEntries(t.params.map((p) => [p, params[p]]))).toString();
    const j = await expect(t.type, 200, 'GET', `/society/reports/${t.type}?format=json${qs ? `&${qs}` : ''}`, { token: T });
    ok(`${t.type}: title/columns/rows/notes`, j && typeof j.title === 'string' && Array.isArray(j.columns) && Array.isArray(j.rows) && Array.isArray(j.notes) && j.notes.length > 0, j && Object.keys(j));
  }
  const rp = await expect('pdf', 200, 'GET', `/society/reports/dues?format=pdf`, { token: T, raw: true });
  ok('report PDF magic', rp.buf?.subarray(0, 4).toString() === '%PDF', rp.buf?.subarray(0, 4).toString());
  const rx = await expect('xlsx', 200, 'GET', `/society/reports/collection-monthly?format=xlsx&period=${period(0)}`, { token: T, raw: true });
  ok('report XLSX is a zip (PK)', rx.buf?.subarray(0, 2).toString() === 'PK', rx.buf?.subarray(0, 2).toString());
  await expect('treasurer report', 200, 'GET', '/society/reports/dues', { token: TT });

  // ------------------------------------------------------------------ operations
  head('Complaints');
  const ccats = await expect('', 200, 'GET', '/resident/complaint-categories', { token: R1 });
  const cmp = await expect('resident complaint', 201, 'POST', '/resident/complaints', { token: R1, body: { categoryId: ccats.items[0]._id, title: 'Water leakage in bathroom', description: 'Ceiling of the bathroom has been leaking since yesterday night.', priority: 'high' } });
  await expect('resident complaint 2', 201, 'POST', '/resident/complaints', { token: R2, body: { categoryId: ccats.items[1]?._id || ccats.items[0]._id, title: 'Lift not working', description: 'The Tower A lift stops between floors 2 and 3.', priority: 'urgent' } });
  const clist = await expect('', 200, 'GET', '/society/complaints?status=pending', { token: T });
  ok('complaints paged + raisedBy/flat/category', isPaged(clist) && clist.items[0]?.raisedBy?.name && clist.items[0]?.flat?.number && clist.items[0]?.category?.name, clist?.items?.[0]);
  const cf = await expect('priority filter', 200, 'GET', '/society/complaints?priority=urgent', { token: T });
  ok('priority filter', cf.items.every((c) => c.priority === 'urgent'), cf.items.map((c) => c.priority));
  await expect('invalid transition', 400, 'POST', `/society/complaints/${cmp._id}/status`, { token: T, body: { status: 'closed' } });
  const asg = await expect('assign', 200, 'POST', `/society/complaints/${cmp._id}/assign`, { token: T, body: { assigneeType: 'vendor', assigneeName: 'Ramesh Plumbing', assigneePhone: '9876543210', note: 'Visit today' } });
  ok('assign moves to assigned', asg?.status === 'assigned', asg);
  await expect('in progress', 200, 'POST', `/society/complaints/${cmp._id}/status`, { token: T, body: { status: 'in_progress', note: 'Plumber on site' } });
  await expect('remark', 200, 'POST', `/society/complaints/${cmp._id}/remarks`, { token: T, body: { note: 'Seepage traced to the flat above.' } });
  await expect('resolve', 200, 'POST', `/society/complaints/${cmp._id}/status`, { token: T, body: { status: 'resolved', note: 'Pipe joint replaced' } });
  const cd = await expect('', 200, 'GET', `/society/complaints/${cmp._id}`, { token: T });
  ok('detail has timeline[by] + assignments[] + media[]', cd?.timeline?.length >= 4 && cd?.timeline?.some((t) => t.by?.name) && cd?.assignments?.length === 1 && Array.isArray(cd?.media), { tl: cd?.timeline?.length, as: cd?.assignments?.length });
  await expect('manager-less: treasurer blocked', 403, 'POST', `/society/complaints/${cmp._id}/remarks`, { token: TT, body: { note: 'hello there' } });

  head('Announcements');
  const ann = await expect('', 201, 'POST', '/society/announcements', { token: T, body: { title: 'Water supply interruption', body: 'Water supply will be off on Sunday 10am–2pm for tank cleaning.', category: 'maintenance', important: true } });
  await expect('event', 201, 'POST', '/society/announcements', { token: T, body: { title: 'Diwali celebration', body: 'Join us in the clubhouse for the Diwali get-together.', category: 'event', eventDate: new Date(Date.now() + 7 * 86400000).toISOString() } });
  const aProbe = await expect('partial patch probe', 200, 'PATCH', `/society/announcements/${ann._id}`, { token: T, body: { body: 'Water supply will be off on Sunday 10am–3pm for tank cleaning.' } });
  warn('PATCH /society/announcements/:id with only {body} keeps category/important', aProbe?.category === 'maintenance' && aProbe?.important === true, { category: aProbe?.category, important: aProbe?.important });
  await expect('full patch (as the panel sends)', 200, 'PATCH', `/society/announcements/${ann._id}`, { token: T, body: { title: 'Water supply interruption', body: 'Water supply will be off on Sunday 10am–3pm for tank cleaning.', category: 'maintenance', important: true, attachments: [] } });
  const anns = await expect('', 200, 'GET', '/society/announcements', { token: T });
  ok('announcements paged + createdBy', isPaged(anns) && anns.items[0]?.createdBy?.name !== undefined, anns?.items?.[0]);
  await expect('archive', 200, 'POST', `/society/announcements/${ann._id}/archive`, { token: T });
  await expect('treasurer cannot post notice', 403, 'POST', '/society/announcements', { token: TT, body: { title: 'Test notice', body: 'Body of the test notice', category: 'general' } });

  head('Community');
  const post = await expect('resident post', 201, 'POST', '/resident/posts', { token: R1, body: { body: 'Anyone up for a Sunday morning cricket match?' } });
  const post2 = await expect('resident 2 post', 201, 'POST', '/resident/posts', { token: R2, body: { body: 'Selling my old bicycle, good condition. DM me.' } });
  await expect('report post', 201, 'POST', `/resident/posts/${post._id}/report`, { token: R2, body: { reason: 'Spam / off-topic' } });
  const reported = await expect('', 200, 'GET', '/society/posts?reported=true', { token: T });
  ok('reported posts include our post with author + reportCount', reported.items.some((p) => p._id === post._id && p.author?.name && p.reportCount >= 1), reported.items[0]);
  const reps = await expect('', 200, 'GET', '/society/content-reports', { token: T });
  ok('content reports with target.preview', reps.items.some((r) => r.target?.preview), reps.items[0]);
  await expect('hide', 200, 'POST', `/society/posts/${post._id}/moderate`, { token: T, body: { action: 'hide', note: 'Off-topic' } });
  await expect('restore', 200, 'POST', `/society/posts/${post._id}/moderate`, { token: T, body: { action: 'restore' } });
  await expect('report another post', 201, 'POST', `/resident/posts/${post2._id}/report`, { token: R1, body: { reason: 'Selling is not allowed here' } });
  await expect('duplicate report', 409, 'POST', `/resident/posts/${post._id}/report`, { token: R2, body: { reason: 'Still spam' } });
  const reps2 = await expect('', 200, 'GET', '/society/content-reports?status=open', { token: T });
  ok('an open report exists to dismiss', reps2.items.length > 0, reps2.items.length);
  if (reps2.items[0]) await expect('dismiss', 200, 'POST', `/society/content-reports/${reps2.items[0]._id}/dismiss`, { token: T });
  await expect('official post', 201, 'POST', '/society/posts', { token: T, body: { body: 'Welcome to the new community feed! Please be kind.' } });
  const poll = await expect('poll', 201, 'POST', '/society/polls', { token: T, body: { question: 'Should we install EV chargers in the parking?', options: ['Yes', 'No', 'Need more info'], closesAt: new Date(Date.now() + 5 * 86400000).toISOString() } });
  await expect('dupe options', 400, 'POST', '/society/polls', { token: T, body: { question: 'Duplicate options?', options: ['Yes', 'yes'] } });
  const rpolls = await expect('', 200, 'GET', '/resident/polls', { token: R1 });
  const myPoll = rpolls.items.find((p) => p._id === poll._id);
  await expect('vote', [200, 201], 'POST', `/resident/polls/${poll._id}/vote`, { token: R1, body: { optionId: myPoll.options[0]._id } });
  const polls = await expect('', 200, 'GET', '/society/polls', { token: T });
  const pRow = polls.items.find((p) => p._id === poll._id);
  ok('admin polls show options with votes', pRow?.options?.length === 3 && typeof pRow.options[0].votes === 'number', pRow?.options);
  await expect('close poll', 200, 'POST', `/society/polls/${poll._id}/close`, { token: T });

  head('Facilities & bookings');
  const fac = await expect('', 201, 'POST', '/society/facilities', { token: T, body: { name: 'Clubhouse', description: 'AC party hall', icon: 'home', feePaise: 150000, capacity: 80, openTime: '08:00', closeTime: '22:00', slotMinutes: 120, maxAdvanceDays: 60, requiresApproval: true, rules: 'No loud music after 10pm', active: true } });
  await expect('gym', 201, 'POST', '/society/facilities', { token: T, body: { name: 'Gym', feePaise: 0, openTime: '05:00', closeTime: '23:00', slotMinutes: 60, maxAdvanceDays: 7, requiresApproval: false, active: true } });
  await expect('bad slot', 400, 'POST', '/society/facilities', { token: T, body: { name: 'Pool', feePaise: 0, openTime: '05:00', closeTime: '23:00', slotMinutes: 45, maxAdvanceDays: 7, requiresApproval: false, active: true } });
  const fProbe = await expect('partial patch probe', 200, 'PATCH', `/society/facilities/${fac._id}`, { token: T, body: { capacity: 100 } });
  warn('PATCH /society/facilities/:id with only {capacity} keeps requiresApproval/fee/slots', fProbe?.requiresApproval === true && fProbe?.feePaise === 150000 && fProbe?.slotMinutes === 120, { requiresApproval: fProbe?.requiresApproval, feePaise: fProbe?.feePaise, slotMinutes: fProbe?.slotMinutes });
  await expect('full patch (as the panel sends)', 200, 'PATCH', `/society/facilities/${fac._id}`, { token: T, body: { name: 'Clubhouse', description: 'AC party hall', icon: 'home', feePaise: 150000, capacity: 100, openTime: '08:00', closeTime: '22:00', slotMinutes: 120, maxAdvanceDays: 60, requiresApproval: true, rules: 'No loud music after 10pm', active: true } });
  const facs = await expect('', 200, 'GET', '/society/facilities', { token: T });
  ok('facilities list', facs?.items?.length === 2, facs?.items?.length);
  const bk1 = await expect('book 1', 201, 'POST', '/resident/bookings', { token: R1, body: { facilityId: fac._id, date: istDay(2), startTime: '10:00', purpose: 'Birthday party' } });
  const bk2 = await expect('book 2', 201, 'POST', '/resident/bookings', { token: R2, body: { facilityId: fac._id, date: istDay(3), startTime: '14:00', purpose: 'Kitty party' } });
  const bk3 = await expect('book 3', 201, 'POST', '/resident/bookings', { token: R2, body: { facilityId: fac._id, date: istDay(4), startTime: '18:00' } });
  const bks = await expect('', 200, 'GET', '/society/bookings?status=pending', { token: T });
  ok('bookings paged with facility/user populated', isPaged(bks) && bks.items[0]?.facility?.name && bks.items[0]?.user?.name, bks?.items?.[0]);
  await expect('confirm', 200, 'POST', `/society/bookings/${bk1._id}/decision`, { token: T, body: { decision: 'confirmed' } });
  await expect('reject', 200, 'POST', `/society/bookings/${bk2._id}/decision`, { token: T, body: { decision: 'rejected', reason: 'Hall under maintenance' } });
  await expect('cancel without reason', 400, 'POST', `/society/bookings/${bk1._id}/cancel`, { token: T, body: {} });
  await expect('cancel confirmed', 200, 'POST', `/society/bookings/${bk1._id}/cancel`, { token: T, body: { reason: 'Society event on the same day' } });
  void bk3;

  head('Service requests');
  const scats = await expect('', 200, 'GET', '/resident/service-categories', { token: R1 });
  const sr = await expect('resident request', 201, 'POST', '/resident/service-requests', { token: R1, body: { categoryId: scats.items[0]._id, description: 'Need an electrician to fix the hall fan.', preferredDate: istDay(1), preferredTime: 'Morning' } });
  await expect('2nd request', 201, 'POST', '/resident/service-requests', { token: R2, body: { categoryId: scats.items[0]._id, description: 'Deep cleaning of kitchen chimney.' } });
  const srs = await expect('', 200, 'GET', '/society/service-requests', { token: T });
  ok('service requests paged with category/user/flat', isPaged(srs) && srs.items[0]?.category?.name && srs.items[0]?.user?.name, srs?.items?.[0]);
  await expect('accept', 200, 'POST', `/society/service-requests/${sr._id}/status`, { token: T, body: { status: 'accepted', assigneeName: 'Suresh (electrician)' } });
  await expect('schedule', 200, 'POST', `/society/service-requests/${sr._id}/status`, { token: T, body: { status: 'scheduled', scheduledFor: new Date(Date.now() + 86400000).toISOString(), note: 'Tomorrow 11am' } });
  await expect('invalid transition', 400, 'POST', `/society/service-requests/${sr._id}/status`, { token: T, body: { status: 'accepted' } });

  head('Listings moderation (society marketplace)');
  // Property and service listings are vendor-only now: residents (members) browse and book, but cannot list them.
  const propBody = { listingType: 'rent', propertyType: 'apartment', title: `2BHK near the park ${RUN}`, description: 'Sunny 2BHK with balcony', pricePaise: 2500000, areaSqft: 950, bedrooms: 2, bathrooms: 2, furnishing: 'semi_furnished', city: 'Pune', locality: 'Baner', contactPhone: randPhone() };
  const rProp = await expect('resident lists a property', 403, 'POST', '/properties', { token: R1, body: propBody });
  ok('resident property → VENDOR_ONLY', rProp?.error?.code === 'VENDOR_ONLY', rProp?.error);
  const ocats = await expect('offer categories', 200, 'GET', '/service-offers/categories', { token: R1 });
  const offerBody = { categoryId: ocats.items[0]._id, title: `Home tuition for class 6-10 ${RUN}`, priceType: 'per_hour', pricePaise: 50000, experienceYears: 5, serviceArea: 'Baner, Aundh', city: 'Pune', availabilityNote: 'Evenings', contactPhone: randPhone() };
  const rOffer = await expect('resident offers a service', 403, 'POST', '/service-offers', { token: R1, body: offerBody });
  ok('resident service → VENDOR_ONLY', rOffer?.error?.code === 'VENDOR_ONLY', rOffer?.error);
  await expect('resident cannot upload property photos', 403, 'POST', '/uploads', { token: R1, form: uploadForm('property') });
  // Marketplace items stay with the society (listingsRequireApproval is on → pending).
  const mcats = await expect('', 200, 'GET', '/marketplace/categories', { token: R2 });
  const mk = await expect('marketplace', 201, 'POST', '/marketplace', { token: R2, body: { categoryId: mcats.items[0]._id, title: 'Kids bicycle', description: 'Hardly used', pricePaise: 350000, condition: 'like_new', city: 'Pune', contactPhone: randPhone(), visibility: 'society' } });
  ok('society marketplace item pending, linked to the society', mk?.moderationStatus === 'pending' && mk?.society === societyId, { status: mk?.moderationStatus, society: mk?.society });
  const mk2 = await expect('marketplace 2', 201, 'POST', '/marketplace', { token: R1, body: { categoryId: mcats.items[0]._id, title: 'Study table', pricePaise: 120000, condition: 'good', city: 'Pune', contactPhone: randPhone() } });
  const slm = await expect('', 200, 'GET', '/society/listings?kind=marketplace&status=pending', { token: T });
  const slmRow = slm.items?.find((l) => l._id === mk._id);
  ok('marketplace queue row: seller + category + condition (panel columns)', slmRow?.seller?.name === 'Priya Nair' && slmRow?.category?.name && slmRow?.condition === 'like_new', slmRow);
  ok('marketplace queue has both items', slm.items.some((l) => l._id === mk2._id), slm.items.map((l) => l.title));
  const pendingByKind = async () => {
    const n = {};
    for (const k of ['marketplace', 'property', 'service']) n[k] = (await expect(`pending ${k}`, 200, 'GET', `/society/listings?kind=${k}&status=pending&limit=1`, { token: T }))?.total;
    return n;
  };
  let pk = await pendingByKind();
  ov = await expect('', 200, 'GET', '/society/overview', { token: T });
  ok('sidebar badge (overview pendingListings) = sum of the three tabs', ov.counts.pendingListings === pk.marketplace + pk.property + pk.service && pk.marketplace === 2, { badge: ov.counts.pendingListings, tabs: pk });
  await expect('treasurer cannot moderate marketplace', 403, 'POST', `/society/listings/marketplace/${mk._id}/moderate`, { token: TT, body: { decision: 'approved' } });
  await expect('bad decision', 400, 'POST', `/society/listings/marketplace/${mk._id}/moderate`, { token: T, body: { decision: 'maybe' } });
  await expect('approve marketplace', 200, 'POST', `/society/listings/marketplace/${mk._id}/moderate`, { token: T, body: { decision: 'approved', note: 'Looks good' } });
  await expect('reject marketplace', 200, 'POST', `/society/listings/marketplace/${mk2._id}/moderate`, { token: T, body: { decision: 'rejected', note: 'Add a photo' } });
  const sla = await expect('', 200, 'GET', '/society/listings?kind=marketplace&status=approved', { token: T });
  ok('approved marketplace item moves to Approved', sla.items.some((l) => l._id === mk._id && l.moderationNote === 'Looks good'), sla.items.map((l) => l.title));
  const slr = await expect('', 200, 'GET', '/society/listings?kind=marketplace&status=rejected', { token: T });
  ok('rejected marketplace item moves to Rejected', slr.items.some((l) => l._id === mk2._id), slr.items.map((l) => l.title));
  const mkPublic = await expect('resident sees approved item', 200, 'GET', `/marketplace/${mk._id}`, { token: R1 });
  ok('approved society item visible to a neighbour', mkPublic?._id === mk._id, mkPublic);
  ov = await expect('', 200, 'GET', '/society/overview', { token: T });
  ok('badge drops to 0 after moderation', ov.counts.pendingListings === 0, ov.counts.pendingListings);

  head('Vendor accounts (no society access, platform-moderated listings)');
  const vReg = await expect('vendor register', 201, 'POST', '/auth/vendor/register', { body: { phone: randPhone(), name: `Sharma Services ${RUN}`, password: PASSWORD } });
  ok('account type vendor, KYC not submitted', vReg?.user?.accountType === 'vendor' && vReg?.vendor?.kycStatus === 'not_submitted', { user: vReg?.user, vendor: vReg?.vendor });
  const V = vReg.accessToken;
  const vJoin = await expect('vendor requests membership', 403, 'POST', '/memberships', { token: V, body: { societyId, buildingId: bA._id, flatNumber: 'A-201', residentType: 'owner' } });
  ok('membership → VENDOR_NO_SOCIETY', vJoin?.error?.code === 'VENDOR_NO_SOCIETY', vJoin?.error);
  const vHome = await expect('vendor resident home', 403, 'GET', '/resident/home', { token: V });
  ok('/resident/home → VENDOR_NO_SOCIETY', vHome?.error?.code === 'VENDOR_NO_SOCIETY', vHome?.error);
  const vSoc = await expect('vendor society API', 403, 'GET', '/society/overview', { token: V });
  warn('vendor on /society/* → VENDOR_NO_SOCIETY as API.md says (an app session is refused earlier with FORBIDDEN)', vSoc?.error?.code === 'VENDOR_NO_SOCIETY', vSoc?.error);
  const pendingMembersNow = (await expect('', 200, 'GET', '/society/memberships?status=pending', { token: T }))?.total;
  ok('vendor did not create a membership request', pendingMembersNow === 1, pendingMembersNow);
  const vEarly = await expect('vendor lists before KYC', 403, 'POST', '/properties', { token: V, body: propBody });
  ok('before KYC → KYC_REQUIRED', vEarly?.error?.code === 'KYC_REQUIRED', vEarly?.error);
  // KYC: three photos + a Verhoeff-valid Aadhaar, approved by the platform owner.
  const kycDocs = [];
  for (let i = 0; i < 3; i++) kycDocs.push((await expect(`kyc photo ${i + 1}`, 201, 'POST', '/uploads', { token: V, form: uploadForm('kyc') }))?._id);
  const kyc = await expect('submit KYC', 200, 'PUT', '/vendor/kyc', { token: V, body: { businessName: `Sharma Services ${RUN}`, businessType: 'business', city: 'Pune', address: '12 Market Road', pan: `ABCDE${String(Date.now()).slice(-4)}F`, aadhaar: withVerhoeff(`2${String(Date.now()).slice(-10)}`), bankAccountHolder: 'Ravi Sharma', bankAccountNumber: `5001${String(Date.now()).slice(-8)}`, bankIfsc: 'SBIN0001234', bankName: 'SBI', panPhoto: kycDocs[0], aadhaarFront: kycDocs[1], aadhaarBack: kycDocs[2], consent: true } });
  ok('KYC pending', kyc?.kycStatus === 'pending', kyc);
  await expect('society admin cannot review vendors', 403, 'POST', `/platform/vendors/${vReg.user._id}/kyc`, { token: T, body: { decision: 'approved' } });
  const kycOk = await expect('owner approves KYC', 200, 'POST', `/platform/vendors/${vReg.user._id}/kyc`, { token: saT, body: { decision: 'approved' } });
  ok('KYC approved', kycOk?.kycStatus === 'approved', kycOk);
  const vPhoto = await expect('vendor property photo', 201, 'POST', '/uploads', { token: V, form: uploadForm('property') });
  const vProp = await expect('vendor lists a property', 201, 'POST', '/properties', { token: V, body: { ...propBody, photos: [vPhoto._id] } });
  ok('vendor property has no society', vProp && !vProp.society, vProp?.society);
  const vOffer = await expect('vendor lists a service', 201, 'POST', '/service-offers', { token: V, body: offerBody });
  ok('vendor service has no society', vOffer && !vOffer.society, vOffer?.society);
  for (const st of ['pending', 'approved', 'rejected', 'removed']) {
    const sp = await expect(`society property ${st}`, 200, 'GET', `/society/listings?kind=property&status=${st}&limit=100`, { token: T });
    const ss = await expect(`society service ${st}`, 200, 'GET', `/society/listings?kind=service&status=${st}&limit=100`, { token: T });
    ok(`vendor listings never in /society/listings (${st})`, !sp.items.some((l) => l._id === vProp._id) && !ss.items.some((l) => l._id === vOffer._id), { property: sp.items.map((l) => l._id), service: ss.items.map((l) => l._id) });
  }
  pk = await pendingByKind();
  ov = await expect('', 200, 'GET', '/society/overview', { token: T });
  ok('vendor listings do not raise the society badge', ov.counts.pendingListings === 0 && pk.property === 0 && pk.service === 0, { badge: ov.counts.pendingListings, tabs: pk });
  const modP = await expect('society admin moderates vendor property', 404, 'POST', `/society/listings/property/${vProp._id}/moderate`, { token: T, body: { decision: 'approved' } });
  ok('vendor property → 404 NOT_FOUND', modP?.error?.code === 'NOT_FOUND', modP?.error);
  const modS = await expect('society admin moderates vendor service', 404, 'POST', `/society/listings/service/${vOffer._id}/moderate`, { token: T, body: { decision: 'removed' } });
  ok('vendor service → 404 NOT_FOUND', modS?.error?.code === 'NOT_FOUND', modS?.error);
  // The platform owner moderates vendor listings.
  const pl = await expect('', 200, 'GET', '/platform/listings?kind=property&status=pending&scope=independent&limit=100', { token: saT });
  ok('platform queue has the vendor property (independent, owner populated)', pl.items.some((l) => l._id === vProp._id && !l.society && l.owner?.name), pl.items[0]);
  await expect('platform approves property', 200, 'POST', `/platform/listings/property/${vProp._id}/moderate`, { token: saT, body: { decision: 'approved' } });
  const pso = await expect('', 200, 'GET', '/platform/listings?kind=service&status=pending&scope=independent&limit=100', { token: saT });
  ok('platform queue has the vendor service (provider populated)', pso.items?.some((l) => l._id === vOffer._id && l.provider?.name), pso.items?.[0]);
  await expect('platform approves service', 200, 'POST', `/platform/listings/service/${vOffer._id}/moderate`, { token: saT, body: { decision: 'approved', note: 'Welcome!' } });
  const spa = await expect('', 200, 'GET', '/society/listings?kind=property&status=approved&limit=100', { token: T });
  ok('approved vendor property still not in the society queue', !spa.items.some((l) => l._id === vProp._id), spa.items.length);
  const browse = await expect('resident browses services', 200, 'GET', `/service-offers?q=${encodeURIComponent('Home tuition')}`, { token: R1 });
  ok('residents still browse the approved vendor service', browse.items?.some((o) => o._id === vOffer._id), browse.items?.length);
  await expect('platform rejects a service', 200, 'POST', `/platform/listings/service/${vOffer._id}/moderate`, { token: saT, body: { decision: 'rejected', note: 'Add a clearer title' } });

  head('Categories');
  const sc = await expect('society cats', 200, 'GET', '/society/categories?kind=complaint', { token: T });
  ok('society categories with scope', sc.items.every((c) => ['platform', 'society'].includes(c.scope)), sc.items[0]);
  const ncat = await expect('create', 201, 'POST', '/society/categories', { token: T, body: { kind: 'complaint', name: `Garden ${RUN}`, icon: 'leaf' } });
  await expect('edit', 200, 'PATCH', `/society/categories/${ncat._id}`, { token: T, body: { kind: 'complaint', name: `Garden ${RUN}`, icon: 'leaf', active: false, sortOrder: 0 } });
  const platformCat = sc.items.find((c) => c.scope === 'platform');
  await expect('cannot edit platform category', 404, 'PATCH', `/society/categories/${platformCat._id}`, { token: T, body: { name: 'Hacked' } });

  head('Audit & notifications');
  const al = await expect('', 200, 'GET', '/society/audit-logs', { token: T });
  ok('audit paged with actor + action + summary', isPaged(al) && al.items[0]?.action && al.items[0]?.actor, al?.items?.[0]);
  const alf = await expect('action filter', 200, 'GET', '/society/audit-logs?action=invoice', { token: T });
  ok('audit action prefix filter', alf.items.every((a) => a.action.startsWith('invoice')), alf.items.map((a) => a.action));
  const nt = await expect('', 200, 'GET', '/notifications', { token: T });
  ok('notifications paged + unread', isPaged(nt) && typeof nt.unread === 'number', nt);
  const rn = await expect('resident notifications', 200, 'GET', '/notifications', { token: R1 });
  if (rn.items[0]) await expect('mark read', 200, 'POST', `/notifications/${rn.items[0]._id}/read`, { token: R1 });
  await expect('read all', 200, 'POST', '/notifications/read-all', { token: T });

  // ------------------------------------------------------------------ platform
  head('Platform');
  const po = await expect('', 200, 'GET', '/platform/overview', { token: saT });
  ok('overview counts + payments30d + billing', has(po, ['counts', 'payments30d', 'billing']) && has(po.counts, ['societies', 'suspended', 'pendingRegistrations', 'users', 'newUsers30d', 'members', 'pendingMembers', 'openComplaints', 'pendingListings', 'openReports']), po);
  ok('payments30d rows {channel,status,totalPaise,count}', po.payments30d.every((p) => has(p, ['channel', 'status', 'totalPaise', 'count'])), po.payments30d);
  const socs = await expect('', 200, 'GET', `/platform/societies?q=${encodeURIComponent('Green Meadows')}`, { token: saT });
  ok('societies search + residentCount/staffCount', socs.items.some((s) => s._id === societyId && typeof s.residentCount === 'number' && typeof s.staffCount === 'number'), socs.items[0]);
  const sd = await expect('', 200, 'GET', `/platform/societies/${societyId}`, { token: saT });
  ok('society detail staff[] + financeSummary + payments', Array.isArray(sd?.staff) && has(sd?.financeSummary, ['invoices', 'billedPaise', 'collectedPaise']) && sd?.payments, { fs: sd?.financeSummary, p: sd?.payments });
  await expect('suspend without reason', 400, 'POST', `/platform/societies/${societyId}/suspend`, { token: saT, body: {} });
  await expect('suspend', 200, 'POST', `/platform/societies/${societyId}/suspend`, { token: saT, body: { reason: 'KYC pending' } });
  const blocked = await expect('suspended society write', 403, 'POST', '/society/buildings', { token: T, body: { name: 'Tower Q', floors: 1 } });
  ok('suspended → SOCIETY_SUSPENDED', blocked?.error?.code === 'SOCIETY_SUSPENDED', blocked?.error);
  await expect('suspended society can still read', 200, 'GET', '/society/overview', { token: T });
  await expect('reactivate', 200, 'POST', `/platform/societies/${societyId}/reactivate`, { token: saT, body: {} });
  await expect('enable online w/o settlement', 400, 'PATCH', `/platform/societies/${societyId}/payments`, { token: saT, body: { onlineEnabled: true, settlementMode: 'none' } });
  await expect('route w/o account', 400, 'PATCH', `/platform/societies/${societyId}/payments`, { token: saT, body: { onlineEnabled: true, settlementMode: 'razorpay_route' } });
  const pcfg = await expect('payments config', 200, 'PATCH', `/platform/societies/${societyId}/payments`, { token: saT, body: { onlineEnabled: false, settlementMode: 'none' } });
  ok('payments config returned', pcfg?.onlineEnabled === false, pcfg);
  const addA = await expect('add admin', 201, 'POST', `/platform/societies/${societyId}/admins`, { token: saT, body: { name: 'Second Admin', email: `admin2.${RUN}@example.com`, role: 'secretary' } });
  ok('add admin → setupLink', typeof addA?.setupLink === 'string', addA);
  const rl = await expect('reset link', 200, 'POST', `/platform/staff/${addA.staff._id}/reset-link`, { token: saT });
  ok('reset link → setupLink + expiresInHours', typeof rl?.setupLink === 'string' && rl?.expiresInHours, rl);
  const users = await expect('', 200, 'GET', '/platform/users?q=Priya', { token: saT });
  ok('users search', users.items.some((u) => u.name === 'Priya Nair'), users.items.map((u) => u.name));
  const uKeys = Object.keys(users.items[0] || {});
  ok('users list does not leak password hashes / tokens', !uKeys.some((k) => /password|token|hash/i.test(k)), uKeys);
  const priya = users.items.find((u) => u.name === 'Priya Nair');
  await expect('disable user', 200, 'POST', `/platform/users/${priya._id}/disabled`, { token: saT, body: { reason: 'Spam reports' } });
  const dis = await call('GET', '/me', { token: R2 });
  ok('disabled user token → 401 ACCOUNT_DISABLED or SESSION_INVALID', dis.status === 401 && ['ACCOUNT_DISABLED', 'SESSION_INVALID'].includes(dis.json?.error?.code), dis.json);
  await expect('enable user', 200, 'POST', `/platform/users/${priya._id}/active`, { token: saT, body: {} });
  const usersF = await expect('status filter', 200, 'GET', '/platform/users?status=active&role=user', { token: saT });
  ok('user filters', usersF.items.every((u) => u.status === 'active' && u.platformRole === 'user'), usersF.items.length);
  const pc = await expect('', 200, 'GET', '/platform/categories?kind=service', { token: saT });
  ok('platform categories', Array.isArray(pc.items) && pc.items.every((c) => c.kind === 'service'), pc.items.length);
  const pcat = await expect('create cat', 201, 'POST', '/platform/categories', { token: saT, body: { kind: 'marketplace', name: `Books ${RUN}`, icon: 'book', sortOrder: 5 } });
  await expect('edit cat', 200, 'PATCH', `/platform/categories/${pcat._id}`, { token: saT, body: { kind: 'marketplace', name: `Books ${RUN}`, icon: 'book', active: false, sortOrder: 5 } });
  await expect('duplicate cat', 409, 'POST', '/platform/categories', { token: saT, body: { kind: 'marketplace', name: `Books ${RUN}` } });
  const pa = await expect('platform announcement', 201, 'POST', '/platform/announcements', { token: saT, body: { title: 'Scheduled maintenance', body: 'adda will be unavailable on Sunday 2–3am IST.', category: 'maintenance' } });
  const pas = await expect('', 200, 'GET', '/platform/announcements', { token: saT });
  ok('platform announcements paged', isPaged(pas) && pas.items.some((a) => a._id === pa._id), pas.total);
  await expect('archive', 200, 'POST', `/platform/announcements/${pa._id}/archive`, { token: saT });
  const sets = await expect('', 200, 'GET', '/platform/settings', { token: saT });
  ok('settings items {key,type,value}', sets.items.every((s) => has(s, ['key', 'type', 'value'])), sets.items);
  await expect('set support email', 200, 'PUT', '/platform/settings/support.email', { token: saT, body: { value: 'support@adda.example' } });
  await expect('wrong type', 400, 'PUT', '/platform/settings/listings.requireApproval', { token: saT, body: { value: 'yes' } });
  await expect('unknown key', 400, 'PUT', '/platform/settings/foo.bar', { token: saT, body: { value: 'x' } });
  const pal = await expect('', 200, 'GET', `/platform/audit-logs?societyId=${societyId}`, { token: saT });
  ok('platform audit filtered by society', pal.items.length > 0 && pal.items.every((a) => (a.society?._id || a.society) === societyId), pal.items.length);
  const pp = await expect('', 200, 'GET', `/platform/payments?societyId=${societyId}`, { token: saT });
  ok('platform payments with society populated', pp.items.length > 0 && pp.items[0].society?.name, pp.items[0]);
  const pr = await expect('', 200, 'GET', '/platform/content-reports?status=open', { token: saT });
  ok('platform content reports paged', isPaged(pr), pr);

  // ------------------------------------------------------------------ session handling
  head('Session: refresh rotation, logout');
  const rf = await expect('refresh', 200, 'POST', '/auth/refresh', { body: { refreshToken: saLogin.refreshToken } });
  ok('refresh rotates both tokens', rf?.accessToken && rf?.refreshToken && rf.refreshToken !== saLogin.refreshToken, rf && Object.keys(rf));
  await expect('new access token works', 200, 'GET', '/me', { token: rf.accessToken });
  const reuse = await call('POST', '/auth/refresh', { body: { refreshToken: saLogin.refreshToken } });
  ok('old refresh token rejected (401)', reuse.status === 401, reuse.json);
  const bogus = await call('GET', '/me', { token: 'not-a-jwt' });
  ok('bogus token → 401 TOKEN_INVALID', bogus.status === 401 && bogus.json?.error?.code === 'TOKEN_INVALID', bogus.json);
  await expect('logout', 200, 'POST', '/auth/logout', { token: TT });
  const after = await call('GET', '/me', { token: TT });
  ok('after logout → 401 SESSION_INVALID', after.status === 401 && after.json?.error?.code === 'SESSION_INVALID', after.json);

  ov = await expect('final overview', 200, 'GET', '/society/overview', { token: T });
  ok('overview reflects data (residents=2, pending=1, outstanding>0, collected>0)', ov.counts.residents === 2 && ov.counts.pendingMembers === 1 && ov.finance.outstandingPaise > 0 && ov.finance.collectedThisMonthPaise > 0, { counts: ov.counts, finance: ov.finance });

  writeFileSync(new URL('../.e2e-state.json', import.meta.url), JSON.stringify(state, null, 2));
  console.log('\nWrote .e2e-state.json');
}

main()
  .then(() => process.exit(summary() ? 1 : 0))
  .catch((err) => {
    console.error('\nFATAL', err);
    summary();
    process.exit(1);
  });
