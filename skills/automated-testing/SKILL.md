---
name: automated-testing
description: Use when writing, running, or fixing tests for Backend/ (node:test or vitest + supertest + mongodb-memory-server), AddaApp/ (jest-expo + React Native Testing Library), or SocialPanel/ (vitest + React Testing Library), or when setting up CI. Defines test layers, isolation rules (never the production DB), fixtures, fakes for OTP/Razorpay/push, and coverage expectations.
---

# Automated Testing

## Purpose and scope
Fast, deterministic tests that prove correctness, security (auth + tenancy), and money integrity. Applies to all
three packages and CI. Tests must never touch MongoDB Atlas production or any real third-party account.

## Test layers
| Layer | Backend | AddaApp | SocialPanel |
|---|---|---|---|
| Unit | services, utils (money, otp hashing, signature) | utils, hooks, api client | utils, hooks |
| Integration | supertest against `app` + mongodb-memory-server | component + navigation with mocked API | pages with MSW-mocked API |
| Security | auth abuse, cross-tenant suite | token storage | role-guarded routes |
| E2E (manual/optional) | sandbox smoke script | device smoke checklist | browser smoke checklist |

## Backend standards
- Runner: vitest (`vitest run`) or `node --test`; pick one per repo and keep it consistent.
- `app.js` exports the Express app without `listen`; tests use `request(app)`.
- Database: `MongoMemoryReplSet` (transactions need a replica set). Global setup starts it once; each test file
  gets a unique DB name or clears collections in `beforeEach`.
- Guard: test setup asserts `process.env.MONGODB_URI` starts with `mongodb://127.0.0.1` or is the memory-server URI;
  abort if it contains `mongodb.net` (Atlas).
- `NODE_ENV=test`. Use `OTP_PROVIDER=test` (returns deterministic OTP to tests via adapter, not via HTTP).
- Fakes injected for adapters: `FakeRazorpay` (orders.create returns ids; signature helper), `FakePush` (records
  messages), `FakeOtp`. No network calls - optionally block with `nock.disableNetConnect()` or an undici MockAgent.
- Time: inject a clock or use `vi.useFakeTimers({ toFake: ['Date'] })` for OTP expiry, JWT expiry, overdue status.
  Do not fake timers globally (breaks mongodb-memory-server).
- Factories in `tests/factories` (`createSociety`, `createFlat`, `createResident`, `createAdmin`, `issueBill`)
  returning ids and auth headers. No shared mutable fixtures between tests.
- Tests independent and order-agnostic; parallel-safe by DB isolation.

### Example setup (vitest)
```js
// tests/setup/globalSetup.js
import { MongoMemoryReplSet } from 'mongodb-memory-server';
export default async function () {
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGODB_URI = rs.getUri();
  return async () => rs.stop();
}
```

### Example integration test
```js
import request from 'supertest';
import { app } from '../../src/app.js';
import { createSociety, createResident, issueBill } from '../factories/index.js';

test('resident cannot read bill from another society', async () => {
  const a = await createSociety(); const b = await createSociety();
  const resA = await createResident({ societyId: a.id });
  const billB = await issueBill({ societyId: b.id });
  const res = await request(app)
    .get(`/api/v1/societies/${a.id}/bills/${billB.id}`)
    .set('Authorization', `Bearer ${resA.accessToken}`);
  expect(res.status).toBe(404);
});
```

## Mandatory suites (Backend)
- `auth`: OTP send/verify/limits, refresh rotation + reuse, logout, admin login lockout, test-provider prod guard.
- `tenancy`: cross-society and cross-flat access for every society-scoped resource.
- `payments`: signature verification, duplicate/concurrent webhooks, out-of-order events, payments-disabled 503.
- `billing-jobs`: job lock prevents duplicate runs; bill uniqueness per period.
- `validation`: unknown keys rejected, NoSQL operator injection (`?status[$ne]=x`) rejected.
- `health`: `/health` 200; `/ready` 503 when disconnected.
- `reports`: generated Excel parsed back with exceljs to assert rows/totals; PDF buffer non-empty with `%PDF` header.

## AddaApp standards
- `jest-expo` preset; `@testing-library/react-native`; mock `expo-secure-store`, `expo-notifications`,
  `expo-image-picker` in `jest.setup.js`.
- Test API client refresh logic with mocked `fetch`; test screens render loading/empty/error states.

## SocialPanel standards
- vitest + jsdom + `@testing-library/react` + MSW for API mocks.
- Test protected routes: unauthenticated -> redirect to login; society_admin cannot open super-admin routes.

## Commands
```bash
# Backend
cd Backend && npm test
cd Backend && npx vitest run tests/security --reporter=verbose
cd Backend && npx vitest run --coverage
# node:test alternative
cd Backend && node --test --test-concurrency=1 tests/

# AddaApp
cd AddaApp && npx jest --ci --coverage

# SocialPanel
cd SocialPanel && npx vitest run
cd SocialPanel && npm run build   # build must pass as a test gate
```

## Coverage expectations
- Backend overall >= 80% lines; `services/payments*`, `services/auth*`, tenancy middleware >= 90% branches.
- Coverage is a signal, not the goal: every bug fix adds a regression test reproducing it first.

## CI (GitHub Actions or equivalent)
- Node 22, `npm ci`, cache `~/.cache/mongodb-binaries`, run lint + tests per package, fail on any test or lint error.
- No production secrets in CI; test secrets are dummy values defined in workflow env.

## Implementation checklist
- [ ] New endpoint has happy/validation/401/403/404 tests
- [ ] Society-scoped endpoint added to tenancy suite
- [ ] Money/payment change covered in payments suite
- [ ] External services faked; network disabled
- [ ] Atlas-URI guard active in test setup
- [ ] Time-dependent logic uses injected clock
- [ ] Tests pass in isolation and in full run

## Common failure modes and recovery
| Symptom | Cause | Recovery |
|---|---|---|
| mongodb-memory-server download hangs/fails | Firewall/proxy or first run | Set `MONGOMS_DOWNLOAD_DIR`, pre-download in CI cache, or `MONGOMS_SYSTEM_BINARY` to local mongod |
| `Transaction numbers are only allowed on a replica set` | Used `MongoMemoryServer` | Switch to `MongoMemoryReplSet` |
| Flaky unique-index tests | Index not built | `await Model.init()` / `syncIndexes()` in setup |
| Tests hang after completion | Open Mongo connection/timers/job scheduler | `mongoose.disconnect()` in teardown; do not start scheduler in `app.js`; `--test-force-exit` only as last resort |
| Jest "Cannot use import statement" in AddaApp | `transformIgnorePatterns` excludes expo modules | Use jest-expo preset defaults; extend pattern for new RN libs |
| Tests pass locally, fail in CI | Order dependence/shared state or timezone | Isolate DB per test; set `TZ=Asia/Kolkata` explicitly where dates matter |

## Definition of done
- All suites green locally and in CI; no skipped tests without linked issue.
- No test connects to Atlas or real Razorpay/OTP/push services.
- Security and payment suites updated for the change.
