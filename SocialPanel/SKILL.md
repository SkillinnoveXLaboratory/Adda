---
name: socialpanel-engineering
description: Standards for the adda SocialPanel web portal (Society Admin + Super Admin). Read before changing anything in SocialPanel/. Covers the design tokens taken from template.html, component rules, API/auth rules, validation, accessibility, security and testing.
---

# SocialPanel engineering standards

`template.html` (in this folder) is the client's chosen design and the visual source of truth. Keep it; never
edit it. Everything in the app must look like it belongs to that page.

## 1. Design tokens (from template.html — do not invent new ones)
| Token | Value | Tailwind |
|---|---|---|
| Font | Poppins 300/400/500/600/700 (self-hosted via `@fontsource/poppins`) | `font-sans` |
| Purple (primary) | `#705ec8` | `azea-purple` |
| Purple dark (hover) | `#5c4ac7` | `azea-purpleDark` |
| Purple light (active nav, chips) | `#f0eeff` | `azea-purpleLight` |
| Heading text | `#2c2c2c` / gray-800 | `azea-text`, `text-gray-800` |
| Muted | `#9ba2b7` | `azea-muted` |
| Page background | `#f2f4f9` | `azea-bg` |
| Success | `#2dce89` | `azea-green` |
| Danger | `#ff5b51` | `azea-orange` |
| Info | `#1170e4` | `azea-blue` |
| Chart series 2 | `#01b8ff` | `azea-cyan` |
| Body copy | `#495057` | (body default) |

Gradients (exact): `bg-grad-purple` 135° #705ec8→#8d7ce6, `bg-grad-green` #19b159→#2dce89,
`bg-grad-orange` #fc5b23→#ff8338, `bg-grad-cyan` #01b8ff→#4bcfff. Defined once in `src/styles/index.css`.

Tailwind **v3.4** is used on purpose: the template was authored against the v3 CDN, and v4 renames/rescales
`shadow-sm`, `rounded-sm`, default border colours etc. Staying on v3 keeps every template class pixel-identical.

### Layout
- Sidebar: white, `w-64` (256px), `border-r border-gray-200`, logo row `h-16`, section titles
  `text-[10px] font-bold text-gray-400 uppercase tracking-wider`, items `text-xs px-3.5 py-2.5 rounded-lg`,
  active = `text-azea-purple bg-azea-purpleLight font-semibold`. Collapses to 70px (`.sidebar.collapsed`) via the
  hamburger on ≥ lg; on < lg it is an off-canvas drawer with a backdrop.
- Header: `h-16 bg-white border-b border-gray-100 px-6`, search pill, icon buttons `text-gray-500 hover:text-azea-purple`.
- Main: `p-4 sm:p-6` on `#f2f4f9`. Page title row: `text-xl font-bold text-gray-800 tracking-tight`; secondary
  button = white outline purple text, primary = purple filled (`px-3.5 py-1.5 text-xs font-semibold rounded-md shadow-sm`).
- Cards: `bg-white rounded-xl border border-gray-100 shadow-sm`, card titles
  `text-xs font-bold text-gray-500 uppercase tracking-wider`.
- Metric cards: gradient, `rounded-xl p-5 text-white`, label `text-xs text-white/80`, value `text-2xl font-bold`,
  footer `text-[11px]`, decorative sparkline at 70% white. Sparklines are drawn from real series when available,
  otherwise omitted — never fake trend numbers.
- Charts: Chart.js bar, `barThickness: 6`, `borderRadius: 2`, series purple `#705ec8` + cyan `#01b8ff`,
  grid `#f8fafc`, ticks Poppins 10px `#9ba2b7`, legend hidden (we render a small custom legend).
- Lists: "Recent activity" numbered circles (`w-8 h-8 rounded-full text-white text-xs font-bold`) cycling
  purple / emerald-500 / amber-400 / blue-500 / rose-500.
- Scrollbars: 4px, track rgba(0,0,0,.03), thumb rgba(0,0,0,.15).
- Brand: circular mark (`w-8 h-8 rounded-full border-[3.5px] border-azea-purple` + inner dot) + word **adda**.

### Responsive
Must render cleanly at 360, 768, 1280, 1920px: no horizontal page scroll, no clipped text. Tables live in
`overflow-x-auto` inside their card with sticky headers; forms stack to one column below `sm`.

## 2. Components (src/components)
Only our own components + Tailwind + Font Awesome 6 (npm) + Chart.js. No other UI kit.
- `Button` (variants primary/outline/ghost/danger, `loading` → spinner + disabled; never allow double submit).
- `Modal` / `Drawer` (Esc closes, backdrop click closes unless busy, focus first field, `role="dialog"`, `aria-modal`).
- `ConfirmDialog` / `ReasonDialog` for every destructive action (reason required where the API requires it).
- `DataTable` (sticky header, horizontal scroll, skeleton rows, empty state), `Pagination` (page/pages/total).
- `StatusBadge` — single map of status → colour so every page is consistent.
- `EmptyState` (icon + message + action), `ErrorState` (message + Retry), `Skeleton`.
- `useToast()` for success/failure; failures show the API `error.message` verbatim.
- `useQuery(fn, deps)` hook returns `{data, loading, error, reload}`; every page shows skeleton → data | empty | error+Retry.
- Disabled controls carry a `title` explaining why (role restriction, state).

## 3. API & auth rules
- Base URL from `VITE_API_BASE_URL` (+ `/api/v1`). Dev `http://localhost:3013`, prod `https://adda.skillinnovex.in`.
- Contract: `docs/backend/API.md`. Panel never calls endpoints outside it.
- Tokens kept in memory + `sessionStorage` (tab-scoped; cleared on logout). Never localStorage.
- On `401 TOKEN_EXPIRED`: single-flight `POST /auth/refresh`, store BOTH new tokens, retry once. Refresh failure,
  `SESSION_INVALID`, `ACCOUNT_DISABLED`, `TOKEN_INVALID` → clear session and go to `/login` with a message.
- `X-Society-Id` header is sent when a staff user has more than one society (header switcher); it only selects,
  never grants.
- File downloads (receipt PDF, reports) use authenticated `fetch` → `Blob` → object URL; never put tokens in URLs.
- Money: API is integer paise. Display with `Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'})`.
  Inputs are rupees → `Math.round(rupees*100)`. Dates displayed `en-IN` in `Asia/Kolkata`.
- Never fabricate data. When an integration is unavailable (online payments, email) say so plainly.

## 4. Roles (from API.md / server STAFF_PERMISSIONS)
| Role | Permissions |
|---|---|
| admin | everything |
| secretary | society.read, members, community, complaints, facilities, services, announcements, listings, reports, finance.read, audit |
| treasurer | society.read, finance, reports, members.read, audit |
| manager | society.read, complaints, facilities, services, community, members.read, listings |
| committee | society.read, members.read, announcements, finance.read, reports |
`src/lib/roles.js` mirrors this; nav items hide when the role lacks the read permission, and write controls are
disabled with a tooltip when it lacks the write permission. A 403 from the API is still handled gracefully.

## 5. Validation (src/lib/validation.js)
- Indian mobile `^[6-9]\d{9}$` (after stripping +91/0), PIN `^\d{6}$`, email, required, min/max lengths
  mirroring the server zod schemas, password ≥ 10 chars with letters and digits, amounts > 0 with ≤ 2 decimals.
- Validate before submit, show inline errors under the field, focus the first invalid field.

## 6. Accessibility
Labels on every input, `aria-label` on icon-only buttons, visible focus rings (`focus-visible:ring-2 ring-azea-purple/40`),
status conveyed by text not colour alone, dialogs trap Esc and restore focus, contrast ≥ 4.5:1 for body text.

## 7. Security
No secrets in the bundle (`VITE_*` holds only the public API URL). No `dangerouslySetInnerHTML`. Media links open
with `rel="noopener noreferrer"`. Access key / setup links are displayed once and never stored.

## 8. Testing
- `npm test` — vitest unit tests (API client refresh single-flight + logout-on-failure, guards, validation, money).
- `npm run api-check` — live contract check against the local backend (`http://127.0.0.1:3013`).
- `npm run e2e` — Playwright against Vite dev (5173) + local backend.
- `npm run qa:screens` — screenshots of every main page at 1440 and 390 px into `qa-screenshots/` (gitignored).
- `npm run build` must pass with zero errors.
Never point tests at production / Atlas.
