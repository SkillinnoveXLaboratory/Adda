---
name: production-deployment
description: Use when preparing, executing, or verifying a deployment of Backend/ (Node 22 API + jobs) or SocialPanel/ (Vite static build) to staging or production, configuring environment variables and secrets, MongoDB Atlas production settings, monitoring, backups, or rollback.
---

# Production Deployment

## Purpose and scope
Safe, repeatable releases of the API and admin web portal. Mobile APK release is covered in
`android-apk-release`. Hosting provider may vary (Render/Railway/VPS + Nginx/container); standards are
provider-neutral.

## Environments
| Env | API | DB | Payments | OTP |
|---|---|---|---|---|
| development | localhost | local replica set or Atlas dev cluster | test-mode or disabled | test provider |
| staging | https://staging-api.<domain> | separate Atlas project/cluster | Razorpay test mode | real provider, limited |
| production | https://api.<domain> | Atlas production cluster | Razorpay live | real provider |
- Never share databases or secrets across environments.

## Backend standards
- Runtime Node 22 LTS; `npm ci --omit=dev`; start with `node src/server.js` (no nodemon). `NODE_ENV=production`.
- Config validated at boot by `config/env.js`; deploy fails fast on missing required vars. Payments optional
  (missing Razorpay vars -> payments disabled, logged once at warn).
- Startup guards: refuse test OTP provider in production; refuse weak JWT secrets (< 32 bytes); refuse
  `CORS_ORIGINS` containing `*`.
- TLS terminated at proxy/platform; HSTS via helmet; `trust proxy` set to the actual hop count.
- Health checks: platform liveness -> `/health`; readiness/traffic gating -> `/ready`.
- Graceful shutdown on SIGTERM (drain, stop scheduler, release locks, close Mongo).
- Jobs: run in API process with Mongo job locks (safe for multiple instances) or a dedicated worker process with
  the same lock mechanism. Lock keys unique per job run.
- Logs: pino JSON to stdout, collected by platform; redaction verified; retention per policy.
- Indexes: built via `npm run db:sync-indexes` (explicit step), `autoIndex: false` in prod.
- Migrations: run as a one-off release step before switching traffic; idempotent with dry run.

## Secrets management
- Stored in platform secret store / environment, never in repo, Docker image, or client bundles.
- Required secrets (names only): `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_PROVIDER_*`,
  `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `EXPO_ACCESS_TOKEN` (if used for push).
- Generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
- Rotation plan documented; rotating JWT secrets uses `kid` dual-key verification window.

## MongoDB Atlas (production)
- Dedicated database user with least privilege (readWrite on app DB only); strong generated password.
- Network Access: only hosting provider egress IPs (no `0.0.0.0/0` unless provider IPs are dynamic and the risk is
  accepted and documented; then rely on strong credentials + TLS).
- Backups: continuous/cloud backup enabled; test restore quarterly to a scratch cluster.
- Alerts: connections, replication lag, disk, slow queries.

## SocialPanel standards
- `VITE_API_URL` set at build time; `npm ci && npm run build` -> `dist/` served by static host/CDN.
- SPA fallback to `index.html` for client routes; long cache for hashed assets, no-cache for `index.html`.
- Security headers: CSP (allow API origin), `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- Admin portal origin added to API `CORS_ORIGINS`.

## Razorpay production
- Live keys only in production secret store. Webhook URL `https://api.<domain>/api/v1/payments/webhook/razorpay`
  with live webhook secret; subscribe to `payment.captured`, `payment.failed`, `order.paid`, `refund.*`.
- After go-live, run a small real payment and verify ledger + receipt, then refund it.

## Release procedure
1. Merge to main with green CI (lint, tests, build for all packages).
2. Tag release `vX.Y.Z`; changelog.
3. Deploy to staging; run smoke tests.
4. Backup/snapshot verification for prod DB; run migrations (dry run, then real).
5. Deploy to production (rolling/blue-green); watch `/ready`, error rate, latency for 30 min.
6. Run production smoke tests.

## Smoke tests
```bash
curl -fsS https://api.<domain>/health
curl -fsS https://api.<domain>/ready
curl -fsS https://api.<domain>/api/v1/public/config        # payments.gatewayConfigured flag as expected
curl -s -o /dev/null -w "%{http_code}" -X POST https://api.<domain>/api/v1/payments/webhook/razorpay \
  -H "Content-Type: application/json" -d '{}'       # expect 400 (bad signature), never 500
```
- Manual: admin login on SocialPanel, resident OTP login on latest APK, view bills, test push.

## Implementation checklist
- [ ] CI green for Backend, SocialPanel, AddaApp
- [ ] Env vars set and validated; `.env.example` matches
- [ ] Startup guards active (test OTP, weak secrets, wildcard CORS)
- [ ] Atlas allowlist, least-privilege user, backups on
- [ ] Indexes synced; migrations run with backup
- [ ] Health/readiness wired to platform
- [ ] Razorpay webhook configured for the environment
- [ ] Monitoring/alerts on 5xx rate, latency, `/ready` failures, job failures
- [ ] Rollback plan confirmed

## Observability
- Track: request rate, p95 latency per route, 5xx rate, 401/403 spikes (attack signal), OTP send volume
  (cost/abuse), webhook failures, `needs_review` payments, job run outcomes, Atlas connections.
- Alert thresholds (starting point): 5xx > 2% for 5 min; `/ready` failing > 1 min; any webhook processing failure;
  billing job not completed by 06:00 IST on the 1st.
- Uptime check from outside the platform hitting `/health` every minute.

## Rollback
- Application: redeploy previous tag (keep last 3 builds). Migrations must be backward compatible
  (expand -> migrate -> contract) so the previous version runs on the new schema.
- Data: restore from Atlas point-in-time only for data corruption incidents, with stakeholder approval.
- Payments: if webhook processing broken, keep endpoint returning 5xx so Razorpay retries, fix, then run
  reconciliation job.

## Common failure modes and recovery
| Symptom | Recovery |
|---|---|
| Boot crash: config validation | Read error listing missing var; set it in secret store; redeploy |
| `/ready` 503 after deploy | Atlas allowlist missing new egress IP / wrong URI; fix and restart |
| All users logged out | JWT secret changed; restore previous secret or use dual-key window |
| Rate limiter treats all users as one | Set `trust proxy` hop count correctly |
| Duplicate job runs with 2 instances | Verify JobLock unique index exists in prod (`db:sync-indexes`) |
| Admin panel blank on refresh of deep route | Configure SPA fallback rewrite |
| Webhooks 400 in prod | Wrong live webhook secret or body altered by proxy; verify raw body path |

## Definition of done
- Production smoke tests pass; dashboards show normal error rate for 30 min.
- Release tagged, changelog written, rollback target known.
- No secrets in repo/images; config documented.
