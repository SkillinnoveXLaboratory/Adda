#!/usr/bin/env node
/**
 * Dry checker for society Voting (skills/society-voting/SKILL.md) against a LOCAL backend only.
 * Builds two societies (isolation), residents, then: create validation → notify → member vote (once, pending
 * members can't, other society can't) → staff ratio, turnout, voter list → end → result rules → members see the
 * result → delete rules → audit trail.
 *
 *   API_BASE=http://127.0.0.1:3013 npm run voting-check
 */
const BASE = (process.env.API_BASE || 'http://127.0.0.1:3013').replace(/\/$/, '');
if (/adda\.skillinnovex\.in|mongodb\.net|vercel\.app/.test(BASE)) {
  console.error('Refusing to run against production. Use a local backend.');
  process.exit(2);
}
const API = `${BASE}/api/v1`;
const SA = { email: process.env.SA_EMAIL || 'admin@addaapp.local', password: process.env.SA_PASSWORD || 'DevAdmin12345' };
const RUN = Date.now().toString(36);
const PASSWORD = 'Voting2026secure';
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
  const wait = last + 230 - Date.now();
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
const code = (r) => r.json?.error?.code;
let seq = 0;
const phone = () => `9${String(Date.now() + ++seq * 7907).slice(-9)}`;
const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();

/** Registration → approve → activate → admin token, a building with flats A-101..A-202. */
async function makeSociety(owner, label) {
  const email = `vote.${label}.${RUN}@example.com`;
  const reg = await call('POST', '/public/society-registrations', {
    body: { societyName: `Vote ${label} ${RUN}`, addressLine: '1 Test Road', area: 'Baner', city: 'Pune', state: 'Maharashtra', pincode: '411045', phone: phone(), email: `office.${label}.${RUN}@example.com`, totalUnits: 10, representative: { name: `Admin ${label}`, designation: 'Secretary', phone: phone(), email }, documents: [], submit: true },
  });
  if (reg.status !== 201) throw new Error(`registration ${reg.status} ${JSON.stringify(reg.json)}`);
  const q = await call('GET', `/platform/society-registrations?q=${reg.json.referenceCode}`, { token: owner });
  const row = q.json.items[0];
  await call('POST', `/platform/society-registrations/${row._id}/review`, { token: owner });
  const appr = await call('POST', `/platform/society-registrations/${row._id}/approve`, { token: owner, body: {} });
  await call('POST', '/public/society-registrations/activate', { body: { referenceCode: reg.json.referenceCode, accessKey: reg.json.accessKey, password: PASSWORD } });
  const adm = await call('POST', '/auth/admin/login', { body: { email, password: PASSWORD } });
  const T = adm.json.accessToken;
  const b = await call('POST', '/society/buildings', { token: T, body: { name: 'Tower A', floors: 2 } });
  await call('POST', '/society/flats/bulk', { token: T, body: { buildingId: b.json._id, fromFloor: 1, toFloor: 2, unitsPerFloor: 2, pattern: '{building}-{floor}{unit}', areaSqft: 900 } });
  return { id: appr.json.society._id, T, building: b.json._id };
}

async function member(soc, name, flatNumber, approve = true) {
  const r = await call('POST', '/auth/resident/register', { body: { phone: phone(), name, password: PASSWORD } });
  const m = await call('POST', '/memberships', { token: r.json.accessToken, body: { societyId: soc.id, buildingId: soc.building, flatNumber, residentType: 'owner' } });
  if (approve) await call('POST', `/society/memberships/${m.json._id}/approve`, { token: soc.T, body: {} });
  return r.json.accessToken;
}

async function main() {
  head('Setup: two societies, residents');
  const ownerLogin = await call('POST', '/auth/admin/login', { body: SA });
  if (!ok('owner signs in', ownerLogin.status === 200, ownerLogin.status)) return;
  const OT = ownerLogin.json.accessToken;
  const S1 = await makeSociety(OT, 'one');
  const S2 = await makeSociety(OT, 'two');
  ok('two societies with admins', S1.T && S2.T && S1.id !== S2.id);
  const R1 = await member(S1, 'Rahul Voter', 'A-101');
  const R2 = await member(S1, 'Priya Voter', 'A-102');
  const R3 = await member(S1, 'Pending Person', 'A-201', false);
  const X1 = await member(S2, 'Other Society', 'A-101');
  ok('residents ready (2 approved + 1 pending in S1, 1 in S2)', R1 && R2 && R3 && X1);

  head('Create a vote (staff) — validation');
  const good = { question: 'Should we install solar panels on the roof?', description: 'Cost is shared by all flats. Vote Interested if you want a quote meeting.', options: ['Interested', 'Not interested'], closesAt: inHours(48) };
  ok('only 1 option → 400', (await call('POST', '/society/polls', { token: S1.T, body: { ...good, options: ['Interested'] } })).status === 400);
  ok('same option twice → 400', (await call('POST', '/society/polls', { token: S1.T, body: { ...good, options: ['Yes', 'yes'] } })).status === 400);
  ok('close time in the past → 400', (await call('POST', '/society/polls', { token: S1.T, body: { ...good, closesAt: inHours(-1) } })).status === 400);
  ok('close time over a year → 400', (await call('POST', '/society/polls', { token: S1.T, body: { ...good, closesAt: inHours(24 * 400) } })).status === 400);
  ok('question too short → 400', (await call('POST', '/society/polls', { token: S1.T, body: { ...good, question: 'Hi' } })).status === 400);
  ok('resident can’t create (staff API) → 403', (await call('POST', '/society/polls', { token: R1, body: good })).status === 403);
  const c = await call('POST', '/society/polls', { token: S1.T, body: good });
  if (!ok('create vote → 201', c.status === 201, c)) return;
  const P = c.json;
  ok('created: note saved, not ended, 2 eligible voters, 0% turnout', P.description === good.description && P.ended === false && P.eligibleVoters === 2 && P.turnoutPercent === 0, P);
  const other = await call('POST', '/society/polls', { token: S2.T, body: { ...good, question: `Other society vote ${RUN}` } });
  ok('second society creates its own vote', other.status === 201);

  let note = null;
  for (let i = 0; i < 6 && !note; i++) {
    const n = await call('GET', '/notifications?limit=10', { token: R1 });
    note = n.json?.items?.find((x) => x.type === 'poll' && x.data?.id === P._id);
    if (!note) await new Promise((r) => setTimeout(r, 300));
  }
  ok('members notified (type poll, route Poll, id)', note?.data?.route === 'Poll', note);

  head('Members vote');
  const list = await call('GET', '/resident/polls', { token: R1 });
  const mine = list.json?.items?.find((x) => x._id === P._id);
  ok('member sees the vote with the note, open, not voted', mine?.description === good.description && mine?.open === true && mine?.myVote === null, mine);
  ok('counts hidden before voting', mine?.options?.every((o) => o.votes === undefined) && mine?.totalVotes === undefined, mine?.options);
  ok('other society’s vote not listed', !list.json.items.some((x) => x._id === other.json._id));
  ok('other society’s vote → 404 (detail)', (await call('GET', `/resident/polls/${other.json._id}`, { token: R1 })).status === 404);
  ok('other society’s vote → 404 (vote)', (await call('POST', `/resident/polls/${other.json._id}/vote`, { token: R1, body: { optionId: other.json.options[0]._id } })).status === 404);
  ok('member of other society can’t vote here → 404', (await call('POST', `/resident/polls/${P._id}/vote`, { token: X1, body: { optionId: P.options[0]._id } })).status === 404);
  ok('pending member can’t vote → 403', (await call('POST', `/resident/polls/${P._id}/vote`, { token: R3, body: { optionId: P.options[0]._id } })).status === 403);
  ok('unknown option → 400', (await call('POST', `/resident/polls/${P._id}/vote`, { token: R1, body: { optionId: FAKE } })).status === 400);
  const v1 = await call('POST', `/resident/polls/${P._id}/vote`, { token: R1, body: { optionId: P.options[0]._id } });
  ok('member votes "Interested" → 200, myVote set', v1.status === 200 && v1.json?.myVote === P.options[0]._id, v1);
  const again = await call('POST', `/resident/polls/${P._id}/vote`, { token: R1, body: { optionId: P.options[1]._id } });
  ok('second vote by the same member → 409 ALREADY_VOTED', again.status === 409 && code(again) === 'ALREADY_VOTED', again);
  const [a, b] = await Promise.all([
    call('POST', `/resident/polls/${P._id}/vote`, { token: R2, body: { optionId: P.options[1]._id } }),
    call('POST', `/resident/polls/${P._id}/vote`, { token: R2, body: { optionId: P.options[1]._id } }),
  ]);
  ok('double tap: one vote counted, other 409', [a.status, b.status].sort().join() === '200,409', [a.status, b.status]);
  const d = await call('GET', `/resident/polls/${P._id}`, { token: R1 });
  ok('after voting member sees counts', d.json?.totalVotes === 2 && d.json?.options?.[0]?.votes === 1, d.json);

  head('Staff: ratio and voting data');
  const sl = await call('GET', '/society/polls?status=open', { token: S1.T });
  const row = sl.json?.items?.find((x) => x._id === P._id);
  ok('open filter lists it with 2 votes, 50% / 50%, 100% turnout', row?.totalVotes === 2 && row.options[0].percent === 50 && row.options[1].percent === 50 && row.turnoutPercent === 100, row);
  ok('ended filter does not list it yet', !(await call('GET', '/society/polls?status=ended', { token: S1.T })).json?.items?.some((x) => x._id === P._id));
  const det = await call('GET', `/society/polls/${P._id}`, { token: S1.T });
  const names = (det.json?.votes || []).map((v) => `${v.name}|${v.flat}|${v.optionLabel}`).sort();
  ok('voter list: name, flat, option', JSON.stringify(names) === JSON.stringify(['Priya Voter|A-102|Not interested', 'Rahul Voter|A-101|Interested']), det.json?.votes);
  ok('other society’s staff can’t open it → 404', (await call('GET', `/society/polls/${P._id}`, { token: S2.T })).status === 404);
  ok('resident can’t open staff detail → 403', (await call('GET', `/society/polls/${P._id}`, { token: R1 })).status === 403);

  head('End, result, delete');
  const early = await call('PUT', `/society/polls/${P._id}/result`, { token: S1.T, body: { result: 'Too early' } });
  ok('result before the vote ends → 409 POLL_OPEN', early.status === 409 && code(early) === 'POLL_OPEN', early);
  const del = await call('DELETE', `/society/polls/${P._id}`, { token: S1.T });
  ok('delete with votes → 409 POLL_HAS_VOTES', del.status === 409 && code(del) === 'POLL_HAS_VOTES', del);
  const close = await call('POST', `/society/polls/${P._id}/close`, { token: S1.T });
  ok('end now → 200, ended', close.status === 200 && close.json?.ended === true && close.json?.status === 'closed', close);
  ok('end twice → 404', (await call('POST', `/society/polls/${P._id}/close`, { token: S1.T })).status === 404);
  const late = await call('POST', `/resident/polls/${P._id}/vote`, { token: R1, body: { optionId: P.options[0]._id } });
  ok('vote after it ended → 409 POLL_ENDED', late.status === 409 && code(late) === 'POLL_ENDED', late);
  ok('ended filter lists it', (await call('GET', '/society/polls?status=ended', { token: S1.T })).json?.items?.some((x) => x._id === P._id));
  ok('empty result → 400', (await call('PUT', `/society/polls/${P._id}/result`, { token: S1.T, body: { result: '' } })).status === 400);
  const RESULT = 'Interested and Not interested tied 1–1. The committee will hold a meeting on Sunday before deciding.';
  const pub = await call('PUT', `/society/polls/${P._id}/result`, { token: S1.T, body: { result: RESULT } });
  ok('publish result → 200', pub.status === 200 && pub.json?.result === RESULT && pub.json?.resultPublishedAt, pub);
  const rl = (await call('GET', '/resident/polls', { token: R2 })).json?.items?.find((x) => x._id === P._id);
  ok('members see the result, final counts, and it is closed', rl?.result === RESULT && rl?.open === false && rl?.totalVotes === 2, rl);
  let resNote = null;
  for (let i = 0; i < 6 && !resNote; i++) {
    resNote = (await call('GET', '/notifications?limit=10', { token: R2 })).json?.items?.find((x) => x.type === 'poll' && /result/i.test(x.title) && x.data?.id === P._id);
    if (!resNote) await new Promise((r) => setTimeout(r, 300));
  }
  ok('members notified of the result', Boolean(resNote));
  ok('edit result → 200', (await call('PUT', `/society/polls/${P._id}/result`, { token: S1.T, body: { result: `${RESULT} (Meeting at 6 pm.)` } })).status === 200);

  const empty = await call('POST', '/society/polls', { token: S1.T, body: { ...good, question: 'Wrong vote created by mistake' } });
  ok('delete a vote nobody voted in → 200', (await call('DELETE', `/society/polls/${empty.json._id}`, { token: S1.T })).status === 200);
  ok('deleted vote → 404 for staff and gone for members', (await call('GET', `/society/polls/${empty.json._id}`, { token: S1.T })).status === 404 && !(await call('GET', '/resident/polls', { token: R1 })).json?.items?.some((x) => x._id === empty.json._id));

  const logs = await call('GET', '/society/audit-logs?action=poll&limit=50', { token: S1.T });
  const acts = new Set((logs.json?.items || []).map((l) => l.action));
  ok('audit: created, closed, result published/updated, deleted', ['poll.created', 'poll.closed', 'poll.result_published', 'poll.result_updated', 'poll.deleted'].every((x) => acts.has(x)), [...acts]);
}

main()
  .catch((e) => ok('checker crashed', false, e.stack))
  .finally(() => {
    const failed = results.filter((x) => !x).length;
    console.log(`\nvoting-check: ${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  });
