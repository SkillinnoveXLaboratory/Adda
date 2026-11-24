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
- On KYC approval the server creates the Cashfree vendor (`vendor_id = nv<userId>`, bank + PAN decrypted only for
  this call, never logged/returned) → `VendorProfile.payout { cfVendorId, status: pending|active|failed|blocked,
  message }`. Cashfree status ACTIVE → active, BLOCKED/DELETED → blocked, other → pending.
- Master Admin vendor page: "Cashfree payout account" card with status + **Create / refresh** (`POST
  /platform/vendors/:id/payout`, `vendors.manage`). The vendor app shows the status in Shop/KYC.
- A vendor account needs an email (Cashfree requires it) — missing → `failed` with a clear message.

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
                                          # payout account create/refresh, 503 when not configured
cd Adda_App && npm run vendor-check && npm run products-check
```
Review: client-sent amounts; a success shown before `refresh` says paid; secrets in clients; settlement numbers that
differ between cash and online; refunds applied twice; split amount ≠ vendor earnings.
