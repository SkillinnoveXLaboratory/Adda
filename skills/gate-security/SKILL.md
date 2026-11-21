---
name: gate-security
description: Use for the society gate (security guard / "gateman") feature — SocialPanel "Gatemen" page (create accounts with name, email, password; disable; reset password), gateman sign-in and screens in the member app (guest list, approve, entry/exit, walk-in guests assigned to a flat, members directory with call, notes to members), and the member "Guests" screen (pre-register guests, see notes). Rules, API and the dry check (DRY_CHECK.md).
---

# Gate security (gatemen, guests, notes)

## Actors
- **Society staff** (SocialPanel, permission `gate`: admin, secretary, manager) create and manage gatemen.
- **Gateman** — a `SocietyStaff` record with `role: 'gateman'` for exactly one society. Signs in **only in the app**
  (email + password, "Gate staff sign-in"), session client `gate`. SocialPanel refuses gatemen (403
  `NO_PANEL_ACCESS` — panel login needs a non-gateman staff role or a platform role).
- **Member** — approved resident of the society (app).

## Rules (server enforced)
1. Gateman accounts: name (2–120), email (unique across all accounts → 409 `EMAIL_TAKEN`), password (≥10, letters +
   digits), optional phone (10-digit Indian mobile). Disable → signed out everywhere at once; enable; set new password
   (signs out). Audited `gate.gateman_created|updated|disabled|enabled|password_set`. Society suspended → gateman 403.
2. **Visitor (guest)**: `{ society, flat, building, host (member user, optional for flat-level), name (2–80), phone
   (10-digit Indian mobile, required), purpose? (≤120), expectedDate (YYYY-MM-DD India),
   expectedIn? / expectedOut? (HH:MM), status, entryAt?, exitAt?, createdBy, createdByRole: member|gateman,
   approvedBy?, approvedAt?, rejectedReason? }`.
   Status machine (status guard in every update query):
   `expected` → `approved` | `rejected` | `cancelled`
   `approved` → `inside` (entry recorded, `entryAt`) | `cancelled` | `rejected`
   `inside` → `exited` (`exitAt`)
   Members create `expected` for **their own flat**, date today … +30 days, `expectedOut` after `expectedIn`.
   Members cancel only `expected`/`approved` of their flat. Gateman approves/rejects (reason optional) `expected`,
   records entry for `approved` (or approves + enters in one step with `enterNow`), records exit for `inside`.
   Gateman walk-in: picks a flat (and optionally a member of that flat) → created `approved`, or `inside` when
   `enterNow: true`. The flat's approved members are notified (type `visitor`, route `Guests`): new walk-in,
   approved, entered, rejected.
3. **Gateman sees members**: approved members of the society — name, **full phone** (needed to call), flat number,
   building, resident type. Search by name / flat / phone. Nobody outside the society, no vendors.
4. **Notes**: gateman sends a note (3–500 chars) to a member (optionally about a visitor). The member sees notes in
   the Guests section and gets a notification. Member can mark read. Notes are never shown to other members.
5. Society staff can read the visitor log (`GET /society/visitors`, perm `society.read`) — read only.
6. Times are India time; lists default to **today** for the gateman and **upcoming** for the member.

## API (all under `/api/v1`)
Auth: `POST /auth/gate/login { email, password }` → `{ accessToken, refreshToken, user, gate:{ society:{_id,name,code,logoUrl}, staffId } }`
(401 `INVALID_CREDENTIALS`, 403 `NOT_GATEMAN` for other accounts, 403 `SOCIETY_SUSPENDED`). Refresh/logout as usual.
Staff (`/society/*`, panel): `GET /society/gatemen`, `POST /society/gatemen { name, email, password, phone? }`,
`PATCH /society/gatemen/:id { name?, phone? }`, `POST /society/gatemen/:id/status { status: active|disabled }`,
`POST /society/gatemen/:id/password { password }`, `GET /society/visitors?date=&status=&q=&page` (read only).
Gateman (`/gate/*`, gate session): `GET /gate/me`, `GET /gate/visitors?date=YYYY-MM-DD&status=&q=&page` (default
today, `status=upcoming` = from today on), `GET /gate/visitors/:id`, `POST /gate/visitors { name, phone, purpose?,
flatId, hostId?, enterNow? }`, `POST /gate/visitors/:id/approve|reject|enter|exit { note? }`,
`GET /gate/members?q=&page`, `GET /gate/members/:id` (member + flat + recent visitors), `GET /gate/flats?q=`
(flat number, building, members), `POST /gate/notes { memberId, text, visitorId? }`, `GET /gate/notes?page` (sent).
Member (`/resident/*`): `GET /resident/visitors?scope=upcoming|past&page`, `POST /resident/visitors { name, phone,
purpose?, expectedDate, expectedIn?, expectedOut? }`, `POST /resident/visitors/:id/cancel`, `GET /resident/gate-notes?page`,
`POST /resident/gate-notes/:id/read`.

## App UI
- Login screen: a small "Gate staff sign-in" link → email + password form → `(gate)` area.
- `(gate)` tabs: **Guests** (Today / Upcoming / Inside / All; cards: name, phone (call), flat + building, host, expected
  time, status; buttons Approve / Reject / Entered / Exited, ≥44 px), **Add guest** (name, phone, purpose, flat search,
  member picker, "Entered now"), **Members** (search; each row: name, flat, call icon `tel:`, "Send note"), **Profile**
  (society name, sign out).
- Member: Society hub tile **Guests** → upcoming / past guests, "Add guest" (name, phone, date, in/out time, purpose),
  cancel, live status; **Notes from the gate** list with unread badge.
- Confirm before reject; disable buttons while sending; 409 → refresh with the reason.

## SocialPanel UI
"Gatemen" (sidebar under Administration, perm `gate`): table (name, email, phone, status, last sign-in), New gateman
modal (name, email, phone, password + show/hide), Edit, Set password, Disable/Enable (confirm: "signed out at once"),
and a read-only "Visitor log" tab (date filter, status, flat, entry/exit times).
