---
name: payment-accounting-auditing
description: Use when working on maintenance billing, Razorpay orders/checkout/webhooks, payment verification, refunds, ledger entries, receipts, dues, financial reports (PDF/Excel), or billing/reminder jobs in Backend/, AddaApp/, or SocialPanel/. Defines the payment state machine, paise arithmetic, HMAC verification, idempotent webhooks, ledger double-entry rules, and audit requirements.
---

# Payments, Accounting and Auditing

## Purpose and scope
Money flows must be correct, idempotent, and auditable. Covers Bill generation, Razorpay integration via
`src/services/payments/razorpay.js`, Payment state machine, LedgerEntry, receipts, financial reports, and the jobs
that generate bills and reminders.

## Money rules
- All amounts are integer **paise** (`Number.isInteger`, >= 0). Conversion only at display edges
  (`utils/money.js`). Never `parseFloat`, never `* 100` on user-typed decimals without rounding via string parsing.
- Currency fixed `INR`. Penalties/interest computed with integer math and an explicit rounding rule (round half up
  to paise) documented in code.
- Amount to charge is always computed server-side from the Bill's outstanding balance; client-sent amounts are ignored
  (or only accepted for partial payment within `1..outstanding`, validated server-side if partial payments allowed).

## Razorpay adapter
- Enabled only if `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` are present. Otherwise
  `payments not configured`: payment endpoints return 503 `{ code: 'PAYMENTS_UNAVAILABLE' }`, `/api/v1/public/config`
  exposes `payments.gatewayConfigured: false` and invoices carry `onlinePayment.available: false`, and clients show "Online payment is currently unavailable".
- Per-society routing (Razorpay Route/linked accounts) only if configured; otherwise single platform account.
- Order creation (`POST /api/v1/payments/orders { billId }`): server loads bill scoped by society+flat, computes
  amount, creates Payment `{ status: 'created', amountPaise, billId, societyId, flatId, userId, receipt }`,
  calls `orders.create({ amount, currency: 'INR', receipt: payment._id.toString(), notes: { societyId, billId } })`,
  stores `razorpayOrderId`. Return `{ orderId, amount, currency, keyId }` only.
- Client checkout result verification (`POST /payments/verify`): compute
  `HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET)` hex and compare with `crypto.timingSafeEqual`.
  Then fetch payment from Razorpay API (or wait for webhook) to confirm `captured` and amount match before
  marking paid. Client success callback alone never marks a bill paid.
- Webhook (`POST /api/v1/payments/webhook/razorpay`): mounted with `express.raw({ type: 'application/json' })`;
  verify `X-Razorpay-Signature` = `HMAC_SHA256(rawBody, WEBHOOK_SECRET)` using the exact raw bytes. Respond 2xx
  quickly after durable record; invalid signature -> 400, not logged with body.

## Webhook idempotency
- Key: `X-Razorpay-Event-Id` header (fallback: `event + payload.payment.entity.id`).
- Insert `WebhookEvent { eventId (unique), type, receivedAt, status: 'received' }`; on `E11000` return 200
  (duplicate delivery) without reprocessing.
- Process inside a transaction; mark `processed` or `failed` with error; failed events are retryable by a job.
- Handle out-of-order events: state machine ignores transitions to an earlier state.

## Payment state machine
```
created -> authorized -> captured -> (refund_pending -> refunded | partially_refunded)
created/authorized -> failed
created -> expired (job, after order TTL)
```
- Transitions via conditional update `{ _id, status: { $in: allowedFrom } }`; `matchedCount === 0` means already
  transitioned -> no-op.
- On `captured` (single transaction): Payment.status=captured, Bill.paidPaise += amount, Bill.status recomputed
  (`partially_paid`/`paid`), LedgerEntry rows written, AuditLog written, receipt number allocated.
- Verify `amount`, `currency`, and `order_id` in webhook match stored Payment; mismatch -> flag `needs_review`, do not
  credit.

## Ledger
- Append-only `LedgerEntry { societyId, flatId, billId?, paymentId?, type: 'debit'|'credit', account, amountPaise,
  balanceAfterPaise?, refType, refId, createdAt, createdBy }`.
- Bill issued -> debit flat receivable; payment captured -> credit flat receivable; refund -> reversing entry.
  Corrections are new reversing entries, never edits/deletes.
- Invariant (tested + nightly check job): for each flat, sum(debits) - sum(credits) == sum(bill outstanding).
- Receipt numbers sequential per society per financial year (`RCPT/2026-27/000123`) via atomic counter
  (`findOneAndUpdate` `$inc`, upsert) inside the capture transaction.

## Billing and reminder jobs
- Job lock: insert `JobLock { key: 'billing:<societyId>:<YYYY-MM>', owner, expiresAt }` (unique key). Duplicate key ->
  skip. Bill unique index `{ societyId, flatId, period }` is the second line of defense.
- Reminders keyed `reminder:<societyId>:<billId>:<stage>` so each stage sends once.
- Jobs are restart-safe: resume by querying what is not yet done, not by in-memory state.

## Reports
- PDF receipts/statements via pdfkit; Excel collection/dues reports via exceljs. Amounts formatted from paise;
  totals computed from ledger, not re-summed floats. Every export audited (`report.exported`).

## Audit
- AuditLog for: bill create/cancel, manual payment entry (cash/cheque) with reference, refund, waiver, penalty change,
  webhook `needs_review`, report export. Include actor, societyId, before/after, requestId.

## Implementation checklist
- [ ] Paise integers everywhere; server computes charge amount
- [ ] Payments disabled gracefully when credentials missing
- [ ] Checkout signature verified with timingSafeEqual + server-side capture confirmation
- [ ] Webhook raw body + signature verification + unique eventId
- [ ] State machine via conditional updates; out-of-order safe
- [ ] Capture updates Payment+Bill+Ledger+Audit in one transaction
- [ ] Receipt counter atomic per society per FY
- [ ] Job locks for billing/reminders
- [ ] Ledger invariant check implemented

## Required tests
```bash
cd Backend
npx vitest run tests/payments          # uses fake Razorpay adapter + MongoMemoryReplSet
```
- Valid signature -> captured; tampered signature -> 400; wrong secret -> 400.
- Same webhook delivered twice (and concurrently via Promise.all) -> one capture, one ledger credit.
- Out-of-order: `payment.captured` then `payment.authorized` -> stays captured.
- Amount mismatch -> `needs_review`, bill unchanged.
- Missing credentials -> 503 `PAYMENTS_UNAVAILABLE`.
- Billing job run twice for same period -> no duplicate bills. Ledger invariant holds after a scenario.
- Generate test signatures in tests with `crypto.createHmac('sha256', TEST_SECRET)`; use Razorpay **test mode** keys
  only for manual sandbox runs; never live keys in CI.

## Common failure modes and recovery
| Symptom | Cause | Recovery |
|---|---|---|
| Webhook signature mismatch | Body parsed by `express.json` then re-stringified | Raw parser on webhook route before JSON parser; HMAC over `req.body` Buffer |
| Signature mismatch on verify | Wrong order (`payment_id|order_id`) or key secret vs webhook secret confusion | Use `order_id|payment_id` with key secret; webhook uses webhook secret |
| Duplicate credits | Duplicate webhook delivery or verify+webhook both crediting | Unique eventId + conditional status transition; both paths call same idempotent `capturePayment` |
| Paid at Razorpay but bill unpaid | Webhook not reachable/failed | Check Razorpay dashboard webhook logs; run reconciliation job (fetch orders by status, apply idempotently) |
| Off-by-one-rupee totals | Float math | Convert to paise integers; add test |
| Duplicate bills after restart | No job lock/unique index | Add both; cancel duplicates with reversing ledger entries |

## Definition of done
- All payment paths idempotent and covered by tests including duplicates and tampering.
- Ledger invariant test passes; every money mutation audited.
- Works with payments disabled; no secrets in client bundles or logs.
- Sandbox end-to-end (test mode) payment verified on device before release.
