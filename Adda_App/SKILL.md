---
name: adda-app-resident
description: Standards for the AddaApp resident app (Expo SDK 58, Expo Router, JavaScript). Read before changing any screen, component, API call or build setting in Adda_App/.
---

# AddaApp resident app — engineering & design standards

## Stack (do not mix in alternatives)
- Expo SDK **58.0.16**, React Native 0.88, React 19.3, **Expo Router** (routes in `src/app/`). No React Navigation stacks outside Expo Router.
- Install native modules only with `npx expo install <pkg>` and only modules that ship in **Expo Go** (the app must run in Expo Go): secure-store, image-picker, document-picker, file-system, sharing, linear-gradient, svg, fonts.
- Backend: `https://adda.skillinnovex.in` via `EXPO_PUBLIC_API_URL` (see `src/lib/config.js`). API contract: `../docs/backend/API.md`.

## Folder layout
```
src/app/            routes only (file = screen)
  (auth)/           welcome, login, register            — visible when signed out
  (onboarding)/     society search, join, membership     — signed in, not yet approved
  (member)/         tabs + resident features             — approved members only
  (account)/        listings, notifications, profile     — any signed-in user
src/components/     UI kit (ui.jsx), AuthKit, cards, pickers
src/context/        auth (session + profile), toast
src/hooks/          useApi (load/refresh/focus refetch), useAction (no double submit), usePublic
src/lib/            api client, config, format (money/dates), validation, dialog, download, icons, actions
scripts/api-check.mjs  end-to-end API verification
```
Route files must not import other route files — shared code goes in `src/components` or `src/lib`.

## Design system (from Prototype/src/styles.css — keep it)
- Font **Plus Jakarta Sans** (400–800) via `T` component (`weight` prop selects the font file; never rely on `fontWeight`).
- Colours in `src/theme.js`: navy `#0f3963` (primary buttons), brand `#0f4c81` (auth), hero gradient `#0a3680→#1e68d8`, dues card coral `#f26f52→#e94e35`, surface `#f7f9fc`, borders `#e7edf4`, inputs `#dce5ef`.
- Components: `Hero` (tab screens), `DetailHeader` (detail screens), `Card`, `ListRow`, `Button` variants, `Field`, `Badge` (status → colour via `toneFor`), `Chips`, `PillToggle`, `EmptyState`, `ErrorState`, `LoadingList`/`Skeleton`, `Hint`, `ToggleRow`.
- Touch targets ≥ 44 pt; text scales with system font (capped at 1.35×); no fixed-height text containers.
- Every list screen has: skeleton → content | designed empty state | error state with Retry; pull-to-refresh.

## Data & API rules
- All data comes from the API. **No hardcoded records, demo users, fake numbers.**
- Money from the API is **integer paise** → display with `money()`; user input in rupees → `toPaise()`.
- Dates in IST via `formatDate/formatDateTime/timeRange`; payment methods via `methodLabel`.
- `api()` attaches the bearer token and `X-Society-Id`, refreshes once on `TOKEN_EXPIRED` (single flight), ends the session on `SESSION_INVALID/ACCOUNT_DISABLED`, maps network/timeout errors to friendly messages.
- Tokens live in **SecureStore** only. Never log tokens or put secrets in `EXPO_PUBLIC_*`.
- Show `error.message` from the server in toasts/inline errors; handle known codes (`MEMBERSHIP_PENDING`, `FLAT_NOT_FOUND`, `ACCOUNT_EXISTS`, `SLOT_TAKEN`, `PAYMENTS_UNAVAILABLE`, …).
- Payments: online payment is **skipped by product decision**; never simulate success. Invoices show "pay at society office".
- OTP: skipped; sign-in is phone + password (`/auth/resident/register|login`, server flag `RESIDENT_PASSWORD_LOGIN=true`).

## Interaction rules
- Use `useAction` for every submit (prevents double taps; shows button spinner).
- Confirm destructive actions with `confirm()` from `src/lib/dialog.js` (works on native and web).
- After create/save/delete use `returnTo(href)`; the header back arrow uses `useGoBack(fallback)` — both work for deep links.
- Validate client-side with `src/lib/validation.js` (mirrors server rules), show inline errors, keep the server as the source of truth.

## Verification before calling anything done
```bash
npx eslint --no-cache src                     # 0 problems
npx expo-doctor                               # 20/20
npx expo export --platform android --output-dir ../.tmp-export-android   # bundle compiles
node scripts/api-check.mjs <api> <superAdminEmail> <superAdminPassword>    # all ✓ (dev/staging DB only)
```
UI QA: run `npx expo start --web` with `EXPO_PUBLIC_API_URL` pointing at a dev API and drive every flow at 390 px and 360 px widths (Playwright), reviewing screenshots for clipping, overlap, alignment and colour. Restart Expo with `--clear` before QA — the dev server can serve stale route chunks.

## Failure recovery
| Symptom | Fix |
|---|---|
| "Project is incompatible with this version of Expo Go" | Phone's Expo Go must support SDK 58 — update Expo Go; or use a development build |
| App can't reach API on phone | Use `https://adda.skillinnovex.in` or your PC's LAN IP (not localhost); allow port in firewall |
| Changes not visible | `npx expo start --clear` |
| 429 on sign-in during heavy testing | Login rate limit per IP — wait 15 min or raise `LOGIN_RATE_LIMIT` on a dev server only |
| `PASSWORD_LOGIN_DISABLED` | Set `RESIDENT_PASSWORD_LOGIN=true` in the server `.env` |
