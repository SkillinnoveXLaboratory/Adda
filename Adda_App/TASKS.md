# AddaApp resident app — task checklist

`[x]` = implemented **and** verified (evidence in brackets). `[ ]` = not done / blocked.

## Foundation
- [x] Upgrade `Adda_App` (KVFNews base) to Expo **SDK 58.0.16**, all packages aligned [`expo-doctor` 20/20]
- [x] Expo Router structure under `src/app`, auth-gated groups via `Stack.Protected` [UI QA: signed-out → welcome; pending → status; approved → home]
- [x] Theme tokens + Plus Jakarta Sans + two-leaf logo from the prototype [screenshots reviewed]
- [x] API client: bearer token, `X-Society-Id`, single-flight refresh, session-end handling, friendly network/timeout errors [api-check refresh/logout cases]
- [x] SecureStore token storage (sessionStorage on web preview only)
- [x] App identity: name AddaApp, package `com.nivasa.app`, generated icon/adaptive icon/splash/favicon, permission strings, `eas.json` → `https://adda.skillinnovex.in`

## Resident flow (all verified in browser QA at 390 px and 360 px + `scripts/api-check.mjs`)
- [x] Welcome → Create account (2 steps, validation, strength meter, terms) → auto sign-in
- [x] Sign in (phone + password), wrong password message, "Need help?" info
- [x] Society search (debounced, empty/error states) → Join (building cards, flat validation incl. `FLAT_NOT_FOUND`, resident type, note)
- [x] Membership pending screen (timeline, details, cancel, manual + 20 s auto refresh) → approval unlocks app + welcome toast
- [x] Home: greeting, society strip, dues card / all-caught-up, 8 quick actions, counts, announcements, bookings, unread bell
- [x] Bills: outstanding summary, Pending/Paid/All filters, invoice detail (lines, totals, arrears, payments), pay-at-office guidance
- [x] Payment history → receipt detail → PDF download (authenticated) [api-check: PDF bytes `%PDF-`]
- [x] Complaints: list + status filters, raise (category, title, description, priority, photo/PDF upload), detail timeline, updates, close/reopen
- [x] Community: feed with pagination, optimistic likes, comments, report post/comment, delete own, polls (vote once, results)
- [x] Notices list + detail with attachments
- [x] Facilities: grid, date strip, slot grid with contiguous multi-slot selection, fee summary, approval notice, `SLOT_TAKEN` handling; My bookings + cancel
- [x] Services: categories → request (date/time preference) → My requests (office notes) + cancel
- [x] Property marketplace: search, rent/sale, type, BHK, city, max price; detail with photo carousel, call / WhatsApp, report; create/edit with photos; mark rented/sold/available; delete
- [x] Local marketplace: categories, search, create/edit, mark sold, delete, society-only visibility
- [x] My listings (moderation badges)
- [x] Notifications: list, unread, mark read / read all, deep links, membership refresh
- [x] Profile: details, membership card, links, help, log out (confirm) ; Edit profile with validation ; Societies & memberships (switch)

## Validation / glitch fixes found during QA
- [x] Backend: PATCH endpoints re-applied create defaults (wiped photos, reset facility fee, reset announcement category) → fixed with `patchOf()` [api-check regression checks]
- [x] Backend: office-recorded receipts said "Resident" → now names the flat's residents
- [x] Backend: expected 503 (payments unavailable) logged as unhandled errors → warn level; deprecated Mongoose option removed
- [x] Back/return navigation for deep-linked screens (`useGoBack`, `returnTo`)
- [x] Late 401 after logout no longer shows "session ended"
- [x] Times shown as "6:00–8:00 PM" (no lowercase/awkward wraps); payment methods "UPI", "Bank transfer"; centred status badges
- [x] Lint: React Compiler rules (no refs in render, no sync setState in effects) — 0 problems

## Verification log
| Check | Result |
|---|---|
| `npx eslint --no-cache src` | 0 problems |
| `npx expo-doctor` | 20/20 passed |
| `npx expo export --platform android` | Hermes bundle 3.5 MB, exit 0 |
| `node scripts/api-check.mjs` (local copy of production server.js) | **96 passed, 0 failed** |
| Browser QA (Playwright, react-native-web) 390 px + 360 px, 40 screens each | all steps pass; only expected 400/401 from deliberate wrong-input tests |

## Not done / blocked
- [ ] SMS OTP sign-in — skipped by decision (needs MSG91/Twilio keys)
- [ ] Online payment — skipped by decision (needs Razorpay keys + society settlement setup)
- [ ] Push notifications — not available in Expo Go; needs a development/production build + FCM credentials
- [ ] Live-server run of `api-check.mjs` — needs the latest `Backend/server.js` deployed (see root STATUS.md)
