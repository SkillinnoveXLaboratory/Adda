# adda SocialPanel

Web portal for **Society Admins** and their staff roles. (The platform owner uses the Master Admin panel in `../Admin_Panel`; an owner sign-in here is refused with a pointer to it.) React 19 + Vite,
react-router 7, Tailwind CSS 3 (theme tokens from `template.html`), Font Awesome 6 and Chart.js — no other UI kit.
Every number, list and chart comes from the AddaApp API (`docs/backend/API.md`).

`template.html` is the client's chosen design and the visual reference; keep it in this folder.
Engineering standards: [`SKILL.md`](./SKILL.md). Checklist and verification log: [`TASKS.md`](./TASKS.md).

## Requirements
- Node.js ≥ 22.12 (verified on 22.18) and npm 10+
- A running AddaApp backend (local: `cd ../Backend && npm run dev:db` + `npm run dev`, port 3013)

## Setup
```bash
cd SocialPanel
npm install
npx playwright install chromium   # only needed for e2e / screenshots
npm run dev                       # http://localhost:5173 (strict port)
```

## Environment
Only one variable, and it is **public** (compiled into the bundle) — never put secrets here.

| File | `VITE_API_BASE_URL` |
|---|---|
| `.env.development` | `http://localhost:3013` |
| `.env.production` | `https://adda.skillinnovex.in` |
| `.env.example` | template |

The app calls `${VITE_API_BASE_URL}/api/v1/...`. Use `.env.local` / `.env.production.local` (gitignored) to override.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on 5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve `dist/` on 4173 |
| `npm test` | Vitest unit tests (API client refresh/single-flight/logout, route guards, validation, money/date formatting, roles, flat numbering) |
| `npm run lint` | ESLint |
| `npm run api-check` | Live contract check of every endpoint the panel uses against a **local** backend (`API_BASE`, default `http://127.0.0.1:3013`; refuses production). Writes `.e2e-state.json` with the accounts it created. |
| `npm run e2e` | Playwright end-to-end tests (Vite dev + local backend) |
| `npm run qa:screens` | Screenshots of every page and key dialogs at 1440 px and 390 px into `qa-screenshots/` (`QA_WIDTHS=360,768,1920` / `QA_ONLY=billing` to narrow) |

Local test accounts: API checks seed their own societies; the dev owner `admin@addaapp.local` (backend `create-super-admin`) is only used by the API check and E2E to approve applications (`scripts/sa-login.mjs`). E2E runs its own dev server on :5183 pinned to the local API.
`api-check` creates a fresh society with an admin and a treasurer (credentials in `.e2e-state.json`).

> The backend rate-limits sign-in endpoints (20 per 15 min per IP) and public forms (60 per hour). `api-check`
> and `e2e` are written to stay within that, but running them repeatedly back-to-back can hit HTTP 429 — wait and re-run.

## Deploying
The build is a static single-page app.

```bash
npm ci && npm run build      # uses .env.production → https://adda.skillinnovex.in
```

Upload the contents of `dist/` to any static host. Requirements:

1. **SPA fallback** — every path that is not a real file must serve `/index.html` (routes such as `/society/billing`,
   `/status` and `/set-password?token=…` are client-side).
   - **OpenLiteSpeed**: in the virtual host (or `.htaccess` with rewrite enabled):
     ```apache
     RewriteEngine On
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule ^ /index.html [L]
     ```
     Set long cache headers for `/assets/*` (hashed filenames) and `no-cache` for `index.html`.
   - **Nginx**: `try_files $uri $uri/ /index.html;`
2. **CORS** — the backend's `CORS_ORIGINS` must include the panel's exact origin, e.g.
   `CORS_ORIGINS=https://panel.example.com` (comma-separated for several).
3. **Setup links** — set the backend's `PANEL_BASE_URL` to the panel origin so staff invite / reset / approval links
   (`/set-password?token=…`) open this app.
4. Serve over HTTPS.

## Security notes
- Tokens live in memory + `sessionStorage` (tab-scoped, cleared on sign-out); access tokens are refreshed once
  (single-flight) on `TOKEN_EXPIRED` with rotation; any refresh failure, `SESSION_INVALID` or `ACCOUNT_DISABLED`
  signs the user out.
- Files (receipts, reports) are fetched with the `Authorization` header and saved from a Blob — tokens never go in URLs.
- `cd ../Backend && npm run check-secrets` verifies no backend secrets are present in this folder.
