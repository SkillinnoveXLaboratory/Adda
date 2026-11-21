---
name: authentication-authorization
description: Use when implementing or changing login, OTP, JWT access/refresh tokens, session rotation, logout, admin password auth, role checks, or protected routes in Backend/, AddaApp/, or SocialPanel/. Defines the token model, OTP rules, refresh rotation with reuse detection, RBAC roles, and client storage rules.
---

# Authentication and Authorization

## Purpose and scope
One consistent identity model across the resident app (OTP login), SocialPanel (Society Admin / Super Admin
login with bcrypt passwords, optionally OTP as second factor), and the API. Tenant isolation details live in
`multi-tenant-society-security`; this skill covers identity, sessions, and roles.

## Roles
- `resident` (owner/tenant/family) - via Membership in a society+flat; status must be `active`.
- `society_admin` - via AdminAssignment `{ userId, societyId, role: 'society_admin', active }`.
- `super_admin` - platform-wide flag on User (`platformRole: 'super_admin'`), assigned only via script/DB, never via API self-service.
- Roles are evaluated server-side from DB on every request needing them (or from short-lived access token claims
  that are re-validated when sensitive); never trust a role sent by the client.

## Token model
- Access token: JWT HS256 (or RS256 if keys managed), signed with `JWT_ACCESS_SECRET`, TTL 15 min.
  Claims: `sub` (userId), `sid` (sessionId), `typ: 'access'`, `iat`, `exp`, `iss: 'adda-api'`, `aud: 'adda-clients'`.
  No PII, no societyId authority (society context resolved server-side).
- Refresh token: opaque random 32+ bytes (`crypto.randomBytes(32).toString('base64url')`), TTL 30 days (resident),
  7 days (admins). Stored only as SHA-256 hash in `UserSession { userId, tokenHash, familyId, userAgent, ip,
  expiresAt, revokedAt, replacedBy }`.
- Rotation: `POST /api/v1/auth/refresh` - look up hash; if valid, revoke it, issue new refresh in same `familyId`,
  set `replacedBy`. If a revoked token is presented (reuse) -> revoke the entire family and return 401
  `SESSION_REVOKED`.
- Verify with `jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience, clockTolerance: 30 })`.
  Always pin `algorithms`.
- Separate secrets for access and refresh/other purposes; >= 32 random bytes each; never committed.

## OTP rules (resident login)
- `POST /auth/otp/send { phone }` -> creates `OtpChallenge { phone, otpHash, expiresAt (5 min), attempts, sentAt }`.
- OTP 6 digits from `crypto.randomInt`, stored hashed (HMAC-SHA256 with server secret or bcrypt), never logged.
- Max verify attempts 5 per challenge -> challenge locked; resend cooldown 30-60 s; max sends per phone per hour (e.g. 5)
  and per IP rate limit.
- Response identical whether phone exists or not (no user enumeration).
- Verify compares with `crypto.timingSafeEqual` on hashes; on success delete/consume the challenge (single use).
- Provider via adapter (`src/services/otp/providers.js`). Test provider (fixed/logged OTP) MUST throw at startup
  if `NODE_ENV === 'production'`.

## Admin password rules (SocialPanel)
- bcrypt cost 12; min length 10; check against common-password list; `passwordHash` `select: false`.
- Login rate limit per IP + per account; lockout/backoff after 10 failures; generic "Invalid credentials".
- Password change/reset revokes all other sessions.

## Authorization middleware
- `authenticate` - verify access token, load session (not revoked) when route is sensitive, set `req.auth = { userId, sessionId }`.
- `requireRole('super_admin' | 'society_admin' | 'resident')` - checks DB-backed assignments.
- `societyContext` - resolves and sets `req.society` (see tenancy skill).
- Deny by default: routers mount `authenticate` at router level; public routes explicitly listed
  (`/auth/otp/send`, `/auth/otp/verify`, `/auth/admin/login`, `/auth/refresh`, webhook, health).

## Client rules
- AddaApp: refresh token in `expo-secure-store`; access token in memory.
- SocialPanel: prefer refresh token in `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth`, access
  token in memory. If cookie not feasible across domains, store refresh in memory + re-login; never localStorage
  for refresh tokens. Protected routes in React Router check role from `/auth/me`, but UI gating is cosmetic -
  the API enforces.
- Both clients: single-flight refresh, one retry, then sign out.

## Endpoint contract (reference)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/otp/send` | public, strict rate limit | `{ phone }` -> `202 { data: { resendAfterSec } }` |
| POST | `/api/v1/auth/otp/verify` | public, strict rate limit | `{ phone, otp, deviceName? }` -> `{ accessToken, refreshToken, user }` |
| POST | `/api/v1/auth/admin/login` | public, strict rate limit | `{ email, password }` -> tokens (cookie for refresh on web) |
| POST | `/api/v1/auth/refresh` | refresh token | rotates; returns new pair |
| POST | `/api/v1/auth/logout` | access token | revokes current session |
| POST | `/api/v1/auth/logout-all` | access token | revokes all sessions of user |
| GET | `/api/v1/me` | access token | user + memberships + admin assignments (server-derived) |
- Error codes: `OTP_INVALID`, `OTP_EXPIRED`, `OTP_LOCKED`, `RATE_LIMITED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`,
  `SESSION_REVOKED`, `INVALID_CREDENTIALS`, `FORBIDDEN`.

## Session lifecycle events (must revoke sessions)
- Logout / logout-all; admin password change or reset; user deactivated by Super Admin.
- Membership removal does not need session revocation (tenancy checks are DB-backed per request), but
  AdminAssignment removal should invalidate cached admin context immediately.
- Session TTL index removes expired `UserSession` documents; revoked sessions kept until expiry for reuse detection.

## Implementation checklist
- [ ] Access JWT verified with pinned algorithm, issuer, audience, `clockTolerance: 30`
- [ ] Refresh tokens hashed, rotated, reuse detection revokes family
- [ ] Logout revokes current session; "logout all devices" revokes all
- [ ] OTP hashed, expiring, attempt-limited, resend cooldown, rate limited, no enumeration
- [ ] Test OTP provider refused in production
- [ ] Admin passwords bcrypt(12), lockout/backoff, generic errors
- [ ] Role checks DB-backed; super_admin not grantable via API
- [ ] No tokens/OTPs/passwords in logs (pino redact)
- [ ] Secrets from env only, validated at boot

## Required tests
```bash
cd Backend
npx vitest run tests/integration/auth.test.js
npx vitest run tests/unit/otp.service.test.js
```
- OTP: correct code -> tokens; wrong code 5x -> locked; expired -> 400 `OTP_EXPIRED`; resend within cooldown -> 429;
  same response for unknown phone.
- Test provider: booting app with `NODE_ENV=production OTP_PROVIDER=test` throws.
- Refresh: rotation returns new token; old token reuse -> 401 and whole family revoked.
- Access token expired -> 401 `TOKEN_EXPIRED`; token with `alg: none` or wrong secret -> 401.
- Role: resident calling admin endpoint -> 403; society_admin calling super-admin endpoint -> 403.
- Use fake timers or injected clock for expiry tests rather than real sleeps.

## Common failure modes and recovery
| Symptom | Cause | Recovery |
|---|---|---|
| Fresh tokens rejected as "not yet valid"/expired | Clock skew between server and client/other instance | Sync NTP on hosts; `clockTolerance: 30`; never validate `exp` on client clock for decisions |
| Users randomly logged out | Concurrent refresh calls rotate twice -> reuse detection | Single-flight refresh on clients; optional 10-20 s grace for the immediately-replaced token |
| All sessions invalid after deploy | Secret changed / differs between instances | Same secrets on all instances; plan rotation with dual-key verify (`kid`) |
| OTP never arrives | Provider credentials/DLT template (India) misconfigured | Check provider logs; verify sender ID/template; fall back to support flow |
| Test OTP accepted in prod | Env misconfig | Startup guard must throw; add deploy smoke check |
| CORS error on refresh cookie | `credentials` not enabled or origin not allowlisted | `cors({ credentials: true })`, exact origin, `fetch(..., { credentials: 'include' })` |

## Definition of done
- All auth flows covered by integration tests, including negative and abuse cases.
- No secret, OTP, password, or token appears in logs or responses beyond intended fields.
- Refresh rotation and revocation verified; logout works on both clients.
- RBAC enforced server-side for every non-public route.
