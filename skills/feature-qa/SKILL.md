---
name: feature-qa
description: Use before starting AND before finishing any feature in this repo (app, panels or backend). Catches misunderstood requirements, UI/UX faults and glitches — money rounding, races, double taps, stale screens, permission leaks, layout overflow — with a per-area checklist and the exact commands that must pass. Includes acceptance checks for per-vendor pricing, gate security, near-me, splash/Get Started, vendor KYC and boosts.
---

# Feature QA — misunderstanding, UI/UX and glitch checks

Run this twice: **before coding** (sections 1–2) and **before saying "done"** (sections 3–6). Every box must be ticked
with evidence (a test, a screenshot you looked at, or a request/response) — never from memory.

## 1. Understand the request (before coding)
- [ ] Restate the request as numbered requirements. Each user sentence maps to at least one requirement.
- [ ] List every **ambiguous point** and the decision taken (e.g. "commission is added on top of the vendor's price";
      "the member discount is a share of NIVASA's commission"). Put these decisions in the final message so the user can
      correct them. Ask only when a wrong guess would be expensive to undo (data model, money flow, deletion).
- [ ] Who is the actor for each requirement (member / vendor / society staff / platform owner)? Which app or panel?
- [ ] What must NOT change (existing features, API shapes other clients use, financial history)?
- [ ] Is an "image/screen exactly like X" request about layout, colours, spacing *and* behaviour? Compare side by side.

## 2. Money and data rules (before coding)
- [ ] Amounts are integer paise end to end; rupee input → paise with `toPaise` (99.99 → 9999), never floats in storage.
- [ ] Percentages: store basis points (10% = 1000); compute `Math.round(amount × bps / 10000)` in ONE place on the
      server; the UI may preview with the same formula (`components/Pricing.jsx`).
- [ ] Settlements and payments are fixed when recorded and never edited (append-only); corrections are new records.
- [ ] Limits enforced on the server with an atomic guard (`$expr` / unique index), not "check then write".
- [ ] Snapshot what the user agreed to (price, commission rate, discount) on the booking.

## 3. UI/UX checklist (each new or changed screen)
- [ ] Matches the NIVASA template (`skills/nivasa-ui/UI_skill.md`): tokens only, gold buttons with navy text.
- [ ] Screenshot at 360 / 390 / 412 px (app) or 390 / 1440 px (panels) — *open and look at it*. Nothing cropped,
      overlapping, off-screen, or covered by the status bar / tab bar / home indicator.
- [ ] Images: full-bleed backgrounds must not be cropped in a way the user will notice; on web pin image size
      (`ImageBackground` renders at natural size otherwise) and clip with `overflow: 'hidden'`.
- [ ] Every input: label, placeholder example, keyboard type, max length, **specific** error ("PAN is 5 letters,
      4 digits, 1 letter"), not "invalid".
- [ ] Every action: loading state, disabled while busy (no double submit), success feedback, error shown in place.
- [ ] Destructive actions confirm and say the consequence; impossible actions are explained (e.g. "a gateman can't be
      deleted — disable instead").
- [ ] Empty, loading (skeleton) and error (retry) states exist and read naturally.
- [ ] Touch targets ≥ 44 px; every `Pressable` has `accessibilityRole` + label.
- [ ] Transitions: no flash of a different screen between splash and the first screen; animations ≤ 650 ms.

## 4. Glitch checklist (logic)
- [ ] Double tap / two devices at once: state transitions use a status guard in the update query.
- [ ] Stale screens: after an action, the list/dashboard refreshes (or the item updates in place).
- [ ] Cancel / decline paths undo reservations — idempotently.
- [ ] Roles: members can't call vendor or platform endpoints; vendors can't reach society data; members never receive
      vendor-only fields (commission, settlement) — check the JSON, not just the UI.
- [ ] Unknown / deleted references (category removed, discount turned off after it was applied) fail with a clear
      message, and the UI recovers (drops it, shows why).
- [ ] Time: dates are India time; "valid until" means end of that day IST.
- [ ] Offline / server error: the app says so; nothing claims success that did not happen.

## 5. Feature acceptance checks
**Pricing (per vendor)** — Master Admin sets the vendor's commission % (added on top) and member discount % (of the
commission) → ₹1,000 @20% shows ₹1,200 to members → "Apply discount" 50% → ₹100 off → pays ₹1,100 → mark-paid ₹1,100 →
NIVASA ₹200 − ₹100 = ₹100, vendor ₹1,000 → vendor and Master Admin earnings agree → members never get the vendor price
or rates in the JSON. No coupons exist anywhere.
**Gate security** — see `skills/gate-security/DRY_CHECK.md`. **Near me / maps** — see `skills/location-maps/SKILL.md`.
**Splash → Get Started** — whole photo visible (bottom-anchored, sky colour above), same brand block position on both,
splash fades over Get Started, buttons fade up.
**Vendor KYC / boosts** — see `skills/vendor-marketplace/SKILL.md`.

## 6. Commands that must pass (local backend only — never Atlas)
```
cd Backend && node server.js dev:db            # + API on :3013 with KYC_ENCRYPTION_KEY (see vendor-marketplace skill)
cd Adda_App  && npx eslint src scripts && npm run ui-lint \
             && node scripts/api-check.mjs http://localhost:3013 admin@addaapp.local DevAdmin12345 \
             && npm run ui-audit -- --build && npx expo export --platform android   # dry check, no APK
cd SocialPanel && npm run lint && npx vitest run && npm run build && API_BASE=http://127.0.0.1:3013 node scripts/api-check.mjs
cd Admin_Panel && npm run lint && npm test && npm run build && API_BASE=http://127.0.0.1:3013 node scripts/api-check.mjs
cd Backend && npm run check-secrets
```
Space API suites ~60 s apart (300 requests/min per IP). Report exact pass counts and anything not verified.
