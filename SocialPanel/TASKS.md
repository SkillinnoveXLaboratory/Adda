# SocialPanel — task checklist

Legend: `[x]` verified (build + lint + unit + api-check + e2e and/or screenshot review — see log) · `[~]` built, verification partial · `[ ]` not done.

## Foundation
- [x] Vite + React 19 + react-router 7 + Tailwind 3 (template tokens) + Font Awesome 6 + Chart.js — `npm run build` passes
- [x] API client: base URL env, error normalisation, single-flight refresh, logout on refresh failure / SESSION_INVALID / ACCOUNT_DISABLED, X-Society-Id — unit tests
- [x] Auth context + route guards (public / super admin / staff) — unit tests
- [x] App shell from template: sidebar (collapse 70px, mobile drawer), header (search, fullscreen, notifications, society switcher, user menu/logout)
- [x] UI kit: Button, Modal, Drawer, Confirm/Reason dialogs, Toasts, DataTable (sticky header + h-scroll), Pagination, StatusBadge, Empty/Error/Skeleton, MetricCard, BarChart, form fields

## Public / onboarding
- [x] Login (`/auth/admin/login`) + links to register / status + forgot password (`/auth/password/reset-request`, honest message) — AC: wrong password shows API message; success routes by role
- [x] Registration wizard: Society → Address → Representative → Documents (upload ≤8MB jpg/png/webp/pdf) → Review → submit — AC: inline validation per step, reference code + access key shown once with copy + download, link to status prefilled
- [x] Status page: timeline, rejected reason, approved details, activation form (`activation==='required'`) → sign-in with email prefilled; `done` → sign-in button
- [x] `/set-password?token=` (`/auth/password/setup`)

## Super Admin
- [x] Dashboard: metric cards (/platform/overview), chart (payments30d / billing), recent registrations
- [x] Society applications: status filter, detail drawer (representative, documents), review, approve (code + setup link), reject with reason
- [x] Societies: search/filter, detail (staff, finance summary), suspend/reactivate, add admin, reset link, online payments config
- [x] Users: search, filter, disable/enable with reason
- [x] Listings moderation: property/marketplace, pending/approved/rejected/removed, reported, approve/reject/remove
- [x] Content reports
- [x] Categories CRUD (complaint/service/marketplace)
- [x] Platform announcements create/archive
- [x] Settings
- [x] Audit log
- [x] Payments monitor

## Society Admin
- [x] Dashboard: residents, pending approvals, outstanding, collected this month; 6-month billed vs collected chart; complaint breakdown; recent complaints; quick links
- [x] Society profile & settings + billing settings
- [x] Buildings & flats: add/edit building, bulk generator with live preview, edit flat (maintenance override), residents per flat
- [x] Resident approvals (approve / reject with reason) + directory (suspend / remove with reason)
- [x] Staff: invite (setup link once), change role, disable/enable, regenerate link
- [x] Billing: charge heads CRUD, generate bills → summary, invoices table + filters + totals, invoice drawer, record offline payment, cancel, reminders, online-payments-unavailable banner
- [x] Payments: list, reverse offline with reason, receipt PDF via authenticated blob (online refund UI built; untestable without a gateway — no online payments exist locally) 
- [x] Expenses (attachment, void with reason) + other income
- [x] Ledger: filters, opening balance once, adjustments, reverse
- [x] Reports: type + params → table preview, PDF/XLSX download, notes/disclaimer
- [x] Complaints: filters, detail timeline + media, assign, allowed transitions only, remarks
- [x] Announcements: create / edit / archive
- [~] Community: posts (incl. reported) hide/remove/restore, content reports dismiss/hide/remove, polls create/close with results — API verified by api-check; UI verified visually, not covered by e2e
- [x] Facilities CRUD + bookings approve/reject/cancel
- [x] Service requests: status transitions
- [x] Listing moderation
- [x] Categories (society-specific complaint/service)
- [x] Audit log
- [x] Role-aware navigation (treasurer cannot manage buildings → hidden/disabled, 403 handled)

## Verification
- [x] `npm test` (vitest)
- [x] `npm run api-check` (live, local backend)
- [x] `npm run e2e` (Playwright)
- [x] Visual QA screenshots 1440 / 390 reviewed and fixed
- [x] `npm run build`
- [x] README (setup, env, scripts, deploy incl. OpenLiteSpeed SPA rewrite + CORS_ORIGINS)

## Log
| Date | Entry |
|---|---|
| 2026-10-26 | Foundation, all public / super-admin / society pages built. Tailwind 3.4 (template parity), React 19.3, Vite 8, react-router 7.18, Chart.js 4, FA 6.7. |
| 2026-10-26 | `npm run api-check` → **369/369 passed** (local backend, real JWTs: super admin, society admin, treasurer, 3 residents). Earlier run exposed the PATCH-defaults backend bug (lead fixed it; panel still sends full objects on edit). |
| 2026-10-26 | `npm test` → **28/28 passed** (4 files). `npm run lint` → 0 problems. `npm run build` → OK. |
| 2026-10-26 | `npm run e2e` → **11/11 passed** (onboarding wizard → status → SA approval → activation → login → buildings/bulk flats → charge → generate bills → payment + receipt PDF → notice → resident approval → complaint assign/progress/resolve → dashboard numbers → logout; treasurer role restrictions). Found + fixed a real bug: bulk-flat result dialog reset when the buildings list reloaded. |
| 2026-10-26 | `npm run qa:screens` → 46 shots @1440 + 45 @390 (+ 360/768/1280/1920 spot checks) reviewed; fixed metric-card wrapping (container query), month inputs (PeriodSelect), clipped table actions (staff, ledger, listings), plural labels, 768/1280 tile grids. |
| 2026-11-06 | **Vendor-only property/service listings.** Listings page: Marketplace is the default tab; Property/Services tabs (older society-linked resident listings) show a note that new vendor listings are reviewed by the platform; tabs show pending counts that add up to the sidebar badge. "Listings need approval" now describes marketplace listings. api-check: residents get 403 `VENDOR_ONLY` for property/service, vendor (KYC-approved) gets 403 `VENDOR_NO_SOCIETY` on membership + /resident/home, vendor listings never in /society/listings, society admin 404 on vendor listings, marketplace moderation + badge = tab sum; paced under the 300 req/min limiter. Playwright: `E2E_PORT` override, dev server pinned to the proxy (`VITE_API_BASE_URL=/`, lost with the deleted .env.development). E2E approves a marketplace item instead of a service. Verified on a local backend (:3019): api-check **443/443**, e2e **11/11**, unit **29/29**, lint 0, build OK, listings screenshots @1440/@390 (no page overflow). |
