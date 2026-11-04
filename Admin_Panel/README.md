# adda Master Admin

The platform owner's console. React 19 + Vite, react-router 7, Tailwind CSS 3 with the tokens from `template.html` ("Paces": dark sidebar, blue brand, Public Sans), Font Awesome 6 and Chart.js. Data comes only from `/api/v1/platform/*` (see `docs/backend/API.md`).

## How it works
- **Sign-in** (`/login`): email + password. Only `super_admin` accounts get in; a society admin's sign-in is refused and the session the server opened is ended at once. Forgot password: `node server.js create-super-admin --email <you>` on the server.
- **Master pages** (`/admin/*`): dashboard + insights, applications, societies, members directory, member profile (owner actions), accounts, listings, content reports, payments, audit, categories, notices, settings, My security.
- **Society workspace** (`/society/*`): the society-admin screens (copied from SocialPanel), acting on the society chosen with **Open workspace**. `src/lib/api.js` rewrites `/society/...` to `/platform/societies/:sid/manage/...` and, before any write, asks for a reason with `ReasonPromptHost`. A reason the screen already collected (reject, suspend, reverse …) is reused. The reason goes in the `X-Action-Reason` header and is audited by the server.
- Personal data arrives **masked** from the API; the member profile's **Reveal** needs a reason (audited).
- Session: tokens live in `sessionStorage` (tab-scoped), with refresh rotation, as in SocialPanel.

## Commands
```bash
npm ci
npm run dev          # http://localhost:5174, proxies /api to DEV_PROXY_TARGET (.env.development = live server!)
DEV_PROXY_TARGET=http://127.0.0.1:3013 npm run dev   # against a local backend
npm run lint && npm test && npm run build
npm run api-check    # LOCAL backend only (refuses production); seeds its own data
npm run e2e          # starts its own dev server on :5184 pinned to http://127.0.0.1:3013
npx playwright test -c playwright.qa.config.js       # screenshots → qa-screenshots/
```
Test scripts sign in as the dev owner (`admin@addaapp.local` / `DevAdmin12345`, override with `SA_EMAIL`/`SA_PASSWORD`) via `scripts/sa-login.mjs`.

## Deploy
Run `npm run build` and upload `dist/` to its own unadvertised domain, rewriting every non-file route to `/index.html`. Add the domain to the backend's `CORS_ORIGINS`. The production build calls `https://adda.skillinnovex.in` (`.env.production`). No secrets are bundled; `node server.js check-secrets` covers this folder.
