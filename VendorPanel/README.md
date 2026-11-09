# Nivasa Vendor Panel

The website where **vendors** (businesses that list services and properties) sign up, complete KYC, list, take
bookings, record cash, see their settlement with NIVASA and boost posts. Vendors can't use the member app.
React 19 + Vite + Tailwind + react-router, same layout and components as SocialPanel, purple theme.
Spec: `../skills/vendor-panel/SKILL.md` · API: `../docs/backend/API.md`.

## Run locally
```
npm install
DEV_PROXY_TARGET=http://127.0.0.1:3013 npm run dev     # http://localhost:5175 (proxies /api and /media)
```
Without `DEV_PROXY_TARGET`, `npm run dev` proxies to the live API. `npm run preview` serves the build on 4175.

## Environment
| Variable | Where | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `.env.production`, `.env.example` | `/` = same origin (Vercel rewrites `/api`, `/media`). Missing → `/`. Public value only. |
| `DEV_PROXY_TARGET` | shell, dev only | Backend that the Vite dev server forwards to. |

`.env.*` files other than `.env.example` are git-ignored. Never put secrets here (`cd ../Backend && npm run check-secrets`).

## Checks (local backend only — never Atlas)
```
npm run lint && npm test && npm run build
API_BASE=http://127.0.0.1:3013 npm run e2e          # own Vite on 5185 → local API
API_BASE=http://127.0.0.1:3013 npm run ui-audit     # 390 + 1440 px; SHOTS_DIR=<dir> saves screenshots
node scripts/vendor-check.mjs http://localhost:3013
```
The API allows 300 requests/min per IP: leave ~60 s between suites. The e2e and audit suites set the platform
commission to 10% while they run and restore the previous value.

## Deploy (Vercel)
New project from this repo with **Root Directory = `VendorPanel`**, framework Vite (build `npm run build`,
output `dist`). Set `VITE_API_BASE_URL=/`. `vercel.json` rewrites `/api/*` and `/media/*` to
`https://adda.skillinnovex.in` and sends every other path to `index.html`. Optionally set `VENDOR_PANEL_URL` on the
backend so the member app links vendors here.
