---
name: platform-subadmins
description: Use when touching Master Admin (Admin_Panel) pages, platform (/platform/*) routes, or sub-admin accounts. Defines the permission catalogue (view / manage per area), the server guards, how the panel hides pages and buttons, and the dry checker (`npm run subadmin-check`) that must pass. Any new platform route or Master Admin page/button must be mapped to a permission here.
---

# Master Admin sub-admins and permissions

The platform owner (`platformRole: 'super_admin'`) creates **sub-admins** (`platformRole: 'sub_admin'`) in Master Admin →
**Sub-admins**: name, email, password, and ticked permissions. A sub-admin signs in at the same Master Admin login and
sees **only** the pages and buttons the owner ticked. Owner-only, never grantable: the Sub-admins page itself.

## 1. Permission catalogue (source of truth: `PLATFORM_PERMISSIONS` in `Backend/server.js`)
Each area has `area.view` (see the page, read APIs) and, unless view-only, `area.manage` (the page's action buttons,
write APIs). **`manage` always includes `view`** (`normalizePlatformPermissions`). Unknown strings are dropped.

| Area | view | manage |
|---|---|---|
| dashboard | totals + insights | — |
| applications | list/detail | review, approve, reject |
| societies | list, detail (read only) | suspend/reactivate, payments, add admins, reset links, every write inside the workspace |
| members | directory, profile (masked) | reveal, set password, sign out everywhere, change mobile, move membership |
| accounts | all accounts | enable / disable |
| vendors | list, detail (masked) | KYC approve/reject, reveal KYC |
| service_bookings | list + settlement | — |
| earnings | NIVASA commission earnings, top vendors, paid jobs | — |
| listings | list | moderate |
| ads | list/detail | approve/reject |
| coupons | list/detail | create, edit, on/off, delete |
| reports | content reports | — |
| payments | payments monitor | — |
| audit | audit log | — |
| categories | list | add/edit/delete |
| announcements | list | publish/archive |
| settings | list | change |

## 2. Server rules (enforcement lives here — the UI only hides)
- `platformRouter.use(authenticate, requireSuperAdmin)` admits owner + sub-admin on a **panel** session only.
- **Every** `platformRouter.get/post/put/patch/delete` line carries `requirePlatformPerm('<area>.<view|manage>')` or
  `requireOwner`. The only exception is `GET /overview` (badge counts), which deletes counts the caller can't view.
- Society workspace (`/platform/societies/:sid/manage/*`): `loadPlatformSociety` checks `societies.view` for GET and
  `societies.manage` for writes.
- Permissions are read from the user document on **every request** → a change or disable applies immediately;
  disabling also revokes sessions.
- Sub-admins can't be society staff, can't sign in to SocialPanel, and can't be changed from Accounts / Members
  (only on the Sub-admins page). The owner account is never editable from the panel.
- Denied → `403 PERMISSION_DENIED` ("You don't have permission for this. Ask the platform owner."); owner-only →
  `403 OWNER_ONLY`. Every sub-admin change is audited (`platform.subadmin_*`); actions taken by a sub-admin carry
  `actorRole: 'sub_admin'` in the audit log.

## 3. Panel rules (Admin_Panel)
- `useAuth()` exposes `isOwner`, `isPlatformAdmin`, `permissions`, `canView(area)`, `canManage(area)` (owner → true).
- **Sidebar**: each `PLATFORM_NAV` item has `area`; hidden unless `canView(area)`. Sub-admins nav item: owner only.
- **Routes**: each platform route is wrapped in a guard; without permission → "No access" page (not a crash, not a
  blank page). `/admin` (dashboard) without `dashboard.view` shows a welcome card listing what they can open.
- **Buttons**: every write action (approve, reject, create, edit, delete, toggle, reveal, set password, …) is
  rendered only when `canManage(area)`. View-only users still see lists, filters, search and detail drawers.
- Society workspace (the reused society-admin screens): "Open workspace" is shown only with `societies.manage`;
  `/society/*` routes redirect to `/admin/societies` without it. With `societies.view` only, the societies list and
  detail are read-only (no suspend / payments / add admin / workspace buttons).
- A 403 `PERMISSION_DENIED` from the API refreshes `/me` so a changed permission set takes effect without re-login.
- Footer label shows "Sub-admin" for sub-admins, "Platform owner" for the owner.

## 4. Sub-admins page (owner)
- List: name, email, status, permission count, last sign-in. Actions: Edit permissions, Set password, Disable/Enable.
- Create/Edit form: name, email (create only), password (create only; ≥10 chars, letters + numbers; show/hide), and a
  permission grid — one row per area with **View** and **Manage** checkboxes (Manage ticks View; unticking View
  unticks Manage; view-only areas show "—" for Manage). "Select all" / "Clear". At least one permission required.
- Errors in place: email taken (409 `EMAIL_TAKEN`), weak password, no permission ticked.

## 5. Dry checker — must pass before "done"
```
cd Backend && node server.js dev:db                     # local replica set on 27027 — never Atlas
MONGODB_URI="mongodb://127.0.0.1:27027/?replicaSet=rs0" PORT=3013 ... node server.js
cd Admin_Panel && API_BASE=http://127.0.0.1:3013 npm run subadmin-check
```
`scripts/subadmin-check.mjs` checks: validation (weak password, duplicate email, no permissions, unknown permission
dropped, manage → view), owner-only routes (sub-admin gets 403 OWNER_ONLY), **a full matrix**: for every area a
sub-admin with only `area.view` can call that area's read route and gets 403 on its write route and on every other
area; with `area.manage` the write route passes the guard; workspace read vs write; badge counts filtered; permission
change applies without re-login; disable revokes the session; sub-admin can't sign in to SocialPanel-style flows as
staff and can't be changed from Accounts; audit entries written. It also **parses `server.js`** and fails if any
`platformRouter` route lacks a permission guard.

Also run: `npm run lint && npm test && npm run build && npm run api-check` (Admin_Panel), SocialPanel lint/build,
`cd Backend && npm run check-secrets`, and look at screenshots of the Sub-admins page and a sub-admin's sidebar at
1440 px and 390 px.
