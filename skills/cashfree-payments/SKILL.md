---
name: cashfree-payments
description: Use when touching online payments in any component — Cashfree orders/checkout/webhooks/refunds, Easy Split vendor accounts (vendor payout verification), maintenance invoice payments, facility booking fees, service booking and product order online payments, the hosted checkout page, or the "Test mode" (sandbox) labels. Rules + checks that must pass.
---

# Cashfree payments + Easy Split (NIVASA)

Contract: `docs/backend/API.md` → "Online payments (Cashfree)". Money is integer paise everywhere except the one
place we talk to Cashfree (`rupees()` / `toPaise()` in the adapter, 2 decimals).

## Configuration (Backend/.env only — never in any client)
```
PAYMENT_PROVIDER=cashfree
CASHFREE_APP_ID=...            # x-client-id
CASHFREE_SECRET_KEY=...        # x-client-secret; also signs webhooks
CASHFREE_ENV=sandbox           # sandbox | production
PUBLIC_API_BASE_URL=https://adda.skillinnovex.in   # return_url / notify_url / hosted checkout page
```
`CASHFREE_API_BASE` (tests only) points the adapter at a local fake gateway; it is ignored when NODE_ENV=production.
Without keys every pay endpoint answers 503 `PAYMENTS_UNAVAILABLE` and clients say "Online payment is not available
yet" — never a fake success. `GET /public/config` → `payments: { gatewayConfigured, provider, mode }`; when
`mode === 'sandbox'` every pay button/screen shows a **"Test mode"** badge.

Cashfree dashboard: webhook URL `https://adda.skillinnovex.in/api/v1/payments/webhook/cashfree` (Payment + Refund
events), whitelist the domain `adda.skillinnovex.in` for checkout. Sandbox Easy Split:
`POST https://sandbox.cashfree.com/pg/simulate/easy-split/enable` once per merchant id.

## Flow (one generic path for every kind)
1. Client calls the kind's pay endpoint → server computes the amount (never from the client), creates a
   `GatewayOrder` `{ orderId, kind: invoice|facility|booking|order, ref, user, amountPaise, splits, sessionId }` and a
   Cashfree order (`order_splits` when money must go to a vendor/society account) → returns
   `{ orderId, checkoutUrl, amountPaise, mode }`.
2. App opens `checkoutUrl` (our hosted page `/api/v1/pay/checkout/:orderId?t=<hmac>`, Cashfree JS v3) with
   `WebBrowser.openAuthSessionAsync(url, 'addaapp://payment-result')`. Cashfree returns to
   `/api/v1/pay/return?order_id=…`, which syncs and redirects to `addaapp://payment-result?order_id=…&status=…`.
3. App then calls `POST /payments/checkout/:orderId/refresh` and shows the server's status. The **server decides**
   "paid" only from Cashfree's API (`GET /orders/{id}` = PAID → `GET /orders/{id}/payments` SUCCESS) — the redirect
   and the webhook payload are only triggers.
4. Webhook `POST /api/v1/payments/webhook/cashfree`: raw body, `x-webhook-signature` =
   base64(HMAC-SHA256(`x-webhook-timestamp` + rawBody, CASHFREE_SECRET_KEY)); deduped in `PaymentWebhookEvent`;
   payment events → the same sync; `REFUND_STATUS_WEBHOOK` → refund update.
5. Settle (idempotent per kind, guarded update `payment.status != paid`), then mark the GatewayOrder paid.
   Amount from Cashfree ≠ `amountPaise` → `amount_mismatch`, nothing applied, logged.

| kind | pay when | money goes to | on paid |
|---|---|---|---|
| invoice | balance > 0 | society's Cashfree vendor if `settlementMode=cashfree_split`, else NIVASA | existing `markCaptured` (receipt + ledger) |
| facility | booking `confirmed`, fee > 0 | as invoice | `payment.status=paid` + ledger credit `other_income` "Facility booking" |
| booking (service) | booking `accepted` or `completed`, listed price (cancel/decline after paying → full refund) | split: vendor gets `vendorEarnings` | settlement like cash mark-paid, `method: 'online'` |
| order (product) | at checkout (`paymentMethod: online`) | split: vendor gets `vendorEarnings` | order `awaiting_payment → placed` |

Split amount for vendors = payable − (commission − discount) = vendor price total (+ delivery charge). NIVASA keeps
commission − discount. Vendors must have an **active** Cashfree vendor account (`payout.status = active`) for online
pay; otherwise 409 `VENDOR_PAYOUT_NOT_READY` and COD/cash still works.

## Vendor payout account (Easy Split "vendor verification")
Cashfree API 2025-01-01, `POST /easy-split/vendors` — **required**: `vendor_id` (alnum/_), `status`, `name` (no
special chars except `. / - &`, ≤100), `email`, `phone` (digits), `kyc_details` with **`business_type`** (Cashfree
refuses the vendor without it: "kyc_details.business_type : is missing") + `account_type` + `pan`; `gst` optional.
Bank OR UPI, never both. Update = `PATCH /easy-split/vendors/:id` (same fields, no vendor_id/status). Files =
`POST /easy-split/vendor-docs/:id` multipart `doc_type` (PAN, GST, UIDAI_FRONT…) + `doc_value` + `file` (≤2 MB).
Statuses: IN_BENE_CREATION / IN_BANK_VALIDATION / IN_KYC_REVIEW → pending; ACTIVE → active;
BANK_VALIDATION_FAILED / BENE_CREATION_FAILED / ACTION_REQUIRED / ON_HOLD → failed (message says what to fix, with
Cashfree's document remarks); BLOCKED / DELETED → blocked. Sandbox vendors turn ACTIVE after ~10 minutes.

- `business_type` = the vendor's **line of business**: one of `CF_LINES_OF_BUSINESS` (exact Cashfree strings; the
  same list in `Backend/server.js`, `Admin_Panel/src/lib/vendorOnboarding.js`, `Adda_App/src/lib/cashfree.js` — keep
  them identical). Regulated lines (NBFC, chit funds, wallets, broking, gaming) are deliberately not offered.
- GSTIN optional (needed above ₹20 lakh/yr); must carry the PAN in characters 3–12 (server + both clients check).
- On KYC approval the server creates the Cashfree vendor (`vendor_id = nv<userId>`, bank + PAN decrypted only for
  this call, never logged/returned). A hash of the sent details (`payout.syncedHash`) means changed email / bank /
  line of business / GSTIN are sent as an update on the next sync; unchanged → no call.
- Only the **PAN card file** is uploaded (`payout.docs[]` records Cashfree's verdict per file). Aadhaar stays with
  NIVASA (data minimisation). A file Cashfree rejected is **not** re-sent unchanged — a new photo (reject → Edit KYC →
  approve) is uploaded; our own failed attempts (network, >2 MB, not JPG/PNG/PDF) are retried.
- Missing before any call: email, valid mobile, bank/PAN, line of business → `failed` with a clear message, nothing
  sent to Cashfree.
- Master Admin vendor page: "Cashfree payout account" card: status, message, line of business, GSTIN, masked email,
  documents sent; **Cashfree details** (`PATCH /platform/vendors/:id/payout-details` `{ lineOfBusiness?, gstin?,
  email? }`, `vendors.manage`, works after approval, audited `platform.vendor_payout_details`, re-syncs at once) and
  **Create / refresh** (`POST /platform/vendors/:id/payout`). Vendor app: line of business + GSTIN in the KYC form;
  payout card can refresh once the account exists on Cashfree.

## Refunds
- Product order paid online and cancelled (member before packed, or vendor) → full refund with `refund_splits`
  pulling the vendor share back; `payment.status: refund_pending → refunded` on SUCCESS (API or webhook).
- Facility booking paid and cancelled by staff → full refund; ledger debit `refund` on SUCCESS. Members can't cancel a
  paid facility booking themselves (409 `PAID_BOOKING`).
- Invoice refunds: existing society "Refund" button → Cashfree refund by order id.
- Every refund is applied once (`GatewayOrder.refunds[].status` guarded update).

## Checks
```
cd Adda_App && npm run payments-check     # fake Cashfree gateway: invoice/facility/booking/order pay, split amounts,
                                          # webhook signature (good/bad/duplicate), amount mismatch, refunds,
                                          # payout account create/refresh, 503 when not configured;
                                          # the fake refuses vendors without business_type (like live)
                                          # and records PATCH updates + vendor-docs uploads
cd Adda_App && npm run vendor-check && npm run products-check
```
Review: client-sent amounts; a success shown before `refresh` says paid; secrets in clients; settlement numbers that
differ between cash and online; refunds applied twice; split amount ≠ vendor earnings.
