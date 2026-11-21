---
name: vendor-products
description: Use when touching vendor products, product categories, the members' Marketplace Products tab, product orders (place, pay, cancel, vendor status updates, delivery tracking), stock, or product earnings — Backend, Adda_App or Admin_Panel. Rules + checks.
---

# Vendor products and orders (Flipkart-style tracking)

Contract: `docs/backend/API.md` → "Products & orders". Pricing rules are the same as services
(`skills/vendor-marketplace` rule 5) and online payment follows `skills/cashfree-payments`.

## Rules (server-enforced)
1. **Categories** — kind `product`, managed by Master Admin (Categories page, same as other kinds; `CATEGORY_IN_USE`
   blocks delete). Members filter by them (chips) and search by text.
2. **Products** — only KYC-approved vendors (`KYC_REQUIRED`). Fields: category, title 2–140, description ≤3000,
   ≤6 photos (purpose `product`), price (vendor price, paise ≥ 100), unit ≤40 ("500 g", "1 piece"), stock 0–100000,
   maxPerOrder 1–100, delivery and/or pickup (at least one), deliveryCharge (paise, vendor keeps it, no commission),
   status active|paused. Max 200 products per vendor. New/changed content → moderation (`pending`) when listings
   need approval; Master Admin approves in Listings → Products. Location inherited from the shop (near me).
3. **Member view** — member unit price = vendor price + commission; never vendor price/rates. `inStock`, `stock`
   (only the number), shop name/logo, discount offer. Vendors see their own pricing breakdown.
4. **Place order** (`POST /products/:id/orders`, members only `MEMBER_ONLY`): quantity 1…min(maxPerOrder, stock),
   fulfilment `delivery` (address required) | `pickup`, `applyDiscount`, `paymentMethod` `cod` | `online`.
   Stock is reserved atomically (`OUT_OF_STOCK`). Snapshot: unit vendor/commission/member/discount × qty,
   deliveryCharge, `payablePaise = memberTotal − discount + deliveryCharge`.
   - `cod` → status `placed` at once.
   - `online` → `awaiting_payment` + checkout; becomes `placed` when Cashfree confirms. Unpaid after 30 min →
     cancelled by the scheduler, stock restored (checked with Cashfree first).
5. **Status machine** (every update has a status guard):
   `awaiting_payment → placed | cancelled`; `placed → confirmed | cancelled`; `confirmed → packed | cancelled`;
   `packed → shipped (delivery) | ready_for_pickup (pickup) | cancelled`; `shipped → out_for_delivery | delivered`;
   `out_for_delivery → delivered`; `ready_for_pickup → delivered`. Vendor drives it; member may cancel until
   `confirmed` (inclusive). Vendor cancel needs a reason. Cancel restores stock; online-paid → refund
   (`skills/cashfree-payments`). Each step is in `timeline` (status, note, at) — the member's tracking view.
6. **Settlement** — COD: recorded at `delivered` (cash = payable). Online: at payment. Same fields/formula as
   services: commission, discount, `netToPlatform = commission − discount`, `vendorEarnings = cash − net`.
   Earnings (vendor + platform) include products (`breakdown.services|products`).
7. Notifications: vendor "New order"; member on each status change; type `order`.

## Checks
```
cd Adda_App && npm run products-check    # categories, CRUD + KYC gate, moderation, member never sees vendor price,
                                         # order math (₹1,000 @20%, discount 50%, qty 2, delivery ₹40 → payable ₹2,240),
                                         # stock reserve/restore, every transition + illegal ones, COD settlement,
                                         # earnings include products, isolation (other vendor/member → 404)
```
UI: Marketplace has Services | Products | Properties; Products tab = search + category chips (+ near me); product
page → Buy (qty, delivery/pickup, address, discount, COD/online + "Test mode" badge in sandbox); My orders with a
step tracker; vendor "Orders" tab with the next-step buttons.
