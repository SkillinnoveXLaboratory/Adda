# Society Voting — dry check (must pass before "done")

Local backend only (see `skills/vendor-panel/DRY_CHECK.md` for the start commands; never Atlas).

| # | Check | Command / evidence | Pass |
|---|---|---|---|
| 1 | API rules: validation, notifications, vote once, double tap, pending member 403, other society 404, staff ratio/percent/turnout, voter list, end, vote after end 409, result before end 409, result published + notified + visible to members, delete rules, audit | `cd SocialPanel && API_BASE=http://127.0.0.1:3013 npm run voting-check` | 0 failed |
| 2 | Existing SocialPanel contract still passes | `API_BASE=http://127.0.0.1:3013 node scripts/api-check.mjs` | 0 failed |
| 3 | SocialPanel lint, unit, build | `npm run lint && npx vitest run && npm run build` | ok |
| 4 | SocialPanel E2E: admin creates a vote (Interested / Not interested) → two members vote (API) → page shows 50 % / 50 %, turnout, voter names → End now → publish result → result badge | `npm run e2e` | all pass |
| 5 | App: lint, static UI lint, API check (members' poll endpoints), web UI audit of the Voting list + detail at 360/390/412 px, Android JS bundle compiles (no APK build) | `cd Adda_App && npx eslint src scripts && npm run ui-lint && node scripts/api-check.mjs http://localhost:3013 admin@addaapp.local DevAdmin12345 && npm run ui-audit -- --build && npx expo export --platform android` | 0 errors / 0 failures |
| 6 | Screenshots looked at: SocialPanel Voting list + detail (1440 / 390), app Voting before vote / after vote / ended with result | files listed in the report | reviewed |

Glitch list: voting twice by fast taps; vote screen open while staff end the vote (409 → refresh with message);
close time shown in IST; 0 eligible members → turnout "0 of 0" not NaN; long questions wrap without overflow;
percentages add up visually (one decimal).
