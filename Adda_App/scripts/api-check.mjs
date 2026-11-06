/**
 * End-to-end check of every backend endpoint the AddaApp resident app uses, with real JWTs.
 * Verifies status codes AND the response fields each screen reads.
 *
 *   node scripts/api-check.mjs http://localhost:3013 admin@addaapp.local DevAdmin12345
 *
 * Creates its own society, staff and residents (use a development/staging database).
 */
import { superAdminLogin } from './sa-login.mjs';
import { Buffer } from 'node:buffer';

const [BASE = 'http://localhost:3013', SA_EMAIL, SA_PASSWORD] = process.argv.slice(2);
if (!SA_EMAIL || !SA_PASSWORD) {
  console.error('Usage: node scripts/api-check.mjs <baseUrl> <superAdminEmail> <superAdminPassword>');
  process.exit(2);
}
const API = `${BASE.replace(/\/$/, '')}/api/v1`;
let passed = 0;
let failed = 0;
const fails = [];

async function call(method, path, { body, token, form, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  if (raw) return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}
function check(label, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    fails.push(label);
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}` : ''}`);
  }
  return cond;
}
const has = (obj, keys) => keys.every((k) => obj && Object.prototype.hasOwnProperty.call(obj, k));
const section = (t) => console.log(`\n▸ ${t}`);
const stamp = Date.now().toString().slice(-6);
const phone = (n) => `9${stamp.padStart(6, '0')}${String(n).padStart(3, '0')}`; // 10 digits, starts with 9
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const period = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);
const ymd = (d) => new Date(Date.now() + 330 * 60000 + d * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- setup
section('Platform & society setup');
const cfg = await call('GET', '/public/config');
check('GET /public/config → passwordLogin available', cfg.status === 200 && cfg.body.passwordLogin?.available === true, cfg.body);
// The platform owner signs in with email + password.
const sa = await superAdminLogin(API, SA_EMAIL, SA_PASSWORD);
if (!check('super admin login', sa.status === 200 && sa.body.user?.platformRole === 'super_admin', sa.body)) process.exit(1);
const SA = sa.body.accessToken;

const repEmail = `qa.secretary.${stamp}@example.com`;
const reg = await call('POST', '/public/society-registrations', {
  body: { societyName: `QA Green Valley ${stamp}`, addressLine: '12 Lake Road', area: 'Salt Lake', city: 'Kolkata', state: 'West Bengal', pincode: '700091', phone: '9830012345', email: `office.${stamp}@example.com`, representative: { name: 'Riya Sen', designation: 'Secretary', phone: '9830012346', email: repEmail } },
});
check('society registration 201 + reference + access key', reg.status === 201 && reg.body.referenceCode && reg.body.accessKey, reg.body);
const regs = await call('GET', '/platform/society-registrations', { token: SA });
const regId = regs.body.items?.find((r) => r.referenceCode === reg.body.referenceCode)?._id;
const appr = await call('POST', `/platform/society-registrations/${regId}/approve`, { token: SA, body: {} });
check('super admin approves society', appr.status === 200, appr.body);
const act = await call('POST', '/public/society-registrations/activate', { body: { referenceCode: reg.body.referenceCode, accessKey: reg.body.accessKey, password: 'QaSociety12345' } });
check('registrant activates admin account', act.status === 200, act.body);
const adm = await call('POST', '/auth/admin/login', { body: { email: repEmail, password: 'QaSociety12345' } });
check('society admin login', adm.status === 200, adm.body);
const ADM = adm.body.accessToken;
const societyId = appr.body.society._id;

await call('PATCH', '/society/billing-settings', { token: ADM, body: { defaultAmountPaise: 150000, dueDayOfMonth: 25 } });
const bld = await call('POST', '/society/buildings', { token: ADM, body: { name: 'Block A', floors: 4 } });
check('create building', bld.status === 201, bld.body);
const bulk = await call('POST', '/society/flats/bulk', { token: ADM, body: { buildingId: bld.body._id, fromFloor: 1, toFloor: 4, unitsPerFloor: 2, pattern: '{building}-{floor}{unit}', areaSqft: 950 } });
check('bulk flats', bulk.status === 201 && bulk.body.created === 8, bulk.body);
const fac = await call('POST', '/society/facilities', { token: ADM, body: { name: 'Community Hall', feePaise: 120000, openTime: '09:00', closeTime: '22:00', slotMinutes: 60, maxAdvanceDays: 30, requiresApproval: false, rules: 'No loud music after 10 PM.' } });
check('create facility', fac.status === 201, fac.body);
const ann = await call('POST', '/society/announcements', { token: ADM, body: { title: 'Water Tank Cleaning', body: 'Water supply will be interrupted on Sunday from 9 AM to 2 PM.', category: 'maintenance', important: true } });
check('create announcement', ann.status === 201, ann.body);
const poll = await call('POST', '/society/polls', { token: ADM, body: { question: 'Preferred time for the Diwali celebration?', options: ['6 PM', '7 PM', '8 PM'] } });
check('create poll', poll.status === 201, poll.body);

// ---------------------------------------------------------------- resident auth
section('Resident sign-up / sign-in (phone + password)');
const P1 = phone(1);
const weak = await call('POST', '/auth/resident/register', { body: { name: 'Rahul Sharma', phone: P1, password: 'short' } });
check('weak password rejected (400)', weak.status === 400);
const r1 = await call('POST', '/auth/resident/register', { body: { name: 'Rahul Sharma', phone: P1, password: 'Resident12345', deviceName: 'AddaApp' } });
check('register 201 with tokens + profile', r1.status === 201 && r1.body.accessToken && r1.body.refreshToken && r1.body.user?.name === 'Rahul Sharma' && Array.isArray(r1.body.memberships), r1.body);
const dup = await call('POST', '/auth/resident/register', { body: { name: 'Someone', phone: P1, password: 'Resident12345' } });
check('duplicate phone → 409 ACCOUNT_EXISTS', dup.status === 409 && dup.body.error?.code === 'ACCOUNT_EXISTS');
const badLogin = await call('POST', '/auth/resident/login', { body: { phone: P1, password: 'WrongPass1234' } });
check('wrong password → 401 INVALID_CREDENTIALS', badLogin.status === 401 && badLogin.body.error?.code === 'INVALID_CREDENTIALS');
const login = await call('POST', '/auth/resident/login', { body: { phone: P1, password: 'Resident12345', deviceName: 'AddaApp' } });
check('login 200', login.status === 200 && login.body.accessToken);
let R1 = login.body.accessToken;
const me = await call('GET', '/me', { token: R1 });
check('GET /me shape (user, needsProfile, memberships)', me.status === 200 && has(me.body, ['user', 'needsProfile', 'memberships']) && me.body.user.phone === P1, me.body);

// ---------------------------------------------------------------- onboarding
section('Society search & membership');
const search = await call('GET', `/public/societies?q=${encodeURIComponent('QA Green Valley ' + stamp)}`);
check('society search finds the society', search.status === 200 && search.body.items.some((s) => s._id === societyId && has(s, ['name', 'code', 'city'])), search.body);
const blds = await call('GET', `/public/societies/${societyId}/buildings`);
check('buildings for join form', blds.status === 200 && blds.body.society?.name && blds.body.buildings.length === 1, blds.body);
const badFlat = await call('POST', '/memberships', { token: R1, body: { societyId, buildingId: bld.body._id, flatNumber: 'Z-999', residentType: 'owner' } });
check('unknown flat → 400 FLAT_NOT_FOUND', badFlat.status === 400 && badFlat.body.error?.code === 'FLAT_NOT_FOUND');
const mem = await call('POST', '/memberships', { token: R1, body: { societyId, buildingId: bld.body._id, flatNumber: 'a-101', residentType: 'owner', note: 'Owner since 2020' } });
check('membership request 201 pending', mem.status === 201 && mem.body.status === 'pending', mem.body);
const pend = await call('GET', '/resident/home', { token: R1 });
check('pending resident blocked → 403 MEMBERSHIP_PENDING', pend.status === 403 && pend.body.error?.code === 'MEMBERSHIP_PENDING');
const me2 = await call('GET', '/me', { token: R1 });
check('/me shows pending membership with society/building/flat', me2.body.memberships?.[0]?.status === 'pending' && me2.body.memberships[0].flat?.number === 'A-101' && me2.body.memberships[0].building?.name, me2.body.memberships);
const queue = await call('GET', '/society/memberships?status=pending', { token: ADM });
check('admin sees request in queue', queue.body.items?.some((m) => m._id === mem.body._id));
check('admin approves', (await call('POST', `/society/memberships/${mem.body._id}/approve`, { token: ADM, body: {} })).status === 200);

// second resident for community interactions
const P2 = phone(2);
const r2 = await call('POST', '/auth/resident/register', { body: { name: 'Priya Mehta', phone: P2, password: 'Resident12345' } });
const R2 = r2.body.accessToken;
const mem2 = await call('POST', '/memberships', { token: R2, body: { societyId, buildingId: bld.body._id, flatNumber: 'A-102', residentType: 'tenant' } });
await call('POST', `/society/memberships/${mem2.body._id}/approve`, { token: ADM, body: {} });

// ---------------------------------------------------------------- home
section('Home dashboard');
const home = await call('GET', '/resident/home', { token: R1 });
check(
  'GET /resident/home shape',
  home.status === 200 && has(home.body, ['society', 'membership', 'dues', 'openComplaints', 'announcements', 'upcomingBookings', 'unreadNotifications', 'openPolls']) && home.body.membership.flat.number === 'A-101' && home.body.membership.flat.building === 'Block A',
  home.body,
);
check('home: announcement + poll counted', home.body.announcements?.[0]?.title === 'Water Tank Cleaning' && home.body.openPolls === 1);
check('home: membership approval notification', home.body.unreadNotifications >= 1);

// ---------------------------------------------------------------- complaints
section('Complaints with attachment');
const cats = await call('GET', '/resident/complaint-categories', { token: R1 });
check('complaint categories', cats.status === 200 && cats.body.items.length > 0 && has(cats.body.items[0], ['_id', 'name']));
const fd = new FormData();
fd.append('file', new Blob([PNG], { type: 'image/png' }), 'leak.png');
fd.append('purpose', 'complaint');
const up = await call('POST', '/uploads', { token: R1, form: fd });
check('upload image → 201 with signed url', up.status === 201 && up.body._id && /sig=/.test(up.body.url), up.body);
const cmp = await call('POST', '/resident/complaints', { token: R1, body: { categoryId: cats.body.items[0]._id, title: 'Water leakage in bathroom', description: 'Water is leaking from the ceiling since this morning.', priority: 'high', media: [up.body._id] } });
check('create complaint 201 with ticket number', cmp.status === 201 && /^CMP-\d{5}$/.test(cmp.body.ticketNumber), cmp.body);
const cl = await call('GET', '/resident/complaints?limit=50', { token: R1 });
check('complaints list shape', cl.status === 200 && cl.body.items[0]?.category?.name && has(cl.body, ['items', 'page', 'pages', 'total']));
const cd = await call('GET', `/resident/complaints/${cmp.body._id}`, { token: R1 });
check('complaint detail: media url + timeline', cd.status === 200 && cd.body.media?.[0]?.url && Array.isArray(cd.body.timeline) && cd.body.timeline[0].byRole === 'resident', cd.body);
const img = await fetch(cd.body.media[0].url);
check('complaint photo URL loads (signed)', img.status === 200);
check('resident comment', (await call('POST', `/resident/complaints/${cmp.body._id}/comments`, { token: R1, body: { note: 'Please send a plumber today.' } })).status === 200);
check('other resident cannot read it (404)', (await call('GET', `/resident/complaints/${cmp.body._id}`, { token: R2 })).status === 404);
await call('POST', `/society/complaints/${cmp.body._id}/assign`, { token: ADM, body: { assigneeType: 'vendor', assigneeName: 'QuickFix Plumbing' } });
await call('POST', `/society/complaints/${cmp.body._id}/status`, { token: ADM, body: { status: 'in_progress' } });
await call('POST', `/society/complaints/${cmp.body._id}/status`, { token: ADM, body: { status: 'resolved', note: 'Pipe joint replaced.' } });
const cd2 = await call('GET', `/resident/complaints/${cmp.body._id}`, { token: R1 });
check('resident sees resolved + assignment', cd2.body.status === 'resolved' && cd2.body.currentAssignment?.assigneeName === 'QuickFix Plumbing');
const close = await call('POST', `/resident/complaints/${cmp.body._id}/action`, { token: R1, body: { action: 'close' } });
check('resident closes resolved complaint', close.status === 200 && close.body.status === 'closed');

// ---------------------------------------------------------------- bills
section('Bills, offline payment, receipt');
const gen = await call('POST', '/society/invoices/generate', { token: ADM, body: { period } });
check('admin generates bills', gen.status === 201 && gen.body.created === 8, gen.body);
const inv = await call('GET', '/resident/invoices?status=open&limit=50', { token: R1 });
check('resident open invoices + dues summary', inv.status === 200 && inv.body.items.length === 1 && inv.body.dues?.outstandingPaise === 150000 && has(inv.body.items[0], ['period', 'invoiceNumber', 'balancePaise', 'dueDate', 'overdue', 'status']), inv.body);
const invId = inv.body.items[0]._id;
const invD = await call('GET', `/resident/invoices/${invId}`, { token: R1 });
check('invoice detail: lines + onlinePayment flag', invD.status === 200 && invD.body.lines?.length && invD.body.onlinePayment?.available === false && invD.body.building?.name && invD.body.flat?.number, invD.body);
const pay = await call('POST', `/resident/invoices/${invId}/pay`, { token: R1 });
check('online pay → 503 PAYMENTS_UNAVAILABLE (never simulated)', pay.status === 503 && pay.body.error?.code === 'PAYMENTS_UNAVAILABLE');
const off = await call('POST', `/society/invoices/${invId}/payments`, { token: ADM, body: { amountPaise: 150000, method: 'cash' } });
check('admin records cash payment', off.status === 201 && off.body.receipt, off.body);
const pays = await call('GET', '/resident/payments?limit=50', { token: R1 });
check('payment history with receipt + invoice', pays.status === 200 && pays.body.items[0]?.receipt?.receiptNumber && pays.body.items[0]?.invoice?.period === period, pays.body);
const rid = pays.body.items[0].receipt._id;
const rc = await call('GET', `/resident/receipts/${rid}`, { token: R1 });
check('receipt detail shape', rc.status === 200 && rc.body.receiptNumber && rc.body.society?.name && rc.body.flat?.number && rc.body.invoice?.invoiceNumber, rc.body);
check('office-recorded receipt names the flat resident', rc.body.issuedToName === 'Rahul Sharma', rc.body.issuedToName);
const pdf = await call('GET', `/resident/receipts/${rid}/pdf`, { token: R1, raw: true });
check('receipt PDF download', pdf.status === 200 && pdf.buf.subarray(0, 5).toString() === '%PDF-');
check('other resident cannot open the receipt (404)', (await call('GET', `/resident/receipts/${rid}`, { token: R2 })).status === 404);
const home2 = await call('GET', '/resident/home', { token: R1 });
check('home dues cleared after payment', home2.body.dues.nextInvoice === null && home2.body.dues.outstandingPaise === 0);

// ---------------------------------------------------------------- community
section('Community: posts, comments, likes, reports, polls');
const fd2 = new FormData();
fd2.append('file', new Blob([PNG], { type: 'image/png' }), 'diwali.png');
fd2.append('purpose', 'post');
const up2 = await call('POST', '/uploads', { token: R2, form: fd2 });
const post = await call('POST', '/resident/posts', { token: R2, body: { body: 'Looking forward to the Diwali celebration at the community hall ✨', media: [up2.body._id] } });
check('create post with image', post.status === 201 && post.body.media?.length === 1, post.body);
const feed = await call('GET', '/resident/posts?page=1&limit=15', { token: R1 });
check('feed shape (author, likedByMe, mine)', feed.status === 200 && has(feed.body.items[0], ['author', 'likeCount', 'commentCount', 'likedByMe', 'mine', 'media']), feed.body.items?.[0]);
const like = await call('POST', `/resident/posts/${post.body._id}/like`, { token: R1 });
check('like toggle', like.status === 200 && like.body.likedByMe === true && like.body.likeCount === 1);
const com = await call('POST', `/resident/posts/${post.body._id}/comments`, { token: R1, body: { body: 'Count us in!' } });
check('comment', com.status === 201 && com.body.mine === true);
const pd = await call('GET', `/resident/posts/${post.body._id}`, { token: R2 });
check('post detail with comments', pd.status === 200 && pd.body.comments.length === 1 && pd.body.mine === true);
const rep = await call('POST', `/resident/posts/${post.body._id}/report`, { token: R1, body: { reason: 'Spam or advertising' } });
check('report post', rep.status === 201);
check('report twice → 409', (await call('POST', `/resident/posts/${post.body._id}/report`, { token: R1, body: { reason: 'Spam or advertising' } })).status === 409);
const polls = await call('GET', '/resident/polls', { token: R1 });
const pl = polls.body.items?.[0];
check('polls list hides votes before voting', polls.status === 200 && pl && pl.open && pl.options[0].votes === undefined, pl);
const vote = await call('POST', `/resident/polls/${pl._id}/vote`, { token: R1, body: { optionId: pl.options[1]._id } });
check('vote returns results', vote.status === 200 && vote.body.totalVotes === 1 && vote.body.myVote === pl.options[1]._id);
check('second vote → 409 ALREADY_VOTED', (await call('POST', `/resident/polls/${pl._id}/vote`, { token: R1, body: { optionId: pl.options[0]._id } })).body?.error?.code === 'ALREADY_VOTED');
const del = await call('DELETE', `/resident/posts/${post.body._id}`, { token: R1 });
check('cannot delete someone else’s post (404)', del.status === 404);

// ---------------------------------------------------------------- notices
section('Notices');
const nl = await call('GET', '/resident/announcements?limit=50', { token: R1 });
check('notices list', nl.status === 200 && nl.body.items[0]?.title && has(nl.body.items[0], ['body', 'category', 'important', 'createdAt']));
const nd = await call('GET', `/resident/announcements/${ann.body._id}`, { token: R1 });
check('notice detail', nd.status === 200 && nd.body.title === 'Water Tank Cleaning' && Array.isArray(nd.body.attachments));

// ---------------------------------------------------------------- facilities
section('Facilities & bookings');
const fl = await call('GET', '/resident/facilities', { token: R1 });
check('facilities list', fl.status === 200 && fl.body.items[0]?.name === 'Community Hall' && has(fl.body.items[0], ['feePaise', 'openTime', 'closeTime', 'slotMinutes', 'requiresApproval']));
const day = ymd(2);
const av = await call('GET', `/resident/facilities/${fac.body._id}/availability?date=${day}`, { token: R1 });
check('availability slots', av.status === 200 && av.body.date === day && av.body.slots.length === 13 && av.body.slots.every((s) => has(s, ['startTime', 'endTime', 'available', 'status'])), av.body);
const bk = await call('POST', '/resident/bookings', { token: R1, body: { facilityId: fac.body._id, date: day, startTime: '18:00', endTime: '20:00', purpose: 'Birthday party' } });
check('book 2 consecutive slots → confirmed, fee 2×', bk.status === 201 && bk.body.status === 'confirmed' && bk.body.feePaise === 240000, bk.body);
const clash = await call('POST', '/resident/bookings', { token: R2, body: { facilityId: fac.body._id, date: day, startTime: '19:00' } });
check('overlapping booking → 409 SLOT_TAKEN', clash.status === 409 && clash.body.error?.code === 'SLOT_TAKEN');
const bl = await call('GET', '/resident/bookings?limit=50', { token: R1 });
check('my bookings list with facility name', bl.status === 200 && bl.body.items[0]?.facility?.name === 'Community Hall');
const home3 = await call('GET', '/resident/home', { token: R1 });
check('home shows upcoming booking', home3.body.upcomingBookings?.[0]?.facility === 'Community Hall');
check('cancel booking', (await call('POST', `/resident/bookings/${bk.body._id}/cancel`, { token: R1 })).body?.status === 'cancelled');

// ---------------------------------------------------------------- services
section('Service requests');
const sc = await call('GET', '/resident/service-categories', { token: R1 });
check('service categories', sc.status === 200 && sc.body.items.length > 0);
const sr = await call('POST', '/resident/service-requests', { token: R1, body: { categoryId: sc.body.items[0]._id, description: 'Kitchen tap leaking', preferredDate: ymd(1), preferredTime: 'Morning (8–12)' } });
check('create service request', sr.status === 201 && sr.body.status === 'requested', sr.body);
await call('POST', `/society/service-requests/${sr.body._id}/status`, { token: ADM, body: { status: 'accepted', note: 'Plumber will visit tomorrow.' } });
const srl = await call('GET', '/resident/service-requests?limit=50', { token: R1 });
check('service request list shows office note + category', srl.body.items[0]?.status === 'accepted' && srl.body.items[0]?.category?.name && srl.body.items[0]?.timeline?.at(-1)?.note === 'Plumber will visit tomorrow.');
check('cancel service request', (await call('POST', `/resident/service-requests/${sr.body._id}/cancel`, { token: R1 })).body?.status === 'cancelled');

// ---------------------------------------------------------------- listings
section('Property & marketplace (properties come from KYC-verified vendors)');
const fileUpload = async (token, purpose) => {
  const f = new FormData();
  f.append('file', new Blob([PNG], { type: 'image/png' }), `${purpose}.png`);
  f.append('purpose', purpose);
  return call('POST', '/uploads', { token, form: f });
};
// Valid test Aadhaar (Verhoeff check digit).
const VD = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const VP = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const aadhaar = (b) => b + [0, 4, 3, 2, 1, 5, 6, 7, 8, 9][b.split('').reverse().reduce((c, d, i) => VD[c][VP[(i + 1) % 8][Number(d)]], 0)];
async function verifiedVendor(n, name) {
  const r = await call('POST', '/auth/resident/register', { body: { name, phone: phone(n), password: 'Provider12345', accountType: 'vendor' } });
  const T = r.body.accessToken;
  const d = [];
  for (let i = 0; i < 3; i += 1) d.push((await fileUpload(T, 'kyc')).body?._id);
  const k = await call('PUT', '/vendor/kyc', { token: T, body: { businessName: name, city: 'Kolkata', pan: `ABCDE${stamp.slice(-4)}F`, aadhaar: aadhaar(`2${stamp}${String(n).padStart(4, '0')}`), bankAccountHolder: name, bankAccountNumber: `50100${stamp}`, bankIfsc: 'HDFC0001234', panPhoto: d[0], aadhaarFront: d[1], aadhaarBack: d[2], consent: true } });
  const ok = await call('POST', `/platform/vendors/${r.body.user._id}/kyc`, { token: SA, body: { decision: 'approved' } });
  return { token: T, id: r.body.user._id, registered: r.status, kyc: k.status, approved: ok.status };
}
const PV = await verifiedVendor(4, 'Salt Lake Homes');
check('vendor registers, submits KYC, owner approves', PV.registered === 201 && PV.kyc === 200 && PV.approved === 200, PV);
const VEN = PV.token;
const P4 = phone(4);
const propBody = { listingType: 'rent', propertyType: 'apartment', title: '2BHK Apartment for Rent', description: 'Sunny flat near the park.', pricePaise: 1500000, bedrooms: 2, bathrooms: 2, areaSqft: 980, furnishing: 'semi_furnished', locality: 'Salt Lake', city: 'Kolkata', contactPhone: P4, whatsappAvailable: true };
const memberProp = await call('POST', '/properties', { token: R1, body: propBody });
check('member cannot list a property → 403 VENDOR_ONLY', memberProp.status === 403 && memberProp.body?.error?.code === 'VENDOR_ONLY', memberProp.body);
check('member cannot upload property photos → 403', (await fileUpload(R1, 'property')).status === 403);
const up3 = await fileUpload(VEN, 'property');
const prop = await call('POST', '/properties', { token: VEN, body: { ...propBody, photos: [up3.body._id] } });
check('vendor creates property → pending platform review, no society', prop.status === 201 && prop.body.moderationStatus === 'pending' && !prop.body.society, prop.body);
const mine = await call('GET', '/properties/mine?limit=50', { token: VEN });
check('vendor "my properties" includes it', mine.body.items?.some((p) => p._id === prop.body._id && p.mine));
const browse1 = await call('GET', '/properties?limit=50', { token: R2 });
check('pending listing hidden from others', !browse1.body.items.some((p) => p._id === prop.body._id));
check('society admin cannot moderate a vendor listing (404)', (await call('POST', `/society/listings/property/${prop.body._id}/moderate`, { token: ADM, body: { decision: 'approved' } })).status === 404);
check('platform owner approves listing', (await call('POST', `/platform/listings/property/${prop.body._id}/moderate`, { token: SA, body: { decision: 'approved' } })).status === 200);
const browse2 = await call('GET', '/properties?listingType=rent&city=Kolkata&bedrooms=2&maxPrice=2000000&limit=50', { token: R2 });
check('approved listing visible with filters', browse2.body.items.some((p) => p._id === prop.body._id && p.photos?.[0]?.url && p.mine === false));
const pdet = await call('GET', `/properties/${prop.body._id}`, { token: R2 });
check('property detail with contact', pdet.status === 200 && pdet.body.contactPhone === P4 && pdet.body.postedBy === 'Salt Lake Homes', pdet.body);
check('non-owner cannot edit (404)', (await call('PATCH', `/properties/${prop.body._id}`, { token: R2, body: { pricePaise: 1 } })).status === 404);
const avail = await call('PATCH', `/properties/${prop.body._id}`, { token: VEN, body: { availability: 'rented' } });
check('owner marks rented (stays approved)', avail.status === 200 && avail.body.availability === 'rented' && avail.body.moderationStatus === 'approved', avail.body);
check('status change keeps photos and contact settings', avail.body.photos?.length === 1 && avail.body.whatsappAvailable === true, avail.body);
const editF = await call('PATCH', `/society/facilities/${fac.body._id}`, { token: ADM, body: { name: 'Community Hall A' } });
check('facility rename keeps fee and hours (no default overwrite)', editF.body.feePaise === 120000 && editF.body.openTime === '09:00' && editF.body.rules, editF.body);
const mcats = await call('GET', '/marketplace/categories', { token: R1 });
const item = await call('POST', '/marketplace', { token: R2, body: { categoryId: mcats.body.items[0]._id, title: 'Study Table', pricePaise: 250000, condition: 'good', negotiable: true, contactPhone: P2, visibility: 'public' } });
check('members still sell items to neighbours (marketplace)', item.status === 201, item.body);
await call('POST', `/society/listings/marketplace/${item.body._id}/moderate`, { token: ADM, body: { decision: 'approved' } });
const mk = await call('GET', `/marketplace?categoryId=${mcats.body.items[0]._id}&limit=50`, { token: R1 });
check('marketplace browse by category', mk.body.items.some((i) => i._id === item.body._id && i.category?.name));
const sold = await call('PATCH', `/marketplace/${item.body._id}`, { token: R2, body: { status: 'sold' } });
check('seller marks sold (keeps condition/negotiable)', sold.status === 200 && sold.body.status === 'sold' && sold.body.negotiable === true && sold.body.moderationStatus === 'approved', sold.body);
check('seller deletes listing', (await call('DELETE', `/marketplace/${item.body._id}`, { token: R2 })).status === 200);

// ---------------------------------------------------------------- service offers
section('Service offers (KYC-verified vendors) & bookings');
const PV3 = await verifiedVendor(3, 'Ravi Electric Works');
check('second vendor verified', PV3.approved === 200, PV3);
const R3 = PV3.token;
const P3 = phone(3);
const ocats = await call('GET', '/service-offers/categories', { token: VEN });
check('offer categories (platform)', ocats.status === 200 && ocats.body.items.length > 0, ocats.body);
const catId = ocats.body.items[0]._id;
const offerBody = { categoryId: catId, title: 'Leak repair & bathroom fittings', description: 'Taps, flush tanks, pipe leaks.', priceType: 'starting_from', pricePaise: 29900, experienceYears: 8, serviceArea: 'Salt Lake, New Town', city: 'Kolkata', availabilityNote: 'Mon–Sat, 9 AM–7 PM', contactPhone: P4, whatsappAvailable: true };
check('no auth → 401', (await call('GET', '/service-offers')).status === 401);
check('member cannot list a service → 403 VENDOR_ONLY', (await call('POST', '/service-offers', { token: R1, body: offerBody })).body?.error?.code === 'VENDOR_ONLY');
check('price required unless "on request" → 400', (await call('POST', '/service-offers', { token: VEN, body: { ...offerBody, pricePaise: undefined } })).status === 400);
check('unknown field (society) rejected → 400', (await call('POST', '/service-offers', { token: VEN, body: { ...offerBody, society: societyId } })).status === 400);
check('mass-assign moderationStatus rejected → 400', (await call('POST', '/service-offers', { token: VEN, body: { ...offerBody, moderationStatus: 'approved' } })).status === 400);
check('invalid contact phone → 400', (await call('POST', '/service-offers', { token: VEN, body: { ...offerBody, contactPhone: '12345' } })).status === 400);
check('price over ₹10 lakh → 400', (await call('POST', '/service-offers', { token: VEN, body: { ...offerBody, pricePaise: 10_00_000_01 } })).status === 400);
check('unknown category → 400', (await call('POST', '/service-offers', { token: VEN, body: { ...offerBody, categoryId: '5f0000000000000000000000' } })).status === 400);
const inj = await call('GET', '/service-offers?categoryId[$ne]=x&limit=50', { token: R1 });
check('NoSQL operator in query is inert (plain key, ignored)', inj.status === 200 && Array.isArray(inj.body.items), inj.body);

const up5 = await fileUpload(VEN, 'service');
check('vendor uploads a service photo', up5.status === 201, up5.body);
const o1 = await call('POST', '/service-offers', { token: VEN, body: { ...offerBody, photos: [up5.body._id] } });
check('vendor offer → 201 pending, no society', o1.status === 201 && o1.body.moderationStatus === 'pending' && !o1.body.society && o1.body.provider, o1.body);
const myO = await call('GET', '/service-offers/mine', { token: VEN });
check('my services lists it (mine)', myO.body.items?.some((o) => o._id === o1.body._id && o.mine && o.category?.name), myO.body.items);
check('pending hidden from others (list)', !(await call('GET', '/service-offers?limit=50', { token: R2 })).body.items.some((o) => o._id === o1.body._id));
check('pending hidden from others (detail 404)', (await call('GET', `/service-offers/${o1.body._id}`, { token: R2 })).status === 404);
check('owner sees own pending detail', (await call('GET', `/service-offers/${o1.body._id}`, { token: VEN })).status === 200);
const o3 = await call('POST', '/service-offers', { token: R3, body: { ...offerBody, title: 'Electrician — wiring, fans, MCB', priceType: 'on_quote', pricePaise: 50000, contactPhone: P3, city: 'Kolkata' } });
check('"on request" drops the price', o3.status === 201 && o3.body.pricePaise == null, o3.body);
check('society admin cannot moderate a vendor offer (404)', (await call('POST', `/society/listings/service/${o1.body._id}/moderate`, { token: ADM, body: { decision: 'approved' } })).status === 404);
check('resident cannot moderate (403)', (await call('POST', `/society/listings/service/${o1.body._id}/moderate`, { token: R2, body: { decision: 'approved' } })).status === 403);
const pq = await call('GET', '/platform/listings?kind=service&status=pending', { token: SA });
check('platform queue lists both vendor offers', pq.body.items?.some((o) => o._id === o1.body._id) && pq.body.items?.some((o) => o._id === o3.body._id), pq.body.items?.length);
const apr1 = await call('POST', `/platform/listings/service/${o1.body._id}/moderate`, { token: SA, body: { decision: 'approved' } });
const apr3 = await call('POST', `/platform/listings/service/${o3.body._id}/moderate`, { token: SA, body: { decision: 'approved', note: 'Verified' } });
check('platform owner approves offers', apr1.status === 200 && apr3.status === 200);
const n3 = await call('GET', '/notifications', { token: R3 });
check('vendor notified with MyServices route', n3.body.items?.some((n) => n.data?.route === 'MyServices'), n3.body.items?.map((n) => n.data?.route));

const b1 = await call('GET', `/service-offers?categoryId=${catId}&q=leak&city=Kol&limit=50`, { token: R2 });
const seen = b1.body.items?.find((o) => o._id === o1.body._id);
check('browse by category + text + city', !!seen && seen.mine === false && seen.postedBy && seen.category?.name && seen.photos?.[0]?.url && seen.contactPhone === P4, seen);
check('browse never leaks reportCount / provider id', seen && !('reportCount' in seen) && !('provider' in seen), seen && Object.keys(seen));

const bookBody = { preferredDate: ymd(1), preferredTime: '11:00', address: 'Block A-12, QA Green Valley', note: 'Kitchen tap leaking' };
const svcBk = await call('POST', `/service-offers/${o1.body._id}/bookings`, { token: R1, body: bookBody });
check('member books a vendor service → requested', svcBk.status === 201 && svcBk.body.status === 'requested' && svcBk.body.vendor?.phone === P4, svcBk.body);
check('vendor cannot book a service → 403', (await call('POST', `/service-offers/${o3.body._id}/bookings`, { token: VEN, body: bookBody })).status === 403);
const vb = await call('GET', '/vendor/bookings?status=open', { token: VEN });
check('vendor sees the booking with customer phone', vb.body.items?.some((b) => b._id === svcBk.body._id && b.customer?.phone === P1), vb.body.items);
const acc = await call('POST', `/vendor/bookings/${svcBk.body._id}/accept`, { token: VEN, body: {} });
const done = await call('POST', `/vendor/bookings/${svcBk.body._id}/complete`, { token: VEN, body: {} });
const cash = await call('POST', `/vendor/bookings/${svcBk.body._id}/mark-paid`, { token: VEN, body: { amountPaise: 29900 } });
check('vendor accepts → completes → marks cash paid', acc.body?.status === 'accepted' && done.body?.status === 'completed' && cash.body?.payment?.status === 'paid', cash.body);
const myB = await call('GET', '/service-bookings', { token: R1 });
check('member sees booking paid in cash', myB.body.items?.some((b) => b._id === svcBk.body._id && b.payment?.method === 'cash' && b.payment.amountPaise === 29900));
const nb = await call('GET', '/notifications', { token: R1 });
check('member notified (MyServiceBookings route)', nb.body.items?.some((n) => n.data?.route === 'MyServiceBookings'), nb.body.items?.map((n) => n.data?.route));

check('report a service', (await call('POST', `/service-offers/${o1.body._id}/report`, { token: R2, body: { reason: 'Phone number does not work' } })).status === 201);
check('duplicate report → 409', (await call('POST', `/service-offers/${o1.body._id}/report`, { token: R2, body: { reason: 'Again' } })).status === 409);
const repSvc = await call('GET', '/platform/listings?kind=service&status=approved&reported=true', { token: SA });
check('platform sees reported services', repSvc.body.items?.some((o) => o._id === o1.body._id), repSvc.body.items?.length);

check('non-owner cannot edit (404)', (await call('PATCH', `/service-offers/${o1.body._id}`, { token: R2, body: { title: 'Hacked title' } })).status === 404);
check('non-owner cannot delete (404)', (await call('DELETE', `/service-offers/${o1.body._id}`, { token: R3 })).status === 404);
check('switching to fixed without a price → 400', (await call('PATCH', `/service-offers/${o3.body._id}`, { token: R3, body: { priceType: 'fixed' } })).status === 400);
const paused = await call('PATCH', `/service-offers/${o1.body._id}`, { token: VEN, body: { status: 'paused' } });
check('pause keeps approval and photos', paused.status === 200 && paused.body.status === 'paused' && paused.body.moderationStatus === 'approved' && paused.body.photos?.length === 1, paused.body);
check('paused offer hidden from browse', !(await call('GET', '/service-offers?limit=50', { token: R2 })).body.items.some((o) => o._id === o1.body._id));
const edited = await call('PATCH', `/service-offers/${o1.body._id}`, { token: VEN, body: { status: 'active', pricePaise: 34900 } });
check('content edit goes back to review', edited.status === 200 && edited.body.moderationStatus === 'pending' && edited.body.pricePaise === 34900, edited.body);

for (let i = 0; i < 9; i += 1) await call('POST', '/service-offers', { token: R3, body: { ...offerBody, title: `Extra service number ${i + 1}`, contactPhone: P3 } });
const over = await call('POST', '/service-offers', { token: R3, body: { ...offerBody, title: 'One too many services', contactPhone: P3 } });
check('11th live service → 409 OFFER_LIMIT', over.status === 409 && over.body?.error?.code === 'OFFER_LIMIT', over.body);
check('vendor deletes a service', (await call('DELETE', `/service-offers/${o3.body._id}`, { token: R3 })).status === 200);
check('deleted service gone for others (404)', (await call('GET', `/service-offers/${o3.body._id}`, { token: R2 })).status === 404);
check('deleting twice → 404', (await call('DELETE', `/service-offers/${o3.body._id}`, { token: R3 })).status === 404);
check('after delete, a new service is allowed again', (await call('POST', '/service-offers', { token: R3, body: { ...offerBody, title: 'Fan installation service', contactPhone: P3 } })).status === 201);

// ---------------------------------------------------------------- notifications & profile
section('Notifications, profile, session');
const nts = await call('GET', '/notifications?page=1&limit=25', { token: R1 });
check('notifications with route hints', nts.status === 200 && nts.body.items.length >= 4 && typeof nts.body.unread === 'number' && nts.body.items.some((n) => n.data?.route === 'Invoice'), nts.body.items?.map((n) => n.type));
check('mark one read', (await call('POST', `/notifications/${nts.body.items[0]._id}/read`, { token: R1 })).status === 200);
check('read all', (await call('POST', '/notifications/read-all', { token: R1 })).status === 200);
const prof = await call('PATCH', '/me', { token: R1, body: { name: 'Rahul K Sharma', email: `rahul.${stamp}@example.com`, city: 'Kolkata' } });
check('edit profile', prof.status === 200 && prof.body.user.name === 'Rahul K Sharma');
check('role escalation rejected', (await call('PATCH', '/me', { token: R1, body: { platformRole: 'super_admin' } })).status === 400);
check('resident cannot call admin API (403)', (await call('GET', '/society/overview', { token: R1 })).status === 403);
const pwBad = await call('POST', '/me/password', { token: R1, body: { currentPassword: 'WrongPass1234', newPassword: 'Changed2026pw' } });
check('change password: wrong current → 400 PASSWORD_INCORRECT', pwBad.status === 400 && pwBad.body?.error?.code === 'PASSWORD_INCORRECT', pwBad.body);
check('change password: weak new → 400', (await call('POST', '/me/password', { token: R1, body: { currentPassword: 'Resident12345', newPassword: 'aaaaaaaaaaaa' } })).status === 400);
check('change password → 200', (await call('POST', '/me/password', { token: R1, body: { currentPassword: 'Resident12345', newPassword: 'Changed2026pw' } })).status === 200);
check('this device stays signed in', (await call('GET', '/me', { token: R1 })).status === 200);
check('other device (sign-up session) signed out', (await call('GET', '/me', { token: r1.body.accessToken })).status === 401);
check('new password signs in', (await call('POST', '/auth/resident/login', { body: { phone: P1, password: 'Changed2026pw' } })).status === 200);
const ref = await call('POST', '/auth/refresh', { body: { refreshToken: login.body.refreshToken } });
check('refresh rotates tokens', ref.status === 200 && ref.body.refreshToken !== login.body.refreshToken);
R1 = ref.body.accessToken;
check('logout', (await call('POST', '/auth/logout', { token: R1 })).status === 200);
check('token rejected after logout', (await call('GET', '/me', { token: R1 })).status === 401);

console.log(`\n${failed ? '✗' : '✓'} ${passed} passed, ${failed} failed`);
if (failed) {
  console.log('Failed:\n - ' + fails.join('\n - '));
  process.exit(1);
}
