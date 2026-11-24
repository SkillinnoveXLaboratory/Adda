---
name: vendor-marketplace
description: Use when touching member vs vendor accounts, vendor KYC, shop name/logo/location, property and service listings, the members' Marketplace and "near me" search, per-vendor NIVASA commission + member discount, service bookings and cash "mark as paid", earnings, or boosted ads — in the Backend, Adda_App, SocialPanel or Admin_Panel. Lists the rules and every check that must pass.
---

# Vendor marketplace (members, vendors, KYC, shop, pricing, bookings, earnings, ads)

Contract: `docs/backend/API.md`. Vendors use the **member app** again (the separate VendorPanel website was removed).
There are **no coupons** any more and **no platform-wide commission setting**.

## Rules (enforced by the server — clients only mirror them)
1. **Account types.** `member` (default) and `vendor`, chosen at app sign-up (`accountType`), Member / Vendor switch at
   app sign-in (wrong type → sign-in refused with a clear message). Gatemen are a third kind of login (see
   `skills/gate-security`).
2. **Vendors have no society access** (`VENDOR_NO_SOCIETY`). Vendor listings are moderated by the platform.
3. **Only KYC-approved vendors list** properties and services. KYC rules unchanged (PAN, Aadhaar Verhoeff, bank, 3
   private photos, AES-256-GCM, masked, audited reveal).
4. **Shop.** Vendor sets a **shop name** (2–80) and **shop logo** (public image, purpose `vendor_logo`) and a **shop
   location** (`lat` −90…90, `lng` −180…180, `label` ≤200 e.g. the searched address) at sign-up (location optional
   there, prompted) and later in Shop settings (`PUT /vendor/shop`). Services show the shop name + logo
   (`shop:{name, logoUrl}`) and inherit the shop location (stored on each service as GeoJSON for search; updated
   when the shop moves).
5. **Pricing (per vendor, set by Master Admin on the vendor's page).**
   - **Members see and pay the vendor's own price** (member price = vendor price). `commissionPercent` 0–100 (≤2
     decimals, basis points) is NIVASA's fee **taken out of** that price: commission = `round(price × bps / 10000)`,
     vendor earns price − commission. ₹1,000 at 20% → members pay **₹1,000**, vendor earns **₹800**. The commission is
     shown **only to the vendor** (and Master Admin), never to members.
   - `memberDiscountPercent` 0–100 — the share **of the commission** a member gets back when they tap **"Apply
     discount"**. 50% of ₹200 → ₹100 off → member pays **₹900**. NIVASA pays the discount (keeps ₹100); the vendor
     still earns ₹800.
   - Applies at once to all of that vendor's services (live price); a booking snapshots everything when it is made.
   - The vendor sees the price, NIVASA's fee and "you earn" (`vendorEarningsPaise`) on services, products, bookings
     and orders. Members see only the price and, when available, the discount offer — never the fee or the rates.
   - "Price on request" services: no commission/discount shown; the vendor records the amount at mark-paid and
     commission is `round(cash × bps/10000)` taken from it (see 7).
6. **Bookings.** Members book approved services (date today…+90 days, address, one open booking per service).
   `applyDiscount: true` uses the vendor's discount (409 `NO_DISCOUNT` when none). Snapshot: `vendorPricePaise`,
   `commissionBps`, `commissionPaise`, `memberPricePaise`, `discountBps`, `discountPaise` (0 if not applied),
   `payablePaise = memberPrice − discount`. requested → accepted|declined|cancelled → completed. Members may pay online
   once the booking is `accepted` (or `completed`) — see skills/cashfree-payments; a paid booking that is then
   cancelled/declined is refunded in full automatically.
7. **Mark paid (cash).** Vendor records the cash received once after `completed` (prefilled with `payablePaise`).
   Settlement fixed then: `cashPaise`, `commissionPaise`, `discountPaise`, `netToPlatformPaise = commission − discount`,
   `vendorEarningsPaise = cash − netToPlatform`. (₹900 cash → vendor ₹800, NIVASA ₹100, member saved ₹100.)
   For "price on request": commission = round(cash × bps/10000) and comes out of the cash (no discount).
8. **Earnings.** Vendor: `GET /vendor/earnings` (app screen). Master Admin: `GET /platform/earnings` — commission,
   member discounts given, **NIVASA net earnings** (commission − discounts), vendor earnings, by month, top vendors.
   Old bookings keep their old numbers (`vendorEarnings = cash − net` holds for both models).
9. **Marketplace & near me (members).** Members open **Marketplace** (Members area) to see all approved vendor services
   (and properties tab). "Near me": the member's location (device GPS, else their society's location) + radius
   (1–100 km, quick picks 2/5/10/25/50) → `GET /service-offers?lat=&lng=&radiusKm=&sort=nearest` returns services whose
   shop is inside the radius with `distanceKm` (1 decimal), nearest first. Services without a location are excluded
   from "near me" only.
10. **Ads (boost)** unchanged (admin-set durations, approval, sponsored first on page 1, max 5).
11. **Categories** unchanged (admin data, icon set, `CATEGORY_IN_USE`).

## Checks that must pass (local backend only — never Atlas)
```
cd Adda_App && npm run vendor-check     # accounts, KYC, shop, pricing math, discount, bookings, mark-paid settlement,
                                        # earnings, near-me distances, ads, member never sees vendor price/rates
cd Adda_App && node scripts/api-check.mjs http://localhost:3013 admin@addaapp.local DevAdmin12345
cd Admin_Panel && node scripts/api-check.mjs && npm run subadmin-check
```
Exact numbers to assert: ₹1,000 @20% → member pays ₹1,000, vendor earns ₹800; discount 50% → ₹100 off → payable ₹900;
mark-paid ₹900 → commission ₹200, discount ₹100, net to NIVASA ₹100, vendor ₹800. Rounding: ₹333.33 @ 12.5% →
commission ₹41.67, vendor ₹291.66.

## Review checklist
- Any member-facing response containing `vendorPricePaise`, `commissionBps`, `commissionPaise` or settlement fields.
- Prices computed on the client and trusted by the server (the server always recomputes from the vendor's rates).
- Coupon leftovers (routes, UI, text) — the feature is gone.
- A service search that ignores visibility/moderation when `lat/lng` is given.
