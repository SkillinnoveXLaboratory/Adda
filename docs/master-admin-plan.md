# Master Admin Panel — feature plan

**Goal:** give the platform owner (Super Admin) complete, controlled authority over every society, member and record on AddaApp. That means seeing everything, fixing anything, and stepping in when a society admin can't. Every sensitive view and action is logged, so this power can be audited.

**Where it lives:** `Admin_Panel/` (Master Admin, owner-only, email + password sign-in), backed by `/api/v1/platform/*`. The old Super Admin pages were removed from SocialPanel.

**Built (2026-10-27):** Phases 1 + 2 with the decisions in §6 (owner only; typed reason to reveal; owner sets passwords). Two-step sign-in was built and then **removed on request (2026-10-29)**: the owner signs in with email + password only. See STATUS.md for what is and isn’t done.

---

## 1. What exists today vs. what's missing

| Area | Today | Gap |
|---|---|---|
| Society applications | Review, approve, reject | — |
| Societies | List, summary (staff, resident count, finance totals), suspend/reactivate, add admin, payment settings | **Can't open a society's members, flats, bills, complaints, bookings, posts or ledger.** Can't edit the society profile or settings |
| Users | List, disable/enable | No user detail page, no password reset for residents, no session control, no membership history |
| Members | — | **No cross-society member management** (approve, move flat, remove, change owner/tenant) |
| Finance | Payment list, totals | No per-society invoices/ledger view, no platform-wide dues view, no exports |
| Content | Listings moderation; reports are view-only | Can't hide or remove community posts or comments platform-wide |
| Communication | Platform notices | No targeted broadcast (one society / all admins / all residents) |
| Platform team | Single all-powerful role | No platform staff roles (support, finance, moderator) |
| Security & compliance | Audit log | No "who viewed personal data" log, no 2FA, no data-export/deletion requests |
| Operations | — | No system health, background job status or storage usage |

---

## 2. Principles (so full control stays safe and lawful)

1. **See everything, change through the same rules.** The Super Admin uses the same validated endpoints and state machines as society admins (billing, ledger and complaint transitions). There are no direct database edits and no "set paid" button.
2. **Financial history stays append-only.** Corrections are reversals and adjustments with a reason, exactly as for society admins.
3. **Personal data is masked by default.** Phone numbers and emails show as `98•••••210` in lists. "Reveal" requires a reason and is logged (*who, whose data, why, when*). This supports India's DPDP Act 2023 obligations.
4. **Every privileged action needs a reason** (suspend, remove, reset password, impersonate, refund) and is written to the immutable audit log.
5. **No silent impersonation.** "View as society admin" is read-only, time-limited (30 min), shown with a banner, and logged.
6. **Least privilege for the platform team.** Not every platform staff member needs full power (see §4).

---

## 3. Features

### 3.1 Platform dashboard (enhanced)
- KPI cards: active and suspended societies, residents, pending applications, pending memberships (all societies), open complaints, overdue dues (₹), collected this month (₹).
- Charts:
  - new residents per month;
  - billed vs. collected per month (platform-wide);
  - complaints opened vs. resolved.
- "Needs attention" queue:
  - applications waiting more than 3 days;
  - societies with no active admin;
  - societies with more than 30% overdue;
  - complaints older than 14 days;
  - reported content.
- Top 10 societies by size, by dues and by complaints.

### 3.2 Society 360° view (`/admin/societies/:id`) — the core of "full control"
A tabbed page per society; every tab reads live data.

| Tab | Shows | Super Admin can |
|---|---|---|
| Overview | Profile, code, status, admins, KPIs, recent activity | Edit profile and contact, suspend/reactivate with reason, transfer ownership to a new admin |
| Members | Every resident: name, masked phone, flat, owner/tenant/family, status, joined, last login | Approve, reject, suspend or remove (reason required); move to another flat; change type; reveal contact (logged); export |
| Buildings & flats | Buildings, flats, occupancy, per-flat maintenance | Add or edit buildings and flats (same validation) |
| Staff | Admins and committee with roles, last login | Add or remove staff, change role, issue a reset link, disable |
| Billing | Invoices by period, status, overdue | View invoice detail; cancel a wrong invoice (reason); record an offline payment on the office's behalf (reason) |
| Payments & ledger | Payments, receipts, ledger with balances | Reverse or adjust with reason only (append-only); download receipts |
| Complaints | All complaints with timeline | Reassign, change status within allowed steps, add an official remark |
| Community | Posts, comments, polls, reports | Hide, remove or restore with reason; close polls |
| Facilities & bookings | Facilities, schedule, bookings | Cancel a booking (reason), edit facility rules |
| Services | Service requests | Change status, add notes |
| Listings | This society's property and marketplace listings | Approve, reject or remove |
| Reports | Every society report (collection, dues, ledger, audit summary) | Generate PDF/XLSX |
| Audit | This society's audit trail | Filter and export |
| Settings | Billing settings, listing/booking approval rules, online-payment config | Change with reason |

### 3.3 Members directory (all societies) — `/admin/members`
- Search by name, phone, email, flat or society; filter by status, type and society.
- Member profile:
  - personal details (masked unless revealed);
  - every membership and its history: requested, approved, moved, removed, with who did each;
  - flats held;
  - invoices and payments;
  - complaints, bookings, posts and listings;
  - active sessions and devices;
  - notifications sent.
- Actions, each with a reason:
  - **reset password** (essential while sign-in is phone + password with no OTP);
  - sign out all devices;
  - disable or enable the account;
  - merge a duplicate account (same person, two numbers);
  - correct the phone number after verification.

### 3.4 Platform team & roles — `/admin/team`
| Role | Can |
|---|---|
| Owner | Everything, including managing the platform team and settings |
| Operations | Societies, members, applications, staff, complaints; no finance writes |
| Finance auditor | Read all finance, generate reports and exports; no edits |
| Moderator | Listings, posts, comments, content reports |
| Support | Read-only 360° views; can reset passwords and resend links |

Invite by email with a setup link, disable, change role. Two-factor sign-in (authenticator app) is mandatory for Owner and Operations.

### 3.5 Communication centre — `/admin/broadcasts`
- Compose a notice and choose the audience:
  - all residents;
  - all society admins;
  - one or more societies;
  - one city.
- Delivery: in-app notification, plus push once a push build exists.
- Schedule for later, preview, and see delivered and read counts.
- Templates for maintenance windows, policy updates and app releases.

### 3.6 Finance oversight — `/admin/finance`
- Platform-wide billed, collected and overdue figures, by society and by month.
- Online payments monitor once Razorpay is enabled: failed payments, refunds, reconciliation mismatches.
- Society settlement setup: Route linked account, verification date, who enabled it.
- Exports: CSV/XLSX for any table; audit-supporting statement per society per period.

### 3.7 Moderation centre — `/admin/moderation`
- One queue for reported posts, comments, property and marketplace listings, across all societies.
- Actions: dismiss, hide, remove, warn the user, or disable the user, each with reason and user notification.
- Repeat-offender view: users with several upheld reports.

### 3.8 Configuration — `/admin/settings`
- Complaint, service and marketplace categories (exists today).
- Platform rules:
  - listing approval required;
  - booking approval defaults;
  - support email and phone;
  - terms and privacy links shown in the app.
- Feature switches:
  - resident password sign-in on or off;
  - OTP sign-in when SMS keys exist;
  - online payments;
  - marketplace on or off.
- Maintenance mode banner for app and panel.

### 3.9 Security, privacy & compliance — `/admin/security`
- **Access log:** who revealed or exported whose personal data, when, and why.
- **Audit log:** every privileged change, filterable and exportable, with tamper-evident hashes (already built).
- **Data requests:** a resident asks for a copy of their data, or deletion. The plan is to:
  - export their data as JSON/PDF;
  - anonymise the account while keeping financial records, which the law requires, with names replaced.
- **Sessions:** list active admin sessions; force sign-out.
- **Security events:**
  - failed sign-ins;
  - locked accounts;
  - suspicious activity (many failed logins from one IP).

### 3.10 System health — `/admin/system`
- API status, database status, server uptime and version.
- Background jobs: last auto-billing run per society, reminders sent, failures.
- Storage: uploads used, largest societies.
- Error rate over the last 24 hours, read from the server logs.

---

## 4. Backend work needed (new `/api/v1/platform/*` endpoints)

| Feature | Endpoints (examples) |
|---|---|
| Society 360° | `GET /platform/societies/:id/members`, `/flats`, `/invoices`, `/payments`, `/ledger`, `/complaints`, `/posts`, `/bookings`, `/service-requests`, `/reports/:type`. Write actions reuse the society logic with `societyId` taken from the URL, **allowed only for platform roles** |
| Members | `GET /platform/members`, `GET /platform/users/:id` (full profile), `POST /platform/users/:id/reset-password`, `/sign-out-all`, `/memberships/:id/move`, `/merge` |
| Personal-data reveal | `POST /platform/users/:id/reveal {reason}` returns the unmasked phone and email and writes an access-log entry |
| Platform roles & 2FA | `PlatformStaff` model (role), TOTP enrolment and verification at admin login |
| Broadcasts | `POST /platform/broadcasts`, scheduled job, delivery stats |
| Moderation | `POST /platform/posts/:id/moderate`, `/comments/:id/moderate` |
| Data requests | `POST /platform/users/:id/export`, `/anonymise` |
| Read-only "view as admin" | `POST /platform/societies/:id/view-session {reason}` returns a short-lived read-only token |
| System | `GET /platform/system/health`, `/jobs`, `/storage` |

Security rule: platform endpoints check the **platform role** for each action. The society-scoped checks used by society admins stay unchanged.

---

## 5. Delivery phases

| Phase | Scope | Why first |
|---|---|---|
| **1 — Full visibility** | Society 360° view (all tabs read-only), members directory, member profile, masked data + logged reveal | Owner can see every society and member immediately |
| **2 — Control actions** | Member actions (approve, move, remove, **reset password**, sign-out), society profile and settings edit, staff management, complaint/booking/post interventions, reason + audit on all | Lets the owner fix problems without asking the society |
| **3 — Platform team & security** | Platform roles, 2FA, access log, session control, security events | Required before giving anyone else admin access |
| **4 — Communication & moderation** | Broadcast centre, unified moderation queue | Platform-wide reach |
| **5 — Finance & exports** | Finance oversight, exports, data requests, system health | Reporting and compliance |

Each phase finishes only when:
- API checks and E2E tests pass;
- role-restriction tests pass (a Support user cannot do Owner actions; a society admin still can't reach `/platform`);
- every action appears in the audit log;
- screenshots at 360–1920 px have been reviewed.

---

## 6. Decisions needed from you
1. **Platform roles:** do you want the five roles in §3.4, or just Owner for now?
2. **Reveal personal data:** require a typed reason every time (recommended), or show it openly to the Owner only?
3. **Password reset for residents:** the admin sets a temporary password that the resident must change, or a one-time reset link shown to the admin to share?
4. **2FA:** mandatory for all platform staff from day one (recommended)?
5. **Phase order:** start with Phase 1 + 2 together?
