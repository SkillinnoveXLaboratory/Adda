# AddaApp Backend

Express 5 + Mongoose 9 REST API shared by the AddaApp Android app (residents) and SocialPanel (Society Admins and the Super Admin). The API contract is in [API.md](API.md).

## Quick start (local, no Atlas needed)
```bash
npm install
cp .env.example .env          # then fill in secrets (see table below)
npm run dev:db                # terminal 1: in-memory MongoDB replica set on :27027 (data is discarded)
MONGODB_URI="mongodb://127.0.0.1:27027/?replicaSet=rs0" npm run db:init        # indexes + default categories
MONGODB_URI="mongodb://127.0.0.1:27027/?replicaSet=rs0" npm run dev            # API on :3013
MONGODB_URI="mongodb://127.0.0.1:27027/?replicaSet=rs0" npm run create-super-admin -- --email you@example.com --name "You"
```
PowerShell: `$env:MONGODB_URI="mongodb://127.0.0.1:27027/?replicaSet=rs0"; npm run dev`.

## Scripts
| Script | Purpose |
|---|---|
| `npm start` / `npm run dev` | Start the API (dev uses `--watch`) |
| `npm run dev:db` | Local throwaway MongoDB (dev only) |
| `npm run db:init` | Sync indexes, insert default complaint/service/marketplace categories **only if none exist**. Creates no users or records. |
| `npm run create-super-admin -- --email E --name N` | Server-side Super Admin bootstrap. Password from `SUPER_ADMIN_PASSWORD` or a hidden prompt. No default password; re-running resets the password and revokes sessions. |
| `npm run check-secrets` | Fails if backend secrets leak into `AddaApp/` or `SocialPanel/` |

## Environment
| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` in prod (disables test OTP, auto-indexing) |
| `PORT` | – | default 3013 |
| `MONGODB_URI` | yes | Atlas SRV string. Backend only. `Mongo_URI` is accepted as a legacy alias. |
| `MONGODB_DB_NAME` | – | default `addaapp` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | yes | ≥32 random chars each, different |
| `OTP_HASH_SECRET` | recommended | HMAC key for OTP hashes |
| `CORS_ORIGINS` | no longer used | Removed 2026-11-04: the API accepts browser requests from any origin (bearer-token auth, no cookies). |
| `PUBLIC_API_BASE_URL` | yes | Public HTTPS URL of this API (media links) |
| `PANEL_BASE_URL` | yes | SocialPanel URL (password-setup links) |
| `TRUST_PROXY` | prod | `1` behind nginx/LB so rate limits see real client IPs |
| `OTP_PROVIDER` | yes | `msg91` / `twilio` in prod; `test` only for dev (needs `OTP_TEST_MODE=true`); `none` = OTP sign-in reports unavailable |
| `OTP_PROVIDER_API_KEY`, `MSG91_TEMPLATE_ID` / `TWILIO_ACCOUNT_SID`, `TWILIO_FROM_NUMBER` | with provider | |
| `PAYMENT_PROVIDER`, `RAZORPAY_KEY_ID`, `PAYMENT_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET` | for online pay | Without them online payment returns 503 `PAYMENTS_UNAVAILABLE` |
| `STORAGE_LOCAL_DIR`, `STORAGE_SECRET`, `MAX_UPLOAD_MB` | – | Local disk storage; mount a persistent volume |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | optional | Emails setup/reset links; without SMTP the panel shows one-time links to share manually |
| `EXPO_ACCESS_TOKEN` | optional | Expo push security |
| `JOBS_ENABLED` | – | Scheduler on/off |

## Architecture
```
server.js                 boot, graceful shutdown
src/config                env (zod), logger (pino + redaction), db
src/models                33 schemas (identity, society, community, marketplace, services, finance, system)
src/middleware            auth (JWT + live session check, tenant guards, staff permissions), validation, rate limits, errors
src/controllers           auth, public, resident, listings, society, finance, platform
src/services              auth/OTP, billing, payments (Razorpay), ledger, reports (PDF/XLSX), booking, storage, notifications, audit, mail
src/jobs/scheduler.js     auto-billing, reminders, late fees, poll closing — Mongo JobLock = exactly-once
tests/                    node:test + supertest + mongodb-memory-server
```

### Security model
- **Tenant isolation:** society scope comes from the caller's approved `SocietyMembership` (residents) or active `SocietyStaff` row (admins). `X-Society-Id` only *selects* among the caller's own societies. All society queries filter by that id, so another society's ids return 404.
- **Roles:** `platformRole` is never writable through the API (`PATCH /me` is strict). Super Admins exist only via the CLI. Panel-only routes reject mobile sessions.
- **Sessions:** each request re-checks session revocation and account status, so logout, disable and password change take effect immediately.
- **Money:** integer paise; invoice, payment, receipt and ledger writes happen in one MongoDB transaction; `eventKey` uniqueness makes ledger postings idempotent. The ledger and audit log are immutable at the model layer.
- **Uploads:** magic-byte type checks (JPG/PNG/WEBP/PDF), size limit, random storage keys. Private files are served only via HMAC-signed, expiring URLs.

### Payments & settlement strategy
1. Online collection needs **both** server keys (`RAZORPAY_*`) and per-society enablement by the Super Admin (`PATCH /platform/societies/:id/payments`).
2. Settlement modes:
   - **`razorpay_route` (recommended for a multi-society platform).** The platform Razorpay account onboards each society as a Route *linked account* after KYC/bank verification. Orders carry a `transfers[]` entry to that `acc_…` id, so funds settle to the society's bank account.
   - **`society_merchant`.** The society uses its own merchant account. This needs per-society keys, which are not yet supported; use only when the platform account *is* that society's account.
   - **`none`.** Online collection stays off and residents pay at the office (recorded as offline payments).
3. A single merchant account must **not** be used to collect for many societies without Route. Funds would settle to the platform, and that requires legal and accounting arrangements outside this software.
4. Paid status is set only after the server verifies with the gateway (fetching the payment and checking amount and order) or after a signed webhook arrives. The client callback alone is never enough. Configure the Razorpay webhook to `POST https://<api>/api/v1/payments/webhook/razorpay` with events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`.

## Deployment
1. Provision Node 22 LTS behind nginx/Caddy with HTTPS. Set `TRUST_PROXY=1`.
2. **MongoDB Atlas:** add the server's egress IP under *Network Access*, use a least-privilege DB user (readWrite on `addaapp`), enable backups, and confirm with `mongosh "<uri>" --eval "db.runCommand({ping:1})"`.
3. `npm ci --omit=dev`, create `.env` with `NODE_ENV=production`, then run `npm run db:init`.
4. Run under a supervisor (systemd or pm2), for example `pm2 start server.js --name addaapp-api`. Graceful shutdown handles SIGTERM.
5. Health checks: `GET /health` (liveness) and `GET /ready` (DB connectivity, returns 503 when down).
6. `npm run create-super-admin -- --email ops@yourdomain --name "Ops"` on the server.
7. Persist the `uploads/` directory on a volume and back it up with the database.
8. Reverse proxy: `client_max_body_size 10m;`; proxy `/api`, `/media`, `/health` and `/ready`.

**Live VPS (adda.skillinnovex.in, OpenLiteSpeed):** the vhost in `vhost.txt` proxies the domain to `127.0.0.1:3015`. On the server, copy `docs/backend/production.env.example` to `Backend/.env` and fill it in, then run `npm ci --omit=dev && npm run db:init && pm2 start server.js --name addaapp-api && pm2 save`. After that, verify with `curl https://adda.skillinnovex.in/health`.

nginx sketch:
```nginx
server {
  listen 443 ssl http2; server_name api.example.com;
  client_max_body_size 10m;
  location / { proxy_pass http://127.0.0.1:3013; proxy_set_header Host $host;
               proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
}
```

## End-to-end verification checklist
1. Install dependencies.
2. Configure `.env`.
3. Verify MongoDB connectivity with `npm run db:init`.
4. `npm start`.
5. `curl https://api…/health` and `curl https://api…/ready`.
6. Run `create-super-admin`.
7. Deploy SocialPanel with `VITE_API_BASE_URL`.
8. No CORS setup needed: the API accepts any origin.
9. Submit a society registration from the panel.
10. Approve it as Super Admin and share the setup link.
11. Set the admin password, log in, add buildings and flats.
12. Resident: install the APK, sign in with OTP, request to join; admin approves.
13. Configure charges and generate invoices for a period.
14. Record an offline payment, check the receipt, ledger and reports. After Razorpay setup, test an online payment in test mode, then the webhook.
15. Raise a complaint and walk it through assign → resolve; post a property listing and approve it.
16. Download the PDF and XLSX reports.
17. Build the APK with `EXPO_PUBLIC_API_URL=https://api…`.
18. Test on a physical Android device.

## Backups & operations
- Use Atlas continuous backup (or daily `mongodump`) together with an `uploads/` snapshot. Test restores quarterly.
- Rotate the JWT secrets. Doing so forces every user to sign in again, so plan the timing.
- Logs are JSON (pino) with authorization headers, OTPs, passwords, tokens and signed-URL signatures redacted.
