#!/usr/bin/env node
/**
 * Live contract check for the Master Admin console: owner sign-in, society workspace bridge
 * (/platform/societies/:sid/manage/*), masking + logged reveal, members directory, member profile and
 * owner actions. Seeds its own society, flats and residents. LOCAL backend only (default http://127.0.0.1:3013).
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
