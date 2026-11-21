# AddaApp — verified status (2026-10-27)

| Part | Folder | State |
|---|---|---|
| Backend API | `Backend/server.js` | ✅ Complete. **This round's changes are not yet deployed** to adda.skillinnovex.in |
| Resident app | `Adda_App/` | ✅ NIVASA design (navy + gold, logo from `assets/images/App_main_icon.png`), Expo SDK 58.0.16, server-driven. UI checks: `npm run ui-lint`, `npm run ui-audit` (see `skills/mobile-ui-qa`) |
| Society Admin panel | `SocialPanel/` | ✅ Complete (React + Vite + Tailwind, `SocialPanel/template.html` design). Society staff only — the platform owner is sent to Master Admin |
| **Master Admin (platform owner)** | `Admin_Panel/` | ✅ New — React + Vite + Tailwind, `Admin_Panel/template.html` ("Paces") design, owner email + password sign-in |

## Test evidence (local copy of the current `server.js` + throwaway in-memory database; never production)
| Check | Result |
|---|---|
| Master Admin API check (`Admin_Panel/scripts/api-check.mjs`: owner sign-in, workspace bridge, masking, reveal, members, owner actions, insights, own password) | **100/100** |
| Master Admin E2E (Playwright: society admin refused → owner email + password → members → masked profile → logged reveal → approve → set password → society workspace with reason prompt + cancel path → exit → sign out) | **8/8** |
| Master Admin lint / unit tests / build | 0 problems / 29/29 / OK |
| Master Admin visual QA (12 pages at 1440 px and 390 px, workspace, login) | reviewed (before 2FA removal; login page re-checked by E2E) |
| Society panel API check | **369/369** |
| Society panel E2E | **11/11** |
| Society panel lint / unit tests | 0 problems / 29/29 |
| App API check (incl. resident change password) | **102/102** |
| Secret leak check (`node server.js check-secrets`) | passed (Adda_App, SocialPanel, Admin_Panel) |

## Master Admin — what the owner can do
- **Sign-in:** email + password (two-step sign-in was removed on request). 5 wrong passwords lock the account for 15 minutes.
- **Dashboard:** KPIs, 6-month billed-vs-collected and residents/complaints charts, applications waiting more than 3 days, complaints open more than 14 days, societies with no active admin, and top societies by size, dues and complaints.
- **Society 360°:** open any society's **workspace**, which shows the same screens its admin uses (residents, flats, billing, payments, ledger, complaints, community, bookings, services, listings, reports, staff, settings, audit). Every change asks for a reason. The reason is sent as `X-Action-Reason` and stored in the audit log next to the normal entry. Finance stays append-only: there are reversals and adjustments, never edits.
- **Members directory** across all societies: search by name, mobile, email or flat; filter by society, status and type.
- **Member profile:** memberships with history, flats, staff roles, sessions and devices, complaints, invoices, payments, bookings, notifications and audit trail.
- **Owner actions** on a member, each with a reason: approve, reject, suspend or remove a membership; move to another flat; **set a new password**; sign out everywhere; correct the mobile number; disable or enable the account.
- **Privacy:** phone numbers and emails are masked everywhere on the platform side. "Reveal" needs a reason and is logged as `privacy.reveal`.
- **Existing tools** (moved here from SocialPanel): applications review and approval, societies (suspend/reactivate, add admin, online-payment settings), accounts, listings moderation, content reports, payments monitor, categories, platform notices, settings, audit log.
- **My security:** change password.

## ⚠ Action needed on the live server: one test application was created by mistake
While running the panel E2E tests, Playwright reused an `npm run dev` that was already open on port 5173. That dev server proxies to **adda.skillinnovex.in**, so the first test step submitted **one society application to production**:
- Name: **"E2E Residency …"**
- Representative: `e2e.…@example.com`
- One 1×1 PNG document

Nothing else was written there; the next steps failed at sign-in. After deploying, **reject it** in Master Admin → Applications (reason: "Test application"). This can't happen again: test configs now start their own dev server on ports 5183/5184, pinned to `http://127.0.0.1:3013`, and refuse production URLs.

## Deploy steps
**1. Backend (VPS).** Upload `Backend/server.js`, then:
```bash
cd /home/adda.skillinnovex.in/public_html
sed -i 's/^NODE_ENV=.*/NODE_ENV=production/; s/^OTP_PROVIDER=.*/OTP_PROVIDER=none/' .env
grep -q '^RESIDENT_PASSWORD_LOGIN' .env || echo 'RESIDENT_PASSWORD_LOGIN=true' >> .env
grep -q '^TRUST_PROXY' .env || echo 'TRUST_PROXY=1' >> .env
# Allowed browser origins = where SocialPanel AND Admin_Panel are hosted (comma-separated):
sed -i 's#^CORS_ORIGINS=.*#CORS_ORIGINS=https://<panel-domain>,https://<master-domain>#; s#^PANEL_BASE_URL=.*#PANEL_BASE_URL=https://<panel-domain>#' .env
pm2 restart addaapi --update-env && pm2 save
```
**Owner account:** `node server.js create-super-admin --email <you> --name "<Name>"` (first time, or to reset the password).

**2. SocialPanel** (society admins): `cd SocialPanel && npm ci && npm run build`, then upload `dist/` to the panel domain. Rewrite routes to `/index.html`.

**3. Admin_Panel** (owner only): `cd Admin_Panel && npm ci && npm run build`, then upload `dist/` to a separate, unadvertised domain (e.g. `master.<domain>`), with the same `/index.html` rewrite. The page sends `noindex`. The build points at `https://adda.skillinnovex.in`; add the domain to `CORS_ORIGINS`.

**4. App:** `cd Adda_App && npx expo start` (Expo Go, SDK 58), or `npx eas-cli build -p android --profile preview` for an APK.

## Running the checks locally
```bash
cd Backend && node server.js dev:db                       # terminal 1 (in-memory MongoDB :27027)
PORT=3013 MONGODB_URI="mongodb://127.0.0.1:27027/?replicaSet=rs0" MONGODB_DB_NAME=addaapp_dev \
  RESIDENT_PASSWORD_LOGIN=true LOGIN_RATE_LIMIT=2000 PUBLIC_FORM_RATE_LIMIT=2000 node server.js   # terminal 2
SUPER_ADMIN_PASSWORD=DevAdmin12345 MONGODB_URI=… node server.js create-super-admin --email admin@addaapp.local
cd Admin_Panel && npm run api-check && npm run e2e
cd SocialPanel && npm run api-check && npm run e2e
cd Adda_App && node scripts/api-check.mjs http://127.0.0.1:3013 admin@addaapp.local DevAdmin12345
```

## Not done / limitations
- **Plan phases 3–5 are not built.** These are: platform team roles (owner-only was decided), broadcasts, the unified moderation queue, data export/anonymisation, and system health. A read-only "view as admin" token was also replaced by the reason-logged workspace.
- **Merge duplicate accounts:** not built.
- **SMS OTP and online payment:** skipped by decision. Phone numbers from password sign-up are unverified; the profile shows "Mobile not OTP-verified".
- **Push notifications:** need an EAS build and FCM credentials.
- **Live end-to-end run:** blocked until this backend build is deployed.
