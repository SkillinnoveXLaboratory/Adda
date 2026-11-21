# Gate security — dry check

Local backend only (dev DB on 27027, never Atlas).

| # | Check | Command | Pass |
|---|---|---|---|
| 1 | API: gateman CRUD + validation + EMAIL_TAKEN, gateman can't use SocialPanel, gate login, wrong role 403, society isolation (other society's gateman sees nothing), member pre-registers guest (date/time rules), gateman list today/upcoming, approve → enter → exit (status guards, double tap), reject, member cancel rules, walk-in assigned to flat + notification, members list with phones (approved only, no other society), notes to member + member reads, disable gateman → session ends, staff visitor log read-only, audit | `cd SocialPanel && API_BASE=http://127.0.0.1:3013 npm run gate-check` | 0 failed |
| 2 | SocialPanel lint, unit, e2e (Gatemen page: create, disable, set password; visitor log) | `npm run lint && npx vitest run && npm run e2e` | pass |
| 3 | App lint, ui-lint, API check, ui-audit flows: gate sign-in, approve + enter + exit, walk-in, members call/note, member adds guest + reads note | `cd Adda_App && npx eslint src scripts && npm run ui-lint && node scripts/api-check.mjs … && npm run ui-audit -- --build` | 0 errors |
| 4 | Screenshots looked at (390 px): gate guest list, add guest, members, member Guests screen, notes | listed in the report | reviewed |

Glitches to look for: double tap on Approve/Entered; a guest of another flat visible to a member; times shown in UTC;
call button without a number; long names overflowing cards; gateman seeing vendor accounts.
