#!/usr/bin/env node
/**
 * Dry checker for Master Admin sub-admins (see skills/platform-subadmins/SKILL.md).
 *
 *  1. Static: every platformRouter route in Backend/server.js carries a permission guard.
 *  2. Owner creates / edits / disables sub-admins; validation and owner-only rules.
 *  3. Permission matrix: for every area, a sub-admin with only `area.view` can read that area and nothing else,
 *     can't use its write route; with `area.manage` the write route passes the guard.
 *  4. Badges filtered, society workspace read vs write, changes apply without re-login, disable revokes the
 *     session, password reset, sub-admins protected from the Accounts page, audit trail.
 *
 * LOCAL backend only:  API_BASE=http://127.0.0.1:3013 npm run subadmin-check
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { superAdminLogin } from './sa-login.mjs';

const BASE = (process.env.API_BASE || 'http://127.0.0.1:3013').replace(/\/$/, '');
if (/adda\.skillinnovex\.in|mongodb\.net|vercel\.app/.test(BASE)) {
  console.error('Refusing to run against production. Use a local backend.');
  process.exit(2);
}
const API = `${BASE}/api/v1`;
const SA = { email: process.env.SA_EMAIL || 'admin@addaapp.local', password: process.env.SA_PASSWORD || 'DevAdmin12345' };
const RUN = Date.now().toString(36);
const PASSWORD = 'Helper2026secure';
const FAKE = '0123456789abcdef01234567'; // valid ObjectId that matches nothing

const results = [];
const ok = (name, cond, detail) => {
  results.push({ name, pass: Boolean(cond) });
  console.log(`  ${cond ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m'} ${name}${!cond && detail !== undefined ? `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}` : ''}`);
  return Boolean(cond);
};
const head = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

// Stay under the backend's 300 requests/min per IP.
let last = 0;
async function call(method, p, { token, body, reason } = {}) {
  const wait = last + 230 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (reason) headers['X-Action-Reason'] = encodeURIComponent(reason);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (res.status === 429) {
    console.error('\nRate limited. Start the local API with LOGIN_RATE_LIMIT=2000 and wait a minute between suites.');
    process.exit(1);
  }
  return { status: res.status, json };
}
const login = (email, password) => call('POST', '/auth/admin/login', { body: { email, password } });
const code = (r) => r.json?.error?.code || r.json?.code;
const denied = (r) => r.status === 403 && code(r) === 'PERMISSION_DENIED';
const passesGuard = (r) => r.status !== 403 && r.status !== 401 && r.status < 500;

// ---------------------------------------------------------------- 1. static route scan
head('1. Every platform route has a permission guard (Backend/server.js)');
const serverFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../Backend/server.js');
const src = fs.readFileSync(serverFile, 'utf8');
const routeLines = src.split('\n').filter((l) => /^platformRouter\.(get|post|put|patch|delete)\(/.test(l));
const unguarded = routeLines.filter((l) => !/requirePlatformPerm\(|requireOwner/.test(l) && !l.startsWith("platformRouter.get('/overview', "));
ok(`${routeLines.length} platform routes found`, routeLines.length >= 50, routeLines.length);
ok('no platform route without requirePlatformPerm / requireOwner', unguarded.length === 0, unguarded.join('\n'));
ok('workspace (/societies/:sid/manage) checks permission in loadPlatformSociety', /async function loadPlatformSociety[\s\S]{0,400}platformAllows\(req\.user, write \? 'societies\.manage' : 'societies\.view'\)/.test(src));
ok('sub-admin management routes are owner-only', routeLines.filter((l) => l.includes("'/subadmins")).every((l) => l.includes('requireOwner')) && routeLines.some((l) => l.includes("'/subadmins")));

// Route used per area: [read, write]. Write routes use a non-existent id or an empty body, so passing the guard
// gives 400/404 and changes nothing.
const AREAS = {
  dashboard: { read: ['GET', '/platform/overview/insights'] },
  applications: { read: ['GET', '/platform/society-registrations'], write: ['POST', `/platform/society-registrations/${FAKE}/review`] },
  societies: { read: ['GET', '/platform/societies'], write: ['POST', `/platform/societies/${FAKE}/suspend`, { reason: 'dry check' }] },
  members: { read: ['GET', '/platform/members'], write: ['POST', `/platform/users/${FAKE}/sign-out-all`, { reason: 'dry check' }] },
  accounts: { read: ['GET', '/platform/users'], write: ['POST', `/platform/users/${FAKE}/disabled`, { reason: 'dry check' }] },
  vendors: { read: ['GET', '/platform/vendors'], write: ['POST', `/platform/vendors/${FAKE}/kyc`, {}] },
  service_bookings: { read: ['GET', '/platform/service-bookings'] },
  earnings: { read: ['GET', '/platform/earnings'] },
  listings: { read: ['GET', '/platform/listings'], write: ['POST', `/platform/listings/property/${FAKE}/moderate`, {}] },
  ads: { read: ['GET', '/platform/ads'], write: ['POST', `/platform/ads/${FAKE}/review`, {}] },
  coupons: { read: ['GET', '/platform/coupons'], write: ['POST', '/platform/coupons', {}] },
  reports: { read: ['GET', '/platform/content-reports'] },
  payments: { read: ['GET', '/platform/payments'] },
  audit: { read: ['GET', '/platform/audit-logs'] },
  categories: { read: ['GET', '/platform/categories'], write: ['POST', '/platform/categories', {}] },
  announcements: { read: ['GET', '/platform/announcements'], write: ['POST', `/platform/announcements/${FAKE}/archive`] },
  settings: { read: ['GET', '/platform/settings'], write: ['PUT', '/platform/settings/support.email', {}] },
};
const hit = (token, [method, p, body]) => call(method, p, { token, body });

async function main() {
  // ---------------------------------------------------------------- 2. owner manages sub-admins
  head('2. Owner creates and manages sub-admins');
  const owner = await superAdminLogin(API, SA.email, SA.password);
  if (!ok('owner signs in', owner.status === 200, owner.status)) return;
  const OT = owner.body.accessToken;
  const ownerId = owner.body.user._id;

  const list0 = await call('GET', '/platform/subadmins', { token: OT });
  ok('GET /platform/subadmins → 200 with permission catalogue', list0.status === 200 && Array.isArray(list0.json?.catalogue) && list0.json.catalogue.length === Object.keys(AREAS).length, list0.json?.catalogue?.length);
  const cat = list0.json?.catalogue || [];
  ok('catalogue areas match the checker (no area left untested)', cat.every((c) => AREAS[c.area]) && Object.keys(AREAS).every((a) => cat.some((c) => c.area === a)), cat.map((c) => c.area));
  ok('view-only areas have no write route here', cat.filter((c) => c.viewOnly).every((c) => !AREAS[c.area].write));

  const email = `helper.${RUN}@nivasa.local`;
  const base = { name: 'Dry Check Helper', email, password: PASSWORD };
  let r = await call('POST', '/platform/subadmins', { token: OT, body: { ...base, password: 'short1', permissions: ['vendors.view'] } });
  ok('weak password → 400', r.status === 400, r.status);
  r = await call('POST', '/platform/subadmins', { token: OT, body: { ...base, password: 'onlyletterslong', permissions: ['vendors.view'] } });
  ok('password without numbers → 400', r.status === 400, r.status);
  r = await call('POST', '/platform/subadmins', { token: OT, body: { ...base, permissions: [] } });
  ok('no permission ticked → 400', r.status === 400, r.status);
  r = await call('POST', '/platform/subadmins', { token: OT, body: { ...base, permissions: ['made.up', 'subadmins.manage'] } });
  ok('only unknown permissions (incl. "subadmins.manage") → 400', r.status === 400, r.status);
  r = await call('POST', '/platform/subadmins', { token: OT, body: { ...base, email: SA.email, permissions: ['vendors.view'] } });
  ok('email already used (owner) → 409 EMAIL_TAKEN', r.status === 409 && code(r) === 'EMAIL_TAKEN', r);
  r = await call('POST', '/platform/subadmins', { token: OT, body: { ...base, email: 'not-an-email', permissions: ['vendors.view'] } });
  ok('invalid email → 400', r.status === 400, r.status);

  r = await call('POST', '/platform/subadmins', { token: OT, body: { ...base, permissions: ['coupons.manage', 'made.up', 'vendors.view'] } });
  if (!ok('create sub-admin → 201', r.status === 201, r)) return;
  const sub = r.json;
  ok('manage adds view; unknown dropped', JSON.stringify(sub.permissions) === JSON.stringify(['vendors.view', 'coupons.view', 'coupons.manage']), sub.permissions);
  ok('response has no password hash', !JSON.stringify(sub).includes('passwordHash'));
  r = await call('POST', '/platform/subadmins', { token: OT, body: { ...base, permissions: ['vendors.view'] } });
  ok('same email twice → 409', r.status === 409, r.status);

  // ---------------------------------------------------------------- sign-in
  head('Sub-admin sign-in');
  r = await login(email, PASSWORD);
  if (!ok('sub-admin signs in at Master Admin login → 200', r.status === 200, r)) return;
  let ST = r.json.accessToken;
  ok('login says platformRole sub_admin + permissions', r.json.user.platformRole === 'sub_admin' && r.json.user.platformPermissions?.includes('coupons.manage'), r.json.user);
  const me = await call('GET', '/me', { token: ST });
  ok('/me returns the same permissions', JSON.stringify(me.json?.user?.platformPermissions) === JSON.stringify(sub.permissions), me.json?.user);
  ok('owner /me has no permission list (has everything)', !owner.body.user.platformPermissions);

  head('Owner-only rules');
  ok('sub-admin GET /platform/subadmins → 403 OWNER_ONLY', code(await call('GET', '/platform/subadmins', { token: ST })) === 'OWNER_ONLY');
  ok('sub-admin can’t create sub-admins → 403', (await call('POST', '/platform/subadmins', { token: ST, body: { ...base, email: `x.${RUN}@nivasa.local`, permissions: ['audit.view'] } })).status === 403);
  ok('sub-admin can’t raise own permissions → 403', (await call('PATCH', `/platform/subadmins/${sub._id}`, { token: ST, body: { permissions: ['settings.manage'] } })).status === 403);
  ok('owner account is not a sub-admin (PATCH → 404)', (await call('PATCH', `/platform/subadmins/${ownerId}`, { token: OT, body: { name: 'Hacked' } })).status === 404);
  ok('Accounts page can’t disable a sub-admin → 403', (await call('POST', `/platform/users/${sub._id}/disabled`, { token: OT, body: { reason: 'dry check' } })).status === 403);
  ok('Members page can’t set a sub-admin password → 403', (await call('POST', `/platform/users/${sub._id}/password`, { token: OT, body: { password: 'Another2026pass', reason: 'dry check' } })).status === 403);
  const accts = await call('GET', '/platform/users?role=sub_admin', { token: OT });
  ok('Accounts filter role=sub_admin lists the sub-admin', accts.json?.items?.some((u) => u._id === sub._id), accts.json?.items?.length);

  // ---------------------------------------------------------------- 3. matrix
  head('3. Permission matrix (view-only / manage per area)');
  for (const [area, routes] of Object.entries(AREAS)) {
    const p = await call('PATCH', `/platform/subadmins/${sub._id}`, { token: OT, body: { permissions: [`${area}.view`] } });
    if (!ok(`${area}: set to view only`, p.status === 200, p)) continue;
    const own = await hit(ST, routes.read);
    ok(`${area}.view → can read (${routes.read[1].replace(FAKE, ':id')})`, own.status === 200, own);
    if (routes.write) {
      const w = await hit(ST, routes.write);
      ok(`${area}.view → write denied (${routes.write[0]} ${routes.write[1].replace(FAKE, ':id')})`, denied(w), w);
    }
    const others = Object.entries(AREAS).filter(([a]) => a !== area);
    const leaks = [];
    for (const [a, rt] of others) if (!denied(await hit(ST, rt.read))) leaks.push(a);
    ok(`${area}.view → every other area denied`, leaks.length === 0, leaks);
    if (routes.write) {
      await call('PATCH', `/platform/subadmins/${sub._id}`, { token: OT, body: { permissions: [`${area}.manage`] } });
      const w = await hit(ST, routes.write);
      ok(`${area}.manage → write passes the guard (${w.status})`, passesGuard(w), w);
    }
  }

  head('Badge counts and society workspace');
  await call('PATCH', `/platform/subadmins/${sub._id}`, { token: OT, body: { permissions: ['vendors.view'] } });
  const ov = await call('GET', '/platform/overview', { token: ST });
  ok('overview: sub-admin gets only counts they can view', ov.status === 200 && 'pendingKyc' in (ov.json?.counts || {}) && !('pendingRegistrations' in ov.json.counts) && !('users' in ov.json.counts) && !ov.json.billing, ov.json);
  const ovOwner = await call('GET', '/platform/overview', { token: OT });
  ok('overview: owner still gets every count', 'pendingRegistrations' in (ovOwner.json?.counts || {}) && ovOwner.json?.billing);
  ok('workspace read without societies.view → 403', denied(await call('GET', `/platform/societies/${FAKE}/manage/overview`, { token: ST })));
  await call('PATCH', `/platform/subadmins/${sub._id}`, { token: OT, body: { permissions: ['societies.view'] } });
  ok('workspace read with societies.view → passes guard (404 unknown society)', (await call('GET', `/platform/societies/${FAKE}/manage/overview`, { token: ST })).status === 404);
  ok('workspace write with societies.view → 403', denied(await call('POST', `/platform/societies/${FAKE}/manage/announcements`, { token: ST, body: {}, reason: 'dry check' })));
  await call('PATCH', `/platform/subadmins/${sub._id}`, { token: OT, body: { permissions: ['societies.manage'] } });
  ok('workspace write with societies.manage → passes guard (404 unknown society)', (await call('POST', `/platform/societies/${FAKE}/manage/announcements`, { token: ST, body: {}, reason: 'dry check' })).status === 404);

  // ---------------------------------------------------------------- 4. lifecycle
  head('4. Changes apply at once, audit, password, disable');
  await call('PATCH', `/platform/subadmins/${sub._id}`, { token: OT, body: { permissions: ['coupons.manage'] } });
  ok('permission change applies without re-login', (await call('GET', '/platform/coupons', { token: ST })).status === 200 && denied(await call('GET', '/platform/societies', { token: ST })));
  ok('/me reflects the change', JSON.stringify((await call('GET', '/me', { token: ST })).json?.user?.platformPermissions) === JSON.stringify(['coupons.view', 'coupons.manage']));
  ok('PATCH with empty permissions → 400', (await call('PATCH', `/platform/subadmins/${sub._id}`, { token: OT, body: { permissions: [] } })).status === 400);
  ok('PATCH with nothing → 400', (await call('PATCH', `/platform/subadmins/${sub._id}`, { token: OT, body: {} })).status === 400);
  const cc = await call('POST', '/platform/coupons', { token: ST, body: { code: `SUB${RUN.slice(-6).toUpperCase()}`, discountPaise: 5000, maxUses: 1, active: false } });
  ok('sub-admin with coupons.manage creates a coupon → 201', cc.status === 201, cc);

  await call('PATCH', `/platform/subadmins/${sub._id}`, { token: OT, body: { name: 'Dry Check Helper 2' } }); // name only keeps permissions
  const logs = await call('GET', '/platform/audit-logs?action=platform.subadmin&limit=50', { token: OT });
  const acts = new Set((logs.json?.items || []).filter((l) => String(l.targetId) === sub._id).map((l) => l.action));
  ok('audit: subadmin_created and subadmin_updated written', acts.has('platform.subadmin_created') && acts.has('platform.subadmin_updated'), [...acts]);
  const couponLog = await call('GET', '/platform/audit-logs?action=platform.coupon&limit=20', { token: OT });
  const byHelper = (couponLog.json?.items || []).find((l) => String(l.actor?._id || l.actor) === sub._id);
  ok('audit: action by sub-admin recorded with actorRole sub_admin', byHelper?.actorRole === 'sub_admin', byHelper || couponLog.json?.items?.slice(0, 2));
  ok('sub-admin can’t read audit log without audit.view', denied(await call('GET', '/platform/audit-logs', { token: ST })));

  const selfPw = await call('POST', '/me/password', { token: ST, body: { currentPassword: PASSWORD, newPassword: 'Changed2026secure' } });
  ok('sub-admin changes own password (My security) → 200', selfPw.status === 200, selfPw);
  ok('new password signs in', (await login(email, 'Changed2026secure')).status === 200);

  const reset = await call('POST', `/platform/subadmins/${sub._id}/password`, { token: OT, body: { password: 'Reset2026secure' } });
  ok('owner sets a new password → 200', reset.status === 200, reset);
  ok('old session ended after reset → 401', (await call('GET', '/me', { token: ST })).status === 401);
  ok('weak reset password → 400', (await call('POST', `/platform/subadmins/${sub._id}/password`, { token: OT, body: { password: 'weakweakweak' } })).status === 400);
  r = await login(email, 'Reset2026secure');
  ok('reset password signs in', r.status === 200, r.status);
  ST = r.json?.accessToken;

  const dis = await call('POST', `/platform/subadmins/${sub._id}/status`, { token: OT, body: { status: 'disabled' } });
  ok('owner disables sub-admin → 200', dis.status === 200 && dis.json?.status === 'disabled', dis);
  ok('disabled: session ended at once → 401', (await call('GET', '/platform/coupons', { token: ST })).status === 401);
  ok('disabled: can’t sign in', (await login(email, 'Reset2026secure')).status >= 400);
  const en = await call('POST', `/platform/subadmins/${sub._id}/status`, { token: OT, body: { status: 'active' } });
  ok('owner enables again → can sign in', en.status === 200 && (await login(email, 'Reset2026secure')).status === 200);
  const final = await call('GET', '/platform/subadmins', { token: OT });
  const row = final.json?.items?.find((x) => x._id === sub._id);
  ok('list shows status, permissions, last sign-in', row?.status === 'active' && row?.permissions?.length === 2 && row?.lastLoginAt, row);
  ok('non-sub-admin id → 404', (await call('POST', `/platform/subadmins/${FAKE}/status`, { token: OT, body: { status: 'disabled' } })).status === 404);
  await call('POST', `/platform/subadmins/${sub._id}/status`, { token: OT, body: { status: 'disabled' } }); // leave the test account off
}

main()
  .catch((e) => ok('checker crashed', false, e.stack))
  .finally(() => {
    const failed = results.filter((x) => !x.pass).length;
    console.log(`\nsubadmin-check: ${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  });
