#!/usr/bin/env node
/**
 * Dry checker for gate security (skills/gate-security/SKILL.md + DRY_CHECK.md #1) and society branding / location
 * (skills/society-branding, skills/location-maps) against a LOCAL backend only.
 * Builds two societies (isolation), members, staff and gatemen, then: gateman CRUD + validation + EMAIL_TAKEN,
 * gatemen can't use SocialPanel, gate sign-in + wrong roles, gate sessions refused elsewhere, member pre-registers
 * guests (date/time rules), gate lists (today / upcoming / inside), approve → enter → exit with status guards,
 * reject, member cancel rules, walk-in for a flat + notification, members directory with phones, notes, disable /
 * password reset end sessions, suspended society, read-only staff visitor log, audit trail; society logo + location,
 * registration location copied on approval, address search proxy.
 *
 *   API_BASE=http://127.0.0.1:3013 npm run gate-check
 */
import { Buffer } from 'node:buffer';

const BASE = (process.env.API_BASE || 'http://127.0.0.1:3013').replace(/\/$/, '');
if (/adda\.skillinnovex\.in|mongodb\.net|vercel\.app/.test(BASE)) {
  console.error('Refusing to run against production. Use a local backend.');
  process.exit(2);
}
const API = `${BASE}/api/v1`;
const SA = { email: process.env.SA_EMAIL || 'admin@addaapp.local', password: process.env.SA_PASSWORD || 'DevAdmin12345' };
const RUN = Date.now().toString(36);
const PASSWORD = 'GateCheck2026secure';
const FAKE = '0123456789abcdef01234567';

const results = [];
const ok = (name, cond, detail) => {
  results.push(Boolean(cond));
  console.log(`  ${cond ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m'} ${name}${!cond && detail !== undefined ? `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}` : ''}`);
  return Boolean(cond);
};
const head = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
let last = 0;
async function call(method, p, { token, body } = {}) {
  const wait = last + 220 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (res.status === 429) {
    console.error('\nRate limited. Start the local API with LOGIN_RATE_LIMIT=2000 and wait a minute between suites.');
    process.exit(1);
  }
  return { status: res.status, json };
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function upload(token, purpose) {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', new Blob([PNG], { type: 'image/png' }), `${purpose}.png`);
  const res = await fetch(`${API}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const code = (r) => r.json?.error?.code;
let seq = 0;
const phone = () => `9${String(Date.now() + ++seq * 7907).slice(-9)}`;
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const inDays = (d) => new Date(Date.now() + 330 * 60_000 + d * 86_400_000).toISOString().slice(0, 10);
const LOC = { lat: 18.559, lng: 73.7868, label: `Baner, Pune ${RUN}` };

/** Registration (with a map location) → approve → activate → admin token, a building with flats A-101..202. */
async function makeSociety(owner, label, location) {
  const email = `gate.${label}.${RUN}@example.com`;
  const reg = await call('POST', '/public/society-registrations', {
    body: { societyName: `Gate ${label} ${RUN}`, addressLine: '1 Test Road', area: 'Baner', city: 'Pune', state: 'Maharashtra', pincode: '411045', phone: phone(), email: `office.${label}.${RUN}@example.com`, totalUnits: 10, representative: { name: `Admin ${label}`, designation: 'Secretary', phone: phone(), email }, documents: [], submit: true, ...(location ? { location } : {}) },
  });
  if (reg.status !== 201) throw new Error(`registration ${reg.status} ${JSON.stringify(reg.json)}`);
  const q = await call('GET', `/platform/society-registrations?q=${reg.json.referenceCode}`, { token: owner });
  const row = q.json.items[0];
  const detail = await call('GET', `/platform/society-registrations/${row._id}`, { token: owner });
  await call('POST', `/platform/society-registrations/${row._id}/review`, { token: owner });
  const appr = await call('POST', `/platform/society-registrations/${row._id}/approve`, { token: owner, body: {} });
  await call('POST', '/public/society-registrations/activate', { body: { referenceCode: reg.json.referenceCode, accessKey: reg.json.accessKey, password: PASSWORD } });
  const adm = await call('POST', '/auth/admin/login', { body: { email, password: PASSWORD } });
  const T = adm.json.accessToken;
  const b = await call('POST', '/society/buildings', { token: T, body: { name: 'Tower A', floors: 2 } });
  await call('POST', '/society/flats/bulk', { token: T, body: { buildingId: b.json._id, fromFloor: 1, toFloor: 2, unitsPerFloor: 2, pattern: '{building}-{floor}{unit}', areaSqft: 900 } });
  const flats = await call('GET', '/society/flats?limit=50', { token: T });
  const flat = Object.fromEntries((flats.json?.items || []).map((f) => [f.number, f._id]));
  return { id: appr.json.society._id, name: `Gate ${label} ${RUN}`, T, email, building: b.json._id, flat, registrationDetail: detail.json, login: adm.json };
}

async function member(soc, name, flatNumber, approve = true) {
  const ph = phone();
  const r = await call('POST', '/auth/resident/register', { body: { phone: ph, name, password: PASSWORD } });
  const m = await call('POST', '/memberships', { token: r.json.accessToken, body: { societyId: soc.id, buildingId: soc.building, flatNumber, residentType: 'owner' } });
  if (approve) await call('POST', `/society/memberships/${m.json._id}/approve`, { token: soc.T, body: {} });
  return { T: r.json.accessToken, id: r.json.user._id, phone: ph, name };
}

async function waitForNotification(token, pred) {
  for (let i = 0; i < 8; i++) {
    const n = await call('GET', '/notifications?limit=20', { token });
    const hit = n.json?.items?.find(pred);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function main() {
  head('Setup: two societies (one with a map location), members');
  const ownerLogin = await call('POST', '/auth/admin/login', { body: SA });
  if (!ok('owner signs in', ownerLogin.status === 200, ownerLogin.status)) return;
  const OT = ownerLogin.json.accessToken;
  const badLoc = await call('POST', '/public/society-registrations', { body: { societyName: `Bad loc ${RUN}`, addressLine: '1 Test Road', city: 'Pune', state: 'Maharashtra', pincode: '411045', phone: phone(), email: `bad.${RUN}@example.com`, representative: { name: 'Bad Loc', phone: phone(), email: `badrep.${RUN}@example.com` }, location: { lat: 95, lng: 73 } } });
  ok('registration with latitude 95 → 400', badLoc.status === 400, badLoc.status);
  const S1 = await makeSociety(OT, 'one', LOC);
  const S2 = await makeSociety(OT, 'two');
  ok('two societies with admins', S1.T && S2.T && S1.id !== S2.id);
  ok('Master Admin registration detail returns the location', S1.registrationDetail?.location?.lat === LOC.lat && S1.registrationDetail.location.lng === LOC.lng && S1.registrationDetail.location.label === LOC.label, S1.registrationDetail?.location);
  const R1 = await member(S1, 'Rahul Resident', 'A-101');
  const R1b = await member(S1, 'Riya Resident', 'A-101');
  const R2 = await member(S1, 'Priya Resident', 'A-102');
  const RP = await member(S1, 'Pending Person', 'A-201', false);
  const X1 = await member(S2, 'Other Society', 'A-101');
  ok('members ready (3 approved + 1 pending in S1, 1 in S2)', R1.T && R1b.T && R2.T && RP.T && X1.T);

  // ---------------------------------------------------------------- society location + logo
  head('Society location (registration → society → settings)');
  const prof0 = await call('GET', '/society/profile', { token: S1.T });
  ok('approved society has the registration location', prof0.json?.location?.lat === LOC.lat && prof0.json.location.lng === LOC.lng && prof0.json.location.label === LOC.label, prof0.json?.location);
  ok('society without a location → location null, logo null', (await call('GET', '/society/profile', { token: S2.T })).json?.location === null);
  const moved = await call('PATCH', '/society/profile', { token: S1.T, body: { location: { lat: 18.5204, lng: 73.8567, label: 'Pune centre' } } });
  ok('settings: change the location', moved.status === 200 && moved.json?.location?.lat === 18.5204 && moved.json.location.label === 'Pune centre', moved.json?.location);
  ok('settings: latitude 91 → 400', (await call('PATCH', '/society/profile', { token: S1.T, body: { location: { lat: 91, lng: 73 } } })).status === 400);
  ok('settings: lng as text → 400', (await call('PATCH', '/society/profile', { token: S1.T, body: { location: { lat: 18, lng: '73' } } })).status === 400);
  const cleared = await call('PATCH', '/society/profile', { token: S2.T, body: { location: { lat: 22.57, lng: 88.36 } } });
  ok('location without a label is fine', cleared.json?.location?.label === null && cleared.json.location.lat === 22.57, cleared.json?.location);
  const nulled = await call('PATCH', '/society/profile', { token: S2.T, body: { location: null } });
  ok('location null clears it', nulled.status === 200 && nulled.json?.location === null, nulled.json?.location);
  await call('PATCH', '/society/profile', { token: S1.T, body: { location: LOC } });

  head('Society logo (branding)');
  const lg = await upload(S1.T, 'society_logo');
  ok('admin uploads a society logo → 201, public URL', lg.status === 201 && lg.json?.url && !lg.json.url.includes('sig='), lg.json);
  ok('member cannot upload a society logo → 403', (await upload(R1.T, 'society_logo')).status === 403);
  const withLogo = await call('PATCH', '/society/profile', { token: S1.T, body: { logoId: lg.json?._id } });
  ok('PATCH profile { logoId } → profile.logo { _id, url }', withLogo.status === 200 && withLogo.json?.logo?._id === lg.json?._id && !!withLogo.json.logo.url, withLogo.json?.logo);
  const logoFile = await fetch(withLogo.json?.logo?.url?.replace(/^https?:\/\/[^/]+/, BASE) || BASE);
  ok('logo opens without a signature', logoFile.status === 200, logoFile.status);
  const lgOther = await upload(S2.T, 'society_logo');
  ok("another society's logo id → 400", (await call('PATCH', '/society/profile', { token: S1.T, body: { logoId: lgOther.json?._id } })).status === 400);
  const meS1 = await call('GET', '/me', { token: S1.T });
  ok('/me staffRoles[].society.logoUrl', meS1.json?.staffRoles?.[0]?.society?.logoUrl === withLogo.json?.logo?.url, meS1.json?.staffRoles?.[0]?.society);
  const relog = await call('POST', '/auth/admin/login', { body: { email: S1.email, password: PASSWORD } });
  ok('/auth/admin/login staffRoles[].society.logoUrl', relog.json?.staffRoles?.[0]?.society?.logoUrl === withLogo.json?.logo?.url);
  const ov = await call('GET', '/society/overview', { token: S1.T });
  ok('/society/overview society.logoUrl', ov.json?.society?.logoUrl === withLogo.json?.logo?.url, ov.json?.society);
  ok('society without a logo: logoUrl null', (await call('GET', '/society/overview', { token: S2.T })).json?.society?.logoUrl === null);

  // ---------------------------------------------------------------- gatemen (society staff)
  head('Gatemen: create / validation / list');
  const G = '/society/gatemen';
  const g1Email = `gate1.${RUN}@example.com`;
  const g1Body = { name: 'Ramesh Gate', email: g1Email, password: PASSWORD, phone: phone() };
  ok('name too short → 400', (await call('POST', G, { token: S1.T, body: { ...g1Body, name: 'R' } })).status === 400);
  ok('invalid email → 400', (await call('POST', G, { token: S1.T, body: { ...g1Body, email: 'not-an-email' } })).status === 400);
  ok('short password → 400', (await call('POST', G, { token: S1.T, body: { ...g1Body, password: 'short1' } })).status === 400);
  ok('password without numbers → 400', (await call('POST', G, { token: S1.T, body: { ...g1Body, password: 'onlyletterslong' } })).status === 400);
  ok('invalid phone → 400', (await call('POST', G, { token: S1.T, body: { ...g1Body, phone: '12345' } })).status === 400);
  const taken = await call('POST', G, { token: S1.T, body: { ...g1Body, email: S2.email } });
  ok('email of another account → 409 EMAIL_TAKEN', taken.status === 409 && code(taken) === 'EMAIL_TAKEN', taken);
  ok('member cannot create gatemen (staff API) → 403', (await call('POST', G, { token: R1.T, body: g1Body })).status === 403);
  const g1 = await call('POST', G, { token: S1.T, body: g1Body });
  if (!ok('admin creates a gateman → 201', g1.status === 201 && g1.json?.email === g1Email && g1.json.status === 'active' && g1.json.phone === g1Body.phone, g1)) return;
  ok('response has no password hash', !JSON.stringify(g1.json).includes('passwordHash'));
  ok('same email again → 409 EMAIL_TAKEN', code(await call('POST', G, { token: S1.T, body: g1Body })) === 'EMAIL_TAKEN');
  const g2Email = `gate2.${RUN}@example.com`;
  const g2 = await call('POST', G, { token: S2.T, body: { name: 'Suresh Gate', email: g2Email, password: PASSWORD } });
  ok('second society creates its own gateman (phone optional)', g2.status === 201 && g2.json?.phone === null, g2);
  const list = await call('GET', G, { token: S1.T });
  ok('list: name, email, phone, status, last sign-in', list.status === 200 && list.json.items.length === 1 && list.json.items[0].name === 'Ramesh Gate' && 'lastLoginAt' in list.json.items[0], list.json);
  ok('list is per society (S2 sees only its gateman)', (await call('GET', G, { token: S2.T })).json?.items?.every((g) => g.email === g2Email));
  ok('gatemen are not in the staff list', !(await call('GET', '/society/staff', { token: S1.T })).json?.items?.some((s) => s.role === 'gateman'));
  const ed = await call('PATCH', `${G}/${g1.json._id}`, { token: S1.T, body: { name: 'Ramesh Kumar', phone: null } });
  ok('edit name + remove phone', ed.status === 200 && ed.json?.name === 'Ramesh Kumar' && ed.json.phone === null, ed.json);
  await call('PATCH', `${G}/${g1.json._id}`, { token: S1.T, body: { phone: g1Body.phone } });
  ok("other society can't edit this gateman → 404", (await call('PATCH', `${G}/${g1.json._id}`, { token: S2.T, body: { name: 'Hacked Name' } })).status === 404);
  ok('empty edit → 400', (await call('PATCH', `${G}/${g1.json._id}`, { token: S1.T, body: {} })).status === 400);
  const asStaff = await call('POST', '/society/staff', { token: S1.T, body: { name: 'Gate As Staff', email: g1Email, role: 'manager' } });
  ok('a gateman email cannot be added as panel staff → 409 EMAIL_TAKEN', asStaff.status === 409 && code(asStaff) === 'EMAIL_TAKEN', asStaff);
  // Treasurer: no "gate" permission (can read the visitor log, can't manage gatemen).
  const inv = await call('POST', '/society/staff', { token: S1.T, body: { name: 'Tina Treasurer', email: `treas.${RUN}@example.com`, role: 'treasurer' } });
  const tok = new URL(inv.json?.setupLink || 'http://x/?token=').searchParams.get('token');
  await call('POST', '/auth/password/setup', { body: { token: tok, password: PASSWORD } });
  const TR = (await call('POST', '/auth/admin/login', { body: { email: `treas.${RUN}@example.com`, password: PASSWORD } })).json?.accessToken;
  ok('treasurer cannot list or create gatemen → 403', (await call('GET', G, { token: TR })).status === 403 && (await call('POST', G, { token: TR, body: { ...g1Body, email: `x.${RUN}@example.com` } })).status === 403);
  ok('treasurer cannot change the society logo → 403', (await call('PATCH', '/society/profile', { token: TR, body: { logoId: null } })).status === 403 && (await upload(TR, 'society_logo')).status === 403);

  head('Gate sign-in (app only)');
  const panel = await call('POST', '/auth/admin/login', { body: { email: g1Email, password: PASSWORD } });
  ok('gateman on SocialPanel sign-in → 403 NO_PANEL_ACCESS (no session)', panel.status === 403 && code(panel) === 'NO_PANEL_ACCESS' && !panel.json?.accessToken, panel);
  ok('gate login wrong password → 401 INVALID_CREDENTIALS', code(await call('POST', '/auth/gate/login', { body: { email: g1Email, password: 'Wrong2026secure' } })) === 'INVALID_CREDENTIALS');
  const notGate = await call('POST', '/auth/gate/login', { body: { email: S1.email, password: PASSWORD } });
  ok('society admin on gate sign-in → 403 NOT_GATEMAN', notGate.status === 403 && code(notGate) === 'NOT_GATEMAN', notGate);
  ok('platform owner on gate sign-in → 403 NOT_GATEMAN', code(await call('POST', '/auth/gate/login', { body: SA })) === 'NOT_GATEMAN');
  const gl = await call('POST', '/auth/gate/login', { body: { email: g1Email, password: PASSWORD } });
  if (!ok('gateman signs in → tokens + gate society (name, code, logo)', gl.status === 200 && gl.json?.accessToken && gl.json.refreshToken && gl.json.gate?.society?._id === S1.id && gl.json.gate.society.logoUrl === withLogo.json?.logo?.url && gl.json.gate.staffId === g1.json._id, gl)) return;
  let GT = gl.json.accessToken;
  const GT2 = (await call('POST', '/auth/gate/login', { body: { email: g2Email, password: PASSWORD } })).json?.accessToken;
  ok('second society gateman signs in', !!GT2);
  const gme = await call('GET', '/gate/me', { token: GT });
  ok('GET /gate/me → society + today counts', gme.status === 200 && gme.json?.gate?.society?.name === S1.name && gme.json.today?.date === today, gme.json);
  const ref = await call('POST', '/auth/refresh', { body: { refreshToken: gl.json.refreshToken } });
  ok('gate session refreshes', ref.status === 200 && !!ref.json?.accessToken, ref.status);
  GT = ref.json?.accessToken || GT;
  head('Gate sessions stay at the gate; other roles stay out of /gate');
  for (const [p, label] of [['/resident/home', 'resident'], ['/society/overview', 'society'], ['/platform/overview', 'platform'], ['/vendor/profile', 'vendor'], ['/service-offers', 'marketplace'], ['/me', '/me'], ['/memberships', 'memberships'], ['/resident/visitors', 'member guests']]) {
    const r = await call('GET', p, { token: GT });
    ok(`gate session on ${label} → 403 GATE_ACCOUNT`, r.status === 403 && code(r) === 'GATE_ACCOUNT', r);
  }
  ok('member on /gate → 403 NOT_GATEMAN', code(await call('GET', '/gate/visitors', { token: R1.T })) === 'NOT_GATEMAN');
  ok('society admin (panel session) on /gate → 403', (await call('GET', '/gate/visitors', { token: S1.T })).status === 403);
  ok('no token on /gate → 401', (await call('GET', '/gate/me')).status === 401);
  ok('admin /me lists no gateman role', !(await call('GET', '/me', { token: S1.T })).json?.staffRoles?.some((s) => s.role === 'gateman'));

  // ---------------------------------------------------------------- member pre-registers guests
  head('Member adds guests (own flat, date/time rules)');
  const V = '/resident/visitors';
  const guest = { name: 'Amit Guest', phone: phone(), purpose: 'Dinner', expectedDate: today, expectedIn: '18:00', expectedOut: '21:30' };
  ok('date in the past → 400', (await call('POST', V, { token: R1.T, body: { ...guest, expectedDate: inDays(-1) } })).status === 400);
  ok('date more than 30 days ahead → 400', (await call('POST', V, { token: R1.T, body: { ...guest, expectedDate: inDays(31) } })).status === 400);
  ok('out time before in time → 400', (await call('POST', V, { token: R1.T, body: { ...guest, expectedOut: '17:00' } })).status === 400);
  ok('bad time format → 400', (await call('POST', V, { token: R1.T, body: { ...guest, expectedIn: '25:00' } })).status === 400);
  ok('bad phone → 400', (await call('POST', V, { token: R1.T, body: { ...guest, phone: '12345' } })).status === 400);
  ok('name too short → 400', (await call('POST', V, { token: R1.T, body: { ...guest, name: 'A' } })).status === 400);
  ok('flat cannot be chosen by the member (unknown field) → 400', (await call('POST', V, { token: R1.T, body: { ...guest, flatId: S1.flat['A-102'] } })).status === 400);
  ok('pending member cannot add guests → 403', (await call('POST', V, { token: RP.T, body: guest })).status === 403);
  const v1 = await call('POST', V, { token: R1.T, body: guest });
  ok('member adds a guest for today → 201 expected, own flat', v1.status === 201 && v1.json?.status === 'expected' && v1.json.flat?.number === 'A-101' && v1.json.actions.includes('cancel'), v1);
  const v2 = await call('POST', V, { token: R1.T, body: { ...guest, name: 'Neha Guest', phone: phone(), expectedDate: inDays(30), expectedIn: undefined, expectedOut: undefined } });
  ok('guest 30 days ahead → 201', v2.status === 201, v2);
  const v3 = await call('POST', V, { token: R1.T, body: { ...guest, name: 'Kiran Guest', phone: phone() } });
  const vOther = await call('POST', V, { token: R2.T, body: { ...guest, name: 'Other Flat Guest', phone: phone() } });
  const vX = await call('POST', V, { token: X1.T, body: { ...guest, name: 'Other Society Guest', phone: phone() } });
  ok('other flats / other society add their own guests', vOther.status === 201 && vX.status === 201);
  const up = await call('GET', `${V}?scope=upcoming`, { token: R1.T });
  ok('member upcoming list: own flat only, soonest first', up.status === 200 && up.json.items.length === 3 && up.json.items[0].expectedDate === today && !up.json.items.some((x) => x._id === vOther.json._id), up.json?.items?.map((x) => x.name));
  ok('flat-mate sees the same flat guests', (await call('GET', `${V}?scope=upcoming`, { token: R1b.T })).json?.items?.some((x) => x._id === v1.json._id));
  ok("member of another flat doesn't see them", !(await call('GET', `${V}?scope=upcoming`, { token: R2.T })).json?.items?.some((x) => x._id === v1.json._id));
  ok("member JSON doesn't carry the host's phone", up.json?.items?.every((x) => !x.host || x.host.phone === undefined));

  // ---------------------------------------------------------------- gate lists + flow
  head('Gate: lists, approve → enter → exit, reject');
  const gToday = await call('GET', '/gate/visitors', { token: GT });
  const tIds = (gToday.json?.items || []).map((x) => x._id);
  ok('today list: this society’s guests for today', gToday.status === 200 && gToday.json.date === today && tIds.includes(v1.json._id) && tIds.includes(vOther.json._id) && !tIds.includes(v2.json._id), gToday.json?.items?.map((x) => x.name));
  ok('another society’s guest never listed', !tIds.includes(vX.json._id));
  const row = gToday.json.items.find((x) => x._id === v1.json._id);
  ok('gate card: phone, flat + building, host with phone, times, actions', row?.phone === guest.phone && row.flat?.number === 'A-101' && row.building?.name === 'Tower A' && row.host?.name === 'Rahul Resident' && row.host.phone === R1.phone && row.expectedIn === '18:00' && JSON.stringify(row.actions) === JSON.stringify(['approve', 'reject']), row);
  const gUp = await call('GET', '/gate/visitors?status=upcoming&limit=100', { token: GT });
  ok('upcoming list includes the guest 30 days ahead', (gUp.json?.items || []).some((x) => x._id === v2.json._id), gUp.json?.total);
  ok('date filter (in 30 days) shows only that day', (await call('GET', `/gate/visitors?date=${inDays(30)}`, { token: GT })).json?.items?.every((x) => x.expectedDate === inDays(30)));
  ok('search by flat number', (await call('GET', '/gate/visitors?q=A-102', { token: GT })).json?.items?.some((x) => x._id === vOther.json._id));
  ok('bad date → 400', (await call('GET', '/gate/visitors?date=tomorrow', { token: GT })).status === 400);
  ok('unknown status → 400', (await call('GET', '/gate/visitors?status=arrived', { token: GT })).status === 400);

  const act = (id, a, body = {}, token = GT) => call('POST', `/gate/visitors/${id}/${a}`, { token, body });
  ok('enter before approve → 409', (await act(v1.json._id, 'enter')).status === 409);
  ok('exit before entry → 409', (await act(v1.json._id, 'exit')).status === 409);
  ok('unknown action → 404', (await act(v1.json._id, 'teleport')).status === 404);
  const ap = await act(v1.json._id, 'approve');
  ok('approve → approved (actions: enter, reject)', ap.status === 200 && ap.json?.status === 'approved' && ap.json.approvedAt && JSON.stringify(ap.json.actions) === JSON.stringify(['enter', 'reject']), ap.json);
  const ap2 = await act(v1.json._id, 'approve');
  ok('double tap approve → 409 INVALID_TRANSITION', ap2.status === 409 && code(ap2) === 'INVALID_TRANSITION', ap2);
  const noteAp = await waitForNotification(R1.T, (n) => n.type === 'visitor' && n.data?.id === v1.json._id && /approved/i.test(n.title));
  ok('flat members notified (type visitor, route Guests)', noteAp?.data?.route === 'Guests', noteAp);
  ok("other society's gateman can't act on it → 404", (await act(v1.json._id, 'enter', {}, GT2)).status === 404);
  ok("other society's gateman can't open it → 404", (await call('GET', `/gate/visitors/${v1.json._id}`, { token: GT2 })).status === 404);
  const en = await act(v1.json._id, 'enter');
  ok('enter → inside with entry time', en.status === 200 && en.json?.status === 'inside' && !!en.json.entryAt && JSON.stringify(en.json.actions) === JSON.stringify(['exit']), en.json);
  ok('double tap enter → 409', (await act(v1.json._id, 'enter')).status === 409);
  ok('reject an inside guest → 409', (await act(v1.json._id, 'reject')).status === 409);
  ok('member cannot cancel a guest who is inside → 409', (await call('POST', `${V}/${v1.json._id}/cancel`, { token: R1.T })).status === 409);
  ok('inside list shows the guest', (await call('GET', '/gate/visitors?status=inside', { token: GT })).json?.items?.some((x) => x._id === v1.json._id));
  ok('member upcoming shows the guest inside (live status)', (await call('GET', `${V}?scope=upcoming`, { token: R1.T })).json?.items?.find((x) => x._id === v1.json._id)?.status === 'inside');
  const ex = await act(v1.json._id, 'exit');
  ok('exit → exited with exit time after entry', ex.status === 200 && ex.json?.status === 'exited' && new Date(ex.json.exitAt) >= new Date(ex.json.entryAt) && ex.json.actions.length === 0, ex.json);
  ok('double tap exit → 409', (await act(v1.json._id, 'exit')).status === 409);
  ok('exited guest moves to the member’s past list', (await call('GET', `${V}?scope=past`, { token: R1.T })).json?.items?.some((x) => x._id === v1.json._id && x.status === 'exited'));
  const quick = await act(vOther.json._id, 'approve', { enterNow: true });
  ok('approve with enterNow → inside in one step', quick.status === 200 && quick.json?.status === 'inside' && !!quick.json.entryAt && !!quick.json.approvedAt, quick.json);
  const rj = await act(v3.json._id, 'reject', { note: 'Host not answering' });
  ok('reject with a note → rejected + reason', rj.status === 200 && rj.json?.status === 'rejected' && rj.json.rejectedReason === 'Host not answering', rj.json);
  ok('rejected guest can’t be approved → 409', (await act(v3.json._id, 'approve')).status === 409);
  const noteRj = await waitForNotification(R1.T, (n) => n.type === 'visitor' && n.data?.id === v3.json._id);
  ok('member notified of the rejection with the reason', !!noteRj && /Host not answering/.test(noteRj.body || ''), noteRj);

  head('Member cancel rules');
  const v4 = await call('POST', V, { token: R1.T, body: { ...guest, name: 'Cancel Me', phone: phone(), expectedDate: inDays(2) } });
  ok("member of another flat can't cancel it → 404", (await call('POST', `${V}/${v4.json._id}/cancel`, { token: R2.T })).status === 404);
  ok("other society member can't cancel it → 404", (await call('POST', `${V}/${v4.json._id}/cancel`, { token: X1.T })).status === 404);
  const cn = await call('POST', `${V}/${v4.json._id}/cancel`, { token: R1b.T });
  ok('flat-mate cancels an expected guest → cancelled', cn.status === 200 && cn.json?.status === 'cancelled', cn.json);
  ok('cancel twice → 409', (await call('POST', `${V}/${v4.json._id}/cancel`, { token: R1.T })).status === 409);
  ok('gate can’t approve a cancelled guest → 409', (await act(v4.json._id, 'approve')).status === 409);
  const v5 = await call('POST', V, { token: R1.T, body: { ...guest, name: 'Approved Then Cancelled', phone: phone() } });
  await act(v5.json._id, 'approve');
  ok('member cancels an approved guest → cancelled', (await call('POST', `${V}/${v5.json._id}/cancel`, { token: R1.T })).json?.status === 'cancelled');

  // ---------------------------------------------------------------- walk-in
  head('Gate: walk-in guest for a flat');
  const flats = await call('GET', '/gate/flats?q=101', { token: GT });
  const f101 = flats.json?.items?.find((f) => f.number === 'A-101');
  ok('flat search: number, building, approved members with phones', f101?.building?.name === 'Tower A' && f101.members.length === 2 && f101.members.some((m) => m.phone === R1.phone), f101);
  ok('pending member not in the flat list', !(await call('GET', '/gate/flats?q=201', { token: GT })).json?.items?.find((f) => f.number === 'A-201')?.members?.length);
  const walk = { name: 'Courier Ravi', phone: phone(), purpose: 'Parcel', flatId: S1.flat['A-101'], hostId: R1.id };
  ok('walk-in for another society’s flat → 400', (await call('POST', '/gate/visitors', { token: GT, body: { ...walk, flatId: S2.flat['A-101'], hostId: undefined } })).status === 400);
  ok('walk-in host who lives elsewhere → 400', (await call('POST', '/gate/visitors', { token: GT, body: { ...walk, hostId: R2.id } })).status === 400);
  ok('walk-in without phone → 400', (await call('POST', '/gate/visitors', { token: GT, body: { ...walk, phone: undefined } })).status === 400);
  const w1 = await call('POST', '/gate/visitors', { token: GT, body: walk });
  ok('walk-in → 201 approved, for today, created by gateman, host set', w1.status === 201 && w1.json?.status === 'approved' && w1.json.expectedDate === today && w1.json.createdByRole === 'gateman' && w1.json.host?._id === R1.id && w1.json.flat?.number === 'A-101', w1);
  const walkNote = await waitForNotification(R1b.T, (n) => n.type === 'visitor' && n.data?.id === w1.json?._id);
  ok('all approved members of the flat are notified of the walk-in (route Guests)', walkNote?.data?.route === 'Guests' && /Courier Ravi/.test(walkNote.body || ''), walkNote);
  const w2 = await call('POST', '/gate/visitors', { token: GT, body: { name: 'Plumber Sunil', phone: phone(), flatId: S1.flat['A-102'], enterNow: true } });
  ok('walk-in with enterNow (no host) → inside with entry time', w2.status === 201 && w2.json?.status === 'inside' && !!w2.json.entryAt && w2.json.host === null, w2.json);
  ok('member sees the walk-in in Guests', (await call('GET', `${V}?scope=upcoming`, { token: R1.T })).json?.items?.some((x) => x._id === w1.json._id));

  // ---------------------------------------------------------------- members directory
  head('Gate: members directory (call) and member page');
  const mem = await call('GET', '/gate/members?limit=100', { token: GT });
  const names = (mem.json?.items || []).map((m) => m.name);
  ok('approved members of this society with full phone, flat, building, type', mem.status === 200 && mem.json.items.some((m) => m._id === R1.id && m.phone === R1.phone && m.flat?.number === 'A-101' && m.building?.name === 'Tower A' && m.residentType === 'owner'), mem.json?.items?.[0]);
  ok('pending member not listed', !names.includes('Pending Person'));
  ok('other society’s member not listed', !names.includes('Other Society'));
  ok('search by name', (await call('GET', '/gate/members?q=priya', { token: GT })).json?.items?.every((m) => /priya/i.test(m.name)));
  ok('search by phone digits', (await call('GET', `/gate/members?q=${R2.phone.slice(-6)}`, { token: GT })).json?.items?.some((m) => m._id === R2.id));
  const mp = await call('GET', `/gate/members/${R1.id}`, { token: GT });
  ok('member page: phone, flats, recent visitors of the flat', mp.status === 200 && mp.json?.member?.phone === R1.phone && mp.json.flats?.[0]?.flat?.number === 'A-101' && mp.json.recentVisitors?.some((v) => v._id === v1.json._id), mp.json?.member);
  ok('member page of another society’s member → 404', (await call('GET', `/gate/members/${X1.id}`, { token: GT })).status === 404);
  ok('member page of a pending member → 404', (await call('GET', `/gate/members/${RP.id}`, { token: GT })).status === 404);
  ok('S2 gateman sees only S2 members', (await call('GET', '/gate/members?limit=100', { token: GT2 })).json?.items?.every((m) => m.name === 'Other Society'));

  // ---------------------------------------------------------------- notes
  head('Gate notes to members');
  ok('note too short → 400', (await call('POST', '/gate/notes', { token: GT, body: { memberId: R1.id, text: 'Hi' } })).status === 400);
  ok('note over 500 chars → 400', (await call('POST', '/gate/notes', { token: GT, body: { memberId: R1.id, text: 'x'.repeat(501) } })).status === 400);
  ok('note to another society’s member → 400', (await call('POST', '/gate/notes', { token: GT, body: { memberId: X1.id, text: 'Parcel kept at the gate.' } })).status === 400);
  ok('note about another society’s guest → 400', (await call('POST', '/gate/notes', { token: GT, body: { memberId: R1.id, text: 'About your guest', visitorId: vX.json._id } })).status === 400);
  const nt = await call('POST', '/gate/notes', { token: GT, body: { memberId: R1.id, text: 'Your parcel is kept at the gate.', visitorId: w1.json._id } });
  ok('gateman sends a note (about a visitor) → 201', nt.status === 201 && nt.json?.member?._id === R1.id && nt.json.visitor?._id === w1.json._id, nt);
  const nNote = await waitForNotification(R1.T, (n) => n.type === 'visitor' && n.data?.id === nt.json?._id);
  ok('member notified (Note from the gate, route Guests)', nNote?.data?.route === 'Guests' && nNote.title === 'Note from the gate', nNote);
  const rn = await call('GET', '/resident/gate-notes', { token: R1.T });
  ok('member reads it in Guests (unread 1, from gate staff, guest name)', rn.status === 200 && rn.json.unread >= 1 && rn.json.items[0]?.text === 'Your parcel is kept at the gate.' && rn.json.items[0].from?.name === 'Ramesh Kumar' && rn.json.items[0].visitor?.name === 'Courier Ravi', rn.json);
  ok('guest list shows the unread note count', (await call('GET', `${V}?scope=upcoming`, { token: R1.T })).json?.unreadNotes >= 1);
  ok('flat-mate does not see it (notes are personal)', (await call('GET', '/resident/gate-notes', { token: R1b.T })).json?.items?.length === 0);
  ok("other member can't mark it read → 404", (await call('POST', `/resident/gate-notes/${nt.json._id}/read`, { token: R2.T })).status === 404);
  const rd = await call('POST', `/resident/gate-notes/${nt.json._id}/read`, { token: R1.T });
  ok('member marks it read', rd.status === 200 && !!rd.json?.readAt, rd);
  const rd2 = await call('POST', `/resident/gate-notes/${nt.json._id}/read`, { token: R1.T });
  ok('marking read again keeps the first time', rd2.json?.readAt === rd.json?.readAt);
  ok('unread count drops', (await call('GET', '/resident/gate-notes', { token: R1.T })).json?.unread === 0);
  const sent = await call('GET', '/gate/notes', { token: GT });
  ok('gateman sees sent notes', sent.json?.items?.some((n) => n._id === nt.json._id));
  ok('S2 gateman sees none of them', !(await call('GET', '/gate/notes', { token: GT2 })).json?.items?.some((n) => n._id === nt.json._id));

  // ---------------------------------------------------------------- staff visitor log (read only)
  head('Society visitor log (read only)');
  const log = await call('GET', `/society/visitors?date=${today}&limit=100`, { token: S1.T });
  ok('staff read today’s log with entry/exit times', log.status === 200 && log.json.items.some((v) => v._id === v1.json._id && v.entryAt && v.exitAt) && log.json.items.every((v) => v.actions.length === 0), log.json?.total);
  ok('log excludes other societies', !log.json?.items?.some((v) => v._id === vX.json._id));
  ok('status filter (inside)', (await call('GET', '/society/visitors?status=inside', { token: S1.T })).json?.items?.every((v) => v.status === 'inside'));
  ok('treasurer can read the log (society.read)', (await call('GET', '/society/visitors', { token: TR })).status === 200);
  ok('log is read-only (no write route) → 404', (await call('POST', '/society/visitors', { token: S1.T, body: { name: 'x' } })).status === 404);
  ok('member cannot read the staff log → 403', (await call('GET', '/society/visitors', { token: R1.T })).status === 403);

  // ---------------------------------------------------------------- disable / password / suspend
  head('Disable, password reset, suspended society');
  const st = (s) => call('POST', `${G}/${g1.json._id}/status`, { token: S1.T, body: { status: s } });
  const dis = await st('disabled');
  ok('disable gateman → 200 disabled', dis.status === 200 && dis.json?.status === 'disabled', dis.json);
  ok('session ends at once → 401', (await call('GET', '/gate/me', { token: GT })).status === 401);
  ok('disabled gateman cannot sign in', (await call('POST', '/auth/gate/login', { body: { email: g1Email, password: PASSWORD } })).status >= 400);
  ok('refresh token no longer works', (await call('POST', '/auth/refresh', { body: { refreshToken: ref.json?.refreshToken || gl.json.refreshToken } })).status === 401);
  ok('enable → can sign in again', (await st('active')).json?.status === 'active' && (await call('POST', '/auth/gate/login', { body: { email: g1Email, password: PASSWORD } })).status === 200);
  GT = (await call('POST', '/auth/gate/login', { body: { email: g1Email, password: PASSWORD } })).json?.accessToken;
  ok('set password: weak → 400', (await call('POST', `${G}/${g1.json._id}/password`, { token: S1.T, body: { password: 'weakweakweak' } })).status === 400);
  const pw = await call('POST', `${G}/${g1.json._id}/password`, { token: S1.T, body: { password: 'NewGate2026pass' } });
  ok('set new password → 200, old session ends', pw.status === 200 && (await call('GET', '/gate/me', { token: GT })).status === 401);
  ok('old password refused, new one works', (await call('POST', '/auth/gate/login', { body: { email: g1Email, password: PASSWORD } })).status === 401 && (await call('POST', '/auth/gate/login', { body: { email: g1Email, password: 'NewGate2026pass' } })).status === 200);
  ok("other society can't disable this gateman → 404", (await call('POST', `${G}/${g1.json._id}/status`, { token: S2.T, body: { status: 'disabled' } })).status === 404);
  ok('bad status value → 400', (await call('POST', `${G}/${g1.json._id}/status`, { token: S1.T, body: { status: 'paused' } })).status === 400);
  const sus = await call('POST', `/platform/societies/${S2.id}/suspend`, { token: OT, body: { reason: 'Gate check suspension' } });
  ok('owner suspends society two', sus.status === 200, sus.status);
  const gs = await call('GET', '/gate/me', { token: GT2 });
  ok('suspended society: gateman → 403 SOCIETY_SUSPENDED', gs.status === 403 && code(gs) === 'SOCIETY_SUSPENDED', gs);
  ok('suspended society: gate sign-in → 403 SOCIETY_SUSPENDED', code(await call('POST', '/auth/gate/login', { body: { email: g2Email, password: PASSWORD } })) === 'SOCIETY_SUSPENDED');
  await call('POST', `/platform/societies/${S2.id}/reactivate`, { token: OT, body: {} });
  ok('reactivated: gateman works again', (await call('GET', '/gate/me', { token: GT2 })).status === 200);

  head('Audit trail + logo removal + address search');
  const audit = await call('GET', '/society/audit-logs?limit=100', { token: S1.T });
  const acts = new Set((audit.json?.items || []).map((a) => a.action));
  ok('audit: gateman created / updated / disabled / enabled / password set, logo updated', ['gate.gateman_created', 'gate.gateman_updated', 'gate.gateman_disabled', 'gate.gateman_enabled', 'gate.gateman_password_set', 'society.logo_updated'].every((a) => acts.has(a)), [...acts]);
  ok('audit: gate actions (approve / enter / exit / reject / walk-in / note)', ['gate.visitor_approved', 'gate.visitor_entered', 'gate.visitor_exited', 'gate.visitor_rejected', 'gate.visitor_walkin', 'gate.note_sent'].every((a) => acts.has(a)), [...acts]);
  const rm = await call('PATCH', '/society/profile', { token: S1.T, body: { logoId: null } });
  ok('logoId null removes the logo', rm.status === 200 && rm.json?.logo === null, rm.json?.logo);
  ok('staffRoles logoUrl is null after removal', (await call('GET', '/me', { token: S1.T })).json?.staffRoles?.[0]?.society?.logoUrl === null);
  ok('address search: query under 3 characters → 400', (await call('GET', '/public/geocode?q=ab')).status === 400);
  const geo = await call('GET', `/public/geocode?q=${encodeURIComponent('Baner Pune')}`);
  ok(`address search answers 200 (results) or 503 (offline), never 500 → ${geo.status}`, (geo.status === 200 && Array.isArray(geo.json?.items) && geo.json.items.length <= 5) || (geo.status === 503 && code(geo) === 'GEOCODER_UNAVAILABLE'), geo);
  ok('reverse lookup with bad latitude → 400', (await call('GET', '/public/geocode/reverse?lat=95&lng=73')).status === 400);
  const rev = await call('GET', `/public/geocode/reverse?lat=${LOC.lat}&lng=${LOC.lng}`);
  ok(`reverse lookup 200 or 503 → ${rev.status}`, (rev.status === 200 && 'label' in (rev.json || {})) || (rev.status === 503 && code(rev) === 'GEOCODER_UNAVAILABLE'), rev);
  ok('gate routes need a real id', (await call('GET', `/gate/visitors/${FAKE}`, { token: GT2 })).status === 404);
}

main()
  .catch((e) => ok('checker crashed', false, e.stack))
  .finally(() => {
    const failed = results.filter((x) => !x).length;
    console.log(`\ngate-check: ${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  });
