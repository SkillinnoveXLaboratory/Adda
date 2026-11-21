---
name: mongodb-data-integrity
description: Use when designing or modifying Mongoose models, indexes, queries, transactions, migrations, or job locks in Backend/ (Mongoose 9, MongoDB Atlas). Covers schema rules, uniqueness, society-scoped compound indexes, transactions for money, idempotency, soft deletes, and migration safety.
---

# MongoDB Data Integrity (Backend)

## Purpose and scope
Guarantee correctness of persisted data for a multi-tenant society platform on MongoDB Atlas via Mongoose 9.
Covers models in `Backend/src/models`, service-layer queries, transactions, job locks, and data migrations.

## Standards

### Schema design
- Every society-scoped model has `societyId: { type: ObjectId, ref: 'Society', required: true, index: true }`.
  Society-scoped: Flat/Unit, Membership, Bill, BillItem, Payment, LedgerEntry, Complaint, Notice, Event,
  Visitor, Document, PushToken(where relevant), AuditLog.
- Global models: User, Society, AdminAssignment, UserSession, OtpChallenge, JobLock, WebhookEvent.
- `timestamps: true` on all schemas. Use `strict: 'throw'` in development to surface unknown fields.
- Enums declared as constants shared with zod validators (`BILL_STATUS = ['draft','issued','partially_paid','paid','overdue','cancelled']`).
- Money fields: integer paise (`{ type: Number, required: true, validate: Number.isInteger, min: 0 }`). No Decimal
  floats, no rupee strings.
- Sensitive fields `select: false`: `passwordHash`, `otpHash`, `refreshTokenHash`.
- Phone stored normalized E.164 (`+91XXXXXXXXXX`). Email lowercased + trimmed.
- Do not embed unbounded arrays (comments, payments) in parent docs; use separate collections with references.

### Indexes (declare in schema, verify with `Model.syncIndexes()` in a controlled step)
- `User`: unique `phone`; unique sparse `email`.
- `Membership`: unique `{ societyId, userId, flatId }`; index `{ userId, status }`.
- `Flat`: unique `{ societyId, block, number }`.
- `Bill`: unique `{ societyId, flatId, period }` (e.g. `2026-10`) - prevents duplicate billing runs.
- `Payment`: unique `razorpayOrderId`; unique sparse `razorpayPaymentId`; index `{ societyId, status, createdAt }`.
- `WebhookEvent`: unique `eventId`.
- `JobLock`: unique `key` (e.g. `billing:societyId:2026-10`); TTL index on `expiresAt` for lease expiry.
- `OtpChallenge`: TTL on `expiresAt`. `UserSession`: TTL on `expiresAt`; index `{ userId, revokedAt }`.
- List queries must hit an index starting with `societyId` (check with `.explain('executionStats')`).
- `autoIndex: false` in production; build indexes via a script/deploy step to avoid startup surprises.

### Queries
- Always include `societyId` filter on society-scoped models (see `multi-tenant-society-security`).
- Use `.lean()` for read-only list endpoints; project only needed fields.
- Never pass raw client objects into filters (`Model.find(req.body)`); build filters from validated fields.
  Mongoose 9 `sanitizeFilter` / `strictQuery: true` enabled to block `$` operator injection.
- Updates use explicit `$set` of whitelisted fields; `runValidators: true` on `findOneAndUpdate`.
- Pagination: cursor on `{ createdAt, _id }`, limit capped at 100. No `skip` for large collections.

### Transactions
- Required whenever more than one document must change atomically: payment capture (Payment + Bill + LedgerEntry),
  bill generation batch per flat, refunds, membership transfer.
- Pattern:
  ```js
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // all ops pass { session }
    });
  } finally { await session.endSession(); }
  ```
- `withTransaction` retries on `TransientTransactionError`; operations inside must be idempotent.
- Atlas supports transactions (replica set). For tests use `MongoMemoryReplSet`, not `MongoMemoryServer`.

### Idempotency and concurrency
- Use unique indexes + catch `E11000` as the source of truth for "already done" (bills per period, webhook events,
  job locks).
- State transitions use conditional updates: `updateOne({ _id, status: 'created' }, { $set: { status: 'captured' } })`
  and check `matchedCount`.
- Optimistic concurrency (`optimisticConcurrency: true`) on documents edited by admins concurrently (Society settings).

### Job lock pattern
```js
async function acquireLock(key, owner, ttlMs) {
  try {
    await JobLock.create({ key, owner, acquiredAt: new Date(), expiresAt: new Date(Date.now() + ttlMs) });
    return true;
  } catch (e) { if (e.code === 11000) return false; throw e; }
}
```
- Mark completion (`status: 'done'`) instead of deleting the lock for per-period jobs, so a restart cannot rerun it.

### Deletion and audit
- Financial records (Bill, Payment, LedgerEntry) are never hard-deleted; use `status: 'cancelled'` and reversing entries.
- Soft delete (`deletedAt`) for Notices/Complaints; queries exclude soft-deleted by default.
- AuditLog for admin mutations: `{ societyId, actorId, action, entity, entityId, before, after, at }`.

### Migrations
- Scripts in `Backend/scripts/migrations/NNN-description.js`, idempotent, batch-processed, logged, with dry-run flag.
- Take an Atlas snapshot (or `mongodump`) before running against production.

## Implementation checklist
- [ ] `societyId` required + indexed on society-scoped models
- [ ] Unique indexes encode business uniqueness (bill per flat per period, webhook event id, job lock key)
- [ ] Money stored as integer paise with validators
- [ ] Sensitive fields `select: false`
- [ ] Multi-doc writes in transactions with `{ session }` on every op
- [ ] Conditional state transitions check `matchedCount`
- [ ] `strictQuery` / `sanitizeFilter` enabled; no raw client filters
- [ ] Indexes verified with `explain` for new list queries
- [ ] Migration script idempotent with dry-run

## Required tests
```bash
cd Backend
npx vitest run tests/models          # schema validation + unique index behavior
npx vitest run tests/integration/billing.test.js
```
- Use `MongoMemoryReplSet` (`replSet: { count: 1, storageEngine: 'wiredTiger' }`) and call `Model.init()` /
  `syncIndexes()` before asserting unique-index behavior.
- Tests: duplicate bill for same flat+period -> 409; transaction rolls back all docs when ledger write fails;
  concurrent captures (Promise.all) produce exactly one capture; float paise rejected; `$gt` injection in query
  string does not widen results.

## Common failure modes and recovery
| Symptom | Cause | Recovery |
|---|---|---|
| `Transaction numbers are only allowed on a replica set member` | Standalone Mongo in tests/local | Use `MongoMemoryReplSet` or local `mongod --replSet rs0` + `rs.initiate()` |
| Unique index not enforced in tests | Index not built yet | `await Model.init()` before tests |
| `E11000` on startup index build | Existing duplicate data | Find dupes via aggregation, resolve, then build index |
| Writes inside transaction not rolled back | Missing `{ session }` on one op | Pass session to every op; lint in review |
| `WriteConflict` under load | Concurrent txns on same doc | Rely on `withTransaction` retry; keep txns short |
| Slow list endpoints | COLLSCAN | Add compound index led by `societyId`; check `explain` |
| `MongoServerSelectionError` | Atlas IP allowlist / network | See `integration-debugging` |

## Definition of done
- Schema, indexes, and constraints encode the business invariants; tests prove them.
- No multi-document money operation outside a transaction.
- All society-scoped queries filtered by server-derived `societyId`.
- Migration (if any) dry-run output reviewed and backup taken before production run.
