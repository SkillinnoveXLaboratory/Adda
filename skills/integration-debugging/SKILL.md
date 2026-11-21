---
name: integration-debugging
description: Use when something fails across component boundaries - AddaApp or SocialPanel cannot reach the API, Atlas connection errors, CORS, auth/token errors, OTP delivery, Razorpay checkout/webhook problems, push notifications not arriving, or reports/jobs misbehaving. Provides a systematic triage method and known fixes for this stack on Windows dev machines.
---

# Integration Debugging

## Purpose and scope
A repeatable way to localize and fix failures between AddaApp (Expo/Android), SocialPanel (Vite), Backend
(Express 5/Mongoose 9), MongoDB Atlas, Razorpay, OTP provider, and Expo push. Dev environment is Windows 11
(PowerShell + Git Bash), Android SDK at `%LOCALAPPDATA%\Android\Sdk`, Java 21.

## Triage method
1. **Reproduce** with the smallest client: `curl` the API before blaming the app.
2. **Localize the hop**: client -> network -> API middleware -> service -> DB/3rd party. Check each in order.
3. **Correlate** using `X-Request-Id`: the client logs it from the error envelope; grep pino logs by `requestId`.
4. **Compare environments**: config diff (`EXPO_PUBLIC_API_URL`, `CORS_ORIGINS`, `NODE_ENV`, provider vars).
5. **Fix + regression test** in the layer where the bug lives; document notable cases here.

## Quick probes
```bash
curl -i http://localhost:3013/health
curl -i http://localhost:3013/ready
curl -i -X POST http://localhost:3013/api/v1/auth/otp/request -H "Content-Type: application/json" -d '{"phone":"9999999999"}'
curl -i -H "Origin: http://localhost:5173" -X OPTIONS http://localhost:3013/api/v1/me   # CORS preflight
adb devices
adb reverse tcp:3013 tcp:3013         # device/emulator localhost:3013 -> PC:3013 (USB/emulator)
adb logcat *:E ReactNativeJS:V        # JS + native errors
npx expo start -c                     # clear Metro cache
```
PowerShell equivalents: `Invoke-WebRequest http://localhost:3013/health`, `Get-NetTCPConnection -LocalPort 3013`
(port in use), `Test-NetConnection cluster0.xxxxx.mongodb.net -Port 27017`.

## Known issues and fixes

### Mobile -> API connectivity
- Android emulator: `localhost` is the emulator. Use `http://10.0.2.2:<port>` or `adb reverse tcp:<port> tcp:<port>`
  and keep `localhost`.
- Physical device: PC LAN IP (`ipconfig` -> IPv4), same Wi-Fi, server bound to `0.0.0.0`, Windows Defender Firewall
  inbound rule for the port (Private network). Or HTTPS tunnel (cloudflared/ngrok) to the API.
- Release/preview APK: cleartext HTTP blocked -> HTTPS API URL required.
- `EXPO_PUBLIC_*` is inlined at bundle time: after changing, restart Metro with `-c` or rebuild the APK.

### Metro / Expo
- Stale bundle or resolution errors: `npx expo start -c`; then delete `node_modules`, `.expo`, `npm ci`.
- "Cannot find native module": running in Expo Go a module not supported - use dev build.
- Port 8081 busy: `npx expo start --port 8082` or kill stale node process.

### CORS (SocialPanel)
- Browser error but curl works -> CORS. Origin must exactly match an entry in `CORS_ORIGINS` (scheme, host, port,
  no trailing slash). Credentials require explicit origin (not `*`) and `credentials: true`.
- Prefer Vite dev proxy (`server.proxy['/api'] -> http://localhost:3013`) in development.

### MongoDB Atlas
- `MongoServerSelectionError` / timeouts: current public IP not in Atlas Network Access allowlist -> add IP
  (for dynamic hosts, the provider's egress IPs or, temporarily, documented risk acceptance). Check with
  `Test-NetConnection <shard-host> -Port 27017`.
- `querySrv ENOTFOUND/ECONNREFUSED` for `mongodb+srv`: DNS blocks SRV lookups -> switch DNS (e.g. 1.1.1.1/8.8.8.8)
  or use the standard (non-SRV) connection string from Atlas.
- `bad auth`: wrong user/password or unencoded special characters -> URL-encode password.
- Transactions failing locally: local mongod is standalone -> use replica set.

### Auth
- 401 `TOKEN_EXPIRED` immediately after login: clock skew -> sync time (Windows: `w32tm /resync`; emulator: cold boot),
  server `clockTolerance: 30`.
- Logout loops: two parallel refreshes triggered reuse detection -> single-flight refresh in client.
- 403 on admin panel: user lacks AdminAssignment for selected society -> check DB, not the JWT.

### OTP
- Dev: confirm `OTP_PROVIDER=test` only when `NODE_ENV!=production`; prod boot fails by design if misconfigured.
- Prod SMS not delivered: provider dashboard delivery report, DLT template/sender ID (India), number format E.164.
- 429 on resend: cooldown working as intended; UI should show countdown.

### Razorpay
- Checkout fails to open in app: missing/incorrect key id, or payments disabled (`invoice.onlinePayment.available === false` or 503 PAYMENTS_UNAVAILABLE).
- `/payments/verify` signature mismatch: using webhook secret instead of key secret, or wrong concatenation
  order (`order_id|payment_id`).
- Webhook signature mismatch: JSON parser ran before raw parser; ensure webhook route uses `express.raw` and is
  registered first. Proxy must not alter body.
- Webhook not received locally: expose with HTTPS tunnel and set the URL in Razorpay test-mode dashboard; check
  dashboard delivery logs.
- Duplicate webhook deliveries: expected; verify `WebhookEvent` unique eventId returns 200 without reprocessing.

### Push notifications
- Token null: emulator without Google Play services or permission denied; missing `projectId`.
- Delivered by Expo but not shown: Android channel missing or app in foreground without handler
  (`Notifications.setNotificationHandler`).
- `DeviceNotRegistered` in push receipts: delete token server-side.
- Android FCM credentials must be configured in EAS for standalone builds (`eas credentials`).

### Jobs
- Billing ran twice: missing/expired job lock or lock key lacking period -> inspect `JobLock` collection.
- Job never runs after restart: stale lock with long `expiresAt` -> lease TTL + heartbeat; manual delete only after
  confirming no instance holds it.

### Reports
- Garbled rupee symbol in PDF: pdfkit default fonts lack `₹` -> register a bundled TTF (e.g. Noto Sans) with
  `doc.registerFont`.
- Excel opens with numbers as text: write numeric cells (rupees as number with `numFmt '₹#,##0.00'`), not strings.
- Mobile cannot open downloaded PDF: save with `expo-file-system` and share/open via intent; check MIME type
  `application/pdf` and `Content-Disposition` header.

## Implementation checklist (for any fix)
- [ ] Reproduced with curl or a failing test
- [ ] Root cause identified at a specific hop, with requestId/log evidence
- [ ] Fix applied in the correct layer (not a client workaround for a server bug)
- [ ] Regression test added
- [ ] Config/doc updated (`.env.example`, this skill if a new pattern)

## Required tests
```bash
cd Backend && npx vitest run tests/integration      # reproduce server-side bugs
cd AddaApp && npx jest src/api                       # client networking/refresh logic
cd SocialPanel && npx vitest run
```
- Webhook raw-body test: send a signed raw body via supertest `.set('Content-Type','application/json').send(rawString)`
  and assert 200; re-send -> 200 and no duplicate ledger entry.

## Definition of done
- Root cause documented in PR description (symptom, hop, cause, fix).
- Regression test passes; no new warnings in logs.
- Verified on the original failing environment (emulator/device/browser/staging).
