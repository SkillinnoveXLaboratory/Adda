---
name: multi-tenant-society-security
description: Use whenever code reads or writes society-scoped data (flats, members, bills, payments, complaints, notices, visitors, documents, reports) in Backend/, or adds admin features in SocialPanel/. Enforces that societyId is derived from server-verified membership/admin assignment and never from client input, plus cross-tenant leak prevention for files, reports, push, and jobs.
---

# Multi-Tenant Society Security

## Purpose and scope
Each society is a tenant. A resident or Society Admin must never read or modify another society's data, and a
resident must only see their own flat's private data (bills, payments, documents). Super Admins operate across
societies only through explicit super-admin endpoints. Applies to every Backend route, job, report, file, and push.

## Core rule
> `societyId` used in any query comes from `req.society` set by `societyContext` middleware after verifying the
> caller's Membership or AdminAssignment. It is NEVER read directly from `req.body`, `req.query`, headers, or the
> JWT payload as authority.

A client may *select* a society (e.g. the `X-Society-Id` header) when it belongs to
several, but the server must verify that selection against DB records before use.

## societyContext middleware
```js
// after authenticate
export const societyContext = ({ roles }) => async (req, res, next) => {
  const requested = req.params.societyId;               // selection only
  const ctx = await tenancyService.resolve(req.auth.userId, requested, roles);
  if (!ctx) throw new AppError(403, 'FORBIDDEN', 'No access to this society'); // or 404 to avoid enumeration
  req.society = { id: ctx.societyId, role: ctx.role, flatIds: ctx.flatIds };
  next();
};
```
- `resolve` checks `Membership { userId, societyId, status: 'active' }` for residents or
  `AdminAssignment { userId, societyId, active: true }` for admins. Super admins pass only on routes declared
  super-admin.
- Suspended society (`Society.status !== 'active'`) blocks resident/admin access except read of own receipts.

## Query standards
- Repository/service functions take `societyId` as the first argument and always include it in the filter:
  `Bill.findOne({ _id: billId, societyId })` - never `findById(billId)` followed by a check (leaks existence
  via timing and is easy to forget).
- Resident-private resources also filter by flat/user: `{ societyId, flatId: { $in: req.society.flatIds } }`.
- Creates set `societyId` server-side: `Model.create({ ...validatedBody, societyId: req.society.id })`; zod
  `.strict()` rejects `societyId` in body.
- Updates/deletes filter by `{ _id, societyId }` and check `matchedCount`; 0 -> 404.
- Aggregations: first stage `$match: { societyId }`. `$lookup` pipelines also match `societyId`.
- Use a Mongoose plugin that throws in non-production if a find/update on a society-scoped model lacks `societyId`
  in the filter (guard rail, not a replacement for correct code).
- Cross-society return value for wrong-tenant IDs: 404 `NOT_FOUND` (do not reveal existence).

## Other leak vectors
- **Files/documents**: storage keys prefixed `societies/<societyId>/...`; downloads go through an authorized
  endpoint or short-lived signed URLs (<= 5 min) generated after tenancy check. No public buckets.
- **Reports (PDF/Excel)**: generated from queries scoped by `req.society.id`; filename includes society code;
  export endpoints admin-only and audited.
- **Push notifications**: recipient token lists built from `{ societyId, userId in members }`; never broadcast
  by token list provided by client.
- **Jobs**: billing/reminder jobs iterate per society and pass `societyId` explicitly to every query; job lock key
  includes `societyId`.
- **Search/autocomplete/directory**: scoped and respects member privacy settings (hide phone if opted out).
- **Caching**: cache keys include `societyId` (and userId for private data).
- **Logs**: include societyId for traceability; no cross-tenant data dumps in error details.
- **Super Admin**: separate router `/api/v1/platform/*` with `requireRole('super_admin')`; all actions audited.

## Service-layer pattern (reference)
```js
// services/complaint.service.js
export async function getComplaint(ctx, complaintId) {
  const filter = { _id: complaintId, societyId: ctx.societyId, deletedAt: null };
  if (ctx.role === 'resident') filter.flatId = { $in: ctx.flatIds };
  const doc = await Complaint.findOne(filter).lean();
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Complaint not found');
  return doc;
}
// controller
export const show = async (req, res) =>
  res.json({ data: await getComplaint(
    { societyId: req.society.id, role: req.society.role, flatIds: req.society.flatIds },
    req.validated.params.id) });
```
- Pass a `ctx` object (never `req`) into services so jobs and tests can supply the same scoped context.

## SocialPanel specifics
- Society Admin UI shows only societies from `/auth/me` assignments; switching society refetches all data and
  clears client caches.
- Route guards are UX only; every API still enforces tenancy.

## Implementation checklist
- [ ] Route uses `authenticate` + `societyContext` (or explicit super-admin router)
- [ ] All queries include `societyId: req.society.id` (and flat/user filter for private data)
- [ ] zod body schemas `.strict()`; `societyId`, `role`, `status` not client-writable
- [ ] Wrong-tenant IDs return 404
- [ ] Files/reports/push/jobs scoped by societyId
- [ ] Admin mutations write AuditLog
- [ ] Cross-tenant tests added

## Required tests
Every society-scoped endpoint gets a cross-tenant test using two seeded societies (A, B):
```bash
cd Backend
npx vitest run tests/security/tenancy.test.js
```
- Resident of A fetching bill of B by id -> 404; listing never includes B's documents.
- Admin of A updating complaint of B -> 404; DB unchanged.
- Body containing `societyId: B` on create -> 400 (strict) and nothing created in B.
- Resident of flat A-101 cannot read A-102's bills/payments/receipts.
- Admin of A exporting report contains only A rows (parse generated Excel with exceljs in test).
- Inactive membership -> 403. Suspended society -> 403.
- Optional: automated route sweep - iterate registered routes and assert each society-scoped route has
  `societyContext` in its middleware stack.

## Common failure modes and recovery
| Symptom | Cause | Recovery |
|---|---|---|
| Admin sees other society's data | `findById` without societyId, or societyId from query string | Refactor to `{ _id, societyId: req.society.id }`; add regression test |
| Data created under wrong society | `...req.body` spread included `societyId` | `.strict()` schema; set societyId last server-side |
| Aggregation leaks | `$lookup` without societyId match | Add `$match` in lookup pipeline |
| Report includes all societies | Job/report built without scope | Pass societyId explicitly; test row counts |
| Resident still has access after moving out | Membership not deactivated / tokens still valid | Deactivate membership; context check is DB-backed per request |
| Incident: cross-tenant exposure found | - | Patch, rotate affected signed URLs, review AuditLog/pino logs for access by requestId, notify affected society admins per policy |

## Definition of done
- Every new society-scoped route has passing cross-tenant tests.
- Code review confirms no client-sourced societyId used as authority.
- Files, reports, notifications, and jobs verified to be tenant-scoped.
- Audit entries written for admin mutations.
