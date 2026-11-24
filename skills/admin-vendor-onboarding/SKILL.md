---
name: admin-vendor-onboarding
description: Use when touching Master Admin "Add vendor", admin-entered vendor KYC + documents, approving KYC from the admin side, the Cashfree payout account created for such vendors, "added by" tracking, or the sub-admin Activity page — Backend /platform/vendors*, /platform/subadmins/:id/activity, Admin_Panel Vendors / VendorDetail / SubAdmins. Contains the SMART CHECK every change must pass.
---

# Master Admin vendor onboarding + sub-admin activity

Contract: `docs/backend/API.md` → "Master Admin: add vendors + KYC on their behalf". Related: `skills/vendor-marketplace`
(KYC rules, pricing), `skills/cashfree-payments` (payout account), `skills/platform-subadmins` (permissions).

## Rules
1. **Who:** the owner, or a sub-admin with `vendors.manage`. `vendors.view` only → 403 on every write and upload; the
   buttons are hidden/disabled in the panel. Sub-admin activity is **owner only**.
2. **Add vendor** creates a normal app vendor account (`accountType: vendor`, mobile + password sign-in, email kept for
   Cashfree). Nothing half-created: any invalid field or document → 400 and no user/profile left behind.
   Duplicate mobile → 409 `ACCOUNT_EXISTS`, duplicate email → 409 `EMAIL_EXISTS`. Password strength = app sign-up rules.
3. **KYC typed by the admin** follows the vendor's own rules exactly (PAN, Verhoeff Aadhaar, IFSC, 9–18 digit account,
   3 different document photos) + `vendorConsent: true` (the admin confirms the vendor agreed). Numbers are stored
   AES-256-GCM encrypted, responses are masked, documents stay private (purpose `kyc`) and are moved to the vendor.
   Documents must be uploads by **this** admin (or already on this vendor) — never someone else's.
4. **Approve now** (`approve: true`) = KYC `approved` with `reviewedBy` = the admin, and the Cashfree Easy Split payout
   account is created from those details when Cashfree is configured (status shown on the vendor page). Otherwise the
   KYC is `pending` and goes through the normal review queue. An approved KYC can't be overwritten (409
   `KYC_APPROVED`) — reject it first.
5. **Traceability:** every create / KYC entry is audited (`platform.vendor_created`, `platform.vendor_kyc_entered[_approved]`)
   with the actor. Vendor list/detail show **Added by** (name + Owner/Sub-admin) and **KYC entered by**. The owner opens
   Sub-admins → **Activity** to see everything a sub-admin did (with counts of vendors added / KYC entered).

## SMART CHECK (run before finishing — every line must hold)
Automated: `cd Admin_Panel && node scripts/vendor-onboarding-check.mjs` (local API only, never Atlas). It covers:
- [ ] Owner adds a vendor with full KYC + approve → 201, KYC approved, payout object present, masked PAN/Aadhaar/account,
      no full numbers anywhere in the response; documents now owned by the vendor and still private (unsigned URL → 403).
- [ ] That vendor signs in to the app (mobile + password, "Vendor") and can add a product (KYC gate passes).
- [ ] Validation: weak password, bad PAN / Aadhaar checksum / IFSC / account, same photo twice, missing consent,
      unknown field → 400, and **the mobile is still free afterwards** (no half-created account).
- [ ] Duplicates: mobile → 409 ACCOUNT_EXISTS, email → 409 EMAIL_EXISTS.
- [ ] Foreign documents: another admin's or another vendor's upload → 400.
- [ ] Vendor without KYC → admin enters KYC (pending) → normal approve works → editing again → 409 KYC_APPROVED.
- [ ] Sub-admin with `vendors.manage` adds a vendor → list/detail show `addedBy` = that sub-admin (role sub_admin).
- [ ] Sub-admin with `vendors.view` only → 403 on create, upload and kyc-details.
- [ ] Owner: `GET /platform/subadmins/:id/activity` lists `platform.vendor_created` for that vendor with
      `counts.vendorsAdded ≥ 1`; a sub-admin calling it → 403; `/platform/audit-logs?actorId=` filters by actor.
- [ ] Member / vendor app tokens → 401/403 on every `/platform/vendors*` write.
Manual UI pass (Admin_Panel): Add vendor form at 360 px and desktop — every error shows next to its field, the
upload tiles show the file and can be replaced, "Approve KYC now" explains the Cashfree effect, the success screen
links to the vendor; Sub-admins → Activity drawer pages and filters. Then `npm run lint`, `npx vitest run`,
`npm run build`, `node scripts/subadmin-check.mjs`.

## Common mistakes this check catches
Creating the User before validating documents (orphan account); trusting a client-sent owner for media; returning
decrypted KYC; forgetting `approve` must create the payout account; sub-admin actions not audited with the actor;
permission only checked in the UI.
