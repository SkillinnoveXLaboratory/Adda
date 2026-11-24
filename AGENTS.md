# Instructions for coding agents (Claude Code, Codex, etc.)

Before changing anything in this repository:

1. **Read `tasks.md`** — the phased plan, acceptance criteria and the progress log. Update the log when you finish or block a task. Mark a task done only after its validation command actually passed.
2. **Read the relevant skill file(s)** in `skills/<name>/SKILL.md` for the area you touch:
   | Area | Skill |
   |---|---|
   | AddaApp / Adda_App (Expo / React Native, NIVASA design) | `react-native-expo-engineering`, **`nivasa-ui/UI_skill.md`** (template look), `premium-mobile-ui-ux`, **`mobile-ui-qa`** (run `npm run ui-lint` + `npm run ui-audit` before finishing) |
| Member vs vendor accounts, KYC, shop, pricing (per-vendor commission + member discount), bookings, earnings, near-me, ads (any component) | **`vendor-marketplace`** (rules + checks) |
| Vendor products, product categories, product orders / delivery tracking, stock | **`vendor-products`** (`npm run products-check`) |
| Online payments: Cashfree checkout, webhooks, refunds, Easy Split vendor payout accounts, dues / facility / booking / order payments | **`cashfree-payments`** (`npm run payments-check`, fake gateway) |
| Master Admin pages/buttons, any `/platform/*` route, sub-admin accounts | **`platform-subadmins`** (permission per route + `npm run subadmin-check`) |
| Master Admin "Add vendor", admin-entered KYC + documents, sub-admin Activity | **`admin-vendor-onboarding`** (SMART CHECK + `node scripts/vendor-onboarding-check.mjs`) |
| Gate security (gatemen, guests, notes) — app + SocialPanel | **`gate-security`** (+ `skills/gate-security/DRY_CHECK.md`) |
| Latitude/longitude, address search, maps, near-me | **`location-maps`** |
| Society logo/name in SocialPanel | **`society-branding`** |
| Society Voting (SocialPanel page, app screen, /society/polls, /resident/polls) | **`society-voting`** (+ `skills/society-voting/DRY_CHECK.md`) |
| **Every feature, before starting and before finishing** | **`feature-qa`** (requirement understanding, UI/UX and glitch checklist) |
   | SocialPanel / Admin_Panel / any UI | `premium-mobile-ui-ux` |
   | Backend routes/services | `node-api-architecture`, `authentication-authorization`, `multi-tenant-society-security` |
   | Models, indexes, transactions | `mongodb-data-integrity` |
   | Billing, payments, ledger, reports | `payment-accounting-auditing` |
   | Tests | `automated-testing` |
   | Cross-component bugs | `integration-debugging` |
   | Deploy / APK | `production-deployment`, `android-apk-release` |
3. **The API contract is `docs/backend/API.md`.** Change it in the same commit as any API change, and keep all clients in sync.

## Non-negotiables
- Society data isolation: every society-scoped query filters by `req.societyId`, which comes from the caller's verified membership/staff record (the auth middleware in `Backend/server.js`), never from client input.
- Money is integer paise. Financial history is append-only (ledger + audit log are immutable; corrections are reversals/adjustments).
- Never put `MONGODB_URI`, JWT, OTP or payment secrets in `Adda_App/`, `SocialPanel/` or `Admin_Panel/` (run `cd Backend && npm run check-secrets`).
- Never show fabricated data or simulated payment success. Unavailable integrations must say so.
- Backend is a single file (`Backend/server.js`) by design: keep `Backend/` to server.js, package.json, .env, vhost.txt. Never point any test at Atlas; use `npm run dev:db` locally.

## Layout
```
Prototype/    original React web prototype (reference only — do not modify)
Backend/      single-file Express 5 + Mongoose 9 API (server.js; npm run dev, port 3013 dev / 3015 VPS)
SocialPanel/  React + Vite Society Admin portal (society staff only)
Admin_Panel/  React + Vite Master Admin (platform owner; template.html = Paces design)
Adda_App/     Expo React Native app: members, vendors and gatemen (NIVASA brand)
skills/       engineering standards
tasks.md      plan + progress log;  STATUS.md  latest verified status
```
