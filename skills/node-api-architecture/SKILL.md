---
name: node-api-architecture
description: Use when adding or changing any endpoint, middleware, service, adapter, or job in Backend/ (Node 22, Express 5, Mongoose 9, zod, pino). Defines layering, routing under /api/v1, validation, error envelope, security middleware, logging, health/readiness, and config conventions.
---

# Node API Architecture (Backend)

## Purpose and scope
Standards for `Backend/`: Node 22, Express 5, Mongoose 9 on MongoDB Atlas, zod, helmet, CORS allowlist,
express-rate-limit, pino. API mounted at `/api/v1`; liveness `/health`, readiness `/ready`. Related skills:
`mongodb-data-integrity`, `authentication-authorization`, `multi-tenant-society-security`,
`payment-accounting-auditing`.

## Layering
```
Backend/src/
  server.js            # starts HTTP, graceful shutdown (SIGTERM/SIGINT)
  app.js               # builds express app (exported for supertest; no listen here)
  config/env.js        # zod-parsed process.env, fails fast on invalid config
  routes/v1/<domain>.routes.js
  controllers/<domain>.controller.js   # HTTP only: parse, call service, shape response
  services/<domain>.service.js         # business logic, transactions, authorization of data
  models/<Model>.js                    # Mongoose schemas + indexes
  validators/<domain>.schemas.js       # zod schemas for body/query/params
  middleware/ auth.js, requireRole.js, societyContext.js, validate.js, errorHandler.js, requestId.js
  services/ otp/providers.js, payments/razorpay.js + payment.service.js, notification.service.js (Expo push), storage.service.js
  jobs/ scheduler.js, lock.js, <job>.job.js
  reports/ pdf/, excel/
  utils/ AppError.js, money.js, pagination.js
```
- Controllers never import Mongoose models directly; services do.
- Adapters wrap third-party SDKs behind an interface so tests can inject fakes.

## Standards

### Express 5 specifics
- Async handlers may throw/reject; Express 5 forwards rejections to the error handler. Do not wrap in
  try/catch just to call `next(err)`.
- Path syntax changed (path-to-regexp v8): wildcard must be named (`/*splat`), optional segments use braces
  (`/:file{.:ext}`). No regex strings in paths.
- `req.query` is a getter (read-only); put validated values on `req.validated.query`, do not reassign.
- `req.body` is `undefined` when no body parser matched; validators must handle that.

### Middleware order (app.js)
1. `requestId` (uses `X-Request-Id` or generates UUID) + `pino-http`
2. `helmet()`
3. `cors({ origin: allowlistFn, credentials: true })` - allowlist from `CORS_ORIGINS` (comma-separated); reject unknown
4. Razorpay webhook route with `express.raw({ type: 'application/json' })` BEFORE `express.json`
5. `express.json({ limit: '1mb' })`
6. Global rate limit; stricter limiter on `/api/v1/auth/*` (OTP send/verify)
7. `/health`, `/ready`, then `/api/v1` router
8. 404 handler, then central `errorHandler`
- `app.set('trust proxy', 1)` when behind one proxy (Render/Railway/Nginx) so rate limit uses client IP.

### Validation
- Every route declares zod schemas for `params`, `query`, `body` via `validate({ body, query, params })`.
- Use `.strict()` on body objects to reject unknown keys (prevents mass assignment of `societyId`, `role`, `status`).
- ObjectIds validated with a shared `objectId` zod refinement. Money input as integer paise (`z.number().int().positive()`).

### Response and error envelope
- Success: `{ data, meta? }` (meta for pagination `{ nextCursor, limit }`).
- Error: `{ error: { code, message, details?, requestId } }` with stable `code` strings
  (`VALIDATION_ERROR`, `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
  `RATE_LIMITED`, `PAYMENTS_UNAVAILABLE`, `INTERNAL`).
- `AppError(status, code, message, details)`; unknown errors -> 500 `INTERNAL` with no stack in body.
- Map Mongoose `CastError` -> 400, duplicate key `11000` -> 409 `CONFLICT`, zod -> 400 with field details.

### Logging
- pino with `redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.otp', '*.refreshToken',
  '*.token', '*.razorpay_signature', 'req.body.phone']` (mask phone in logs).
- Log level from `LOG_LEVEL`; JSON in production, `pino-pretty` only in dev.
- Include `requestId`, `userId`, `societyId` in child loggers. Never log full request bodies of auth/payment routes.

### Health
- `/health`: process up, returns 200 `{ status: 'ok' }`, no DB call.
- `/ready`: 200 only when `mongoose.connection.readyState === 1` (and optional ping); else 503.

### Config
- `config/env.js` validates: `NODE_ENV`, `PORT`, `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `CORS_ORIGINS`, `OTP_PROVIDER`, optional `RAZORPAY_KEY_ID`,
  `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Missing optional payment vars -> payments disabled, not crash.
- `.env.example` lists every key with placeholder values; real `.env` never committed.

### Graceful shutdown
- On SIGTERM: stop accepting connections, stop job scheduler, release job locks, close Mongo, exit within 10 s.

## Implementation checklist
- [ ] Route under `/api/v1/<domain>` with zod validation for params/query/body
- [ ] Auth + role + society context middleware applied as needed
- [ ] Controller thin; logic in service; models only in services
- [ ] Errors use `AppError` with stable code
- [ ] Sensitive fields redacted in logs; none returned in responses (`select: false` for hashes)
- [ ] Pagination with limit cap (max 100)
- [ ] Rate limits for abuse-prone endpoints
- [ ] `.env.example` updated for new config
- [ ] Integration tests added (see `automated-testing`)

## Required tests
```bash
cd Backend
npm test                       # node --test or vitest run, with mongodb-memory-server
npx vitest run tests/integration/health.test.js
npm run lint
```
- For each endpoint: 2xx happy path, 400 validation (unknown key rejected), 401 without token,
  403 wrong role/other society, 404 non-existent id.
- `/health` 200 always; `/ready` 503 when DB disconnected.
- Error handler never returns stack traces when `NODE_ENV=production`.

## Common failure modes and recovery
| Symptom | Cause | Recovery |
|---|---|---|
| `TypeError: Missing parameter name` at startup | Express 4 wildcard syntax (`*`) under Express 5 | Use `/*splat` or `{/*splat}` |
| `Cannot set property query` | Assigning `req.query` in Express 5 | Store parsed values on `req.validated` |
| CORS error in browser only | Origin not in allowlist / trailing slash mismatch | Add exact origin (scheme+host+port) to `CORS_ORIGINS` |
| Rate limiter blocks all users | `trust proxy` unset; all requests share proxy IP | Set `trust proxy` correctly for the hosting hop count |
| `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` warning | Same as above | Configure `trust proxy` |
| `/ready` 503 in prod | Atlas unreachable (IP allowlist/DNS SRV) | See `integration-debugging` |
| Webhook signature always invalid | `express.json` consumed body before raw parser | Mount webhook raw route before JSON parser |
| Process hangs on deploy | No graceful shutdown | Implement SIGTERM handler with timeout |

## Definition of done
- Endpoint validated, authorized, society-scoped, documented (route list or OpenAPI snippet).
- Tests cover success and all error classes; `npm test` and lint pass.
- No secrets/PII in logs; error responses follow the envelope.
- Config documented in `.env.example`; app boots with payments disabled when Razorpay vars absent.
