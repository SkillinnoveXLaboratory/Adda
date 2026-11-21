---
name: mobile-ui-qa
description: Use before finishing ANY change to the resident app (Adda_App, NIVASA design) — screens, components, theme, navigation or copy. Defines the NIVASA visual spec and the mandatory checks for alignment, safe areas, tap targets, overflow and end-to-end workflows, with the two scripts that enforce them (ui-lint, ui-audit).
---

# Mobile UI QA — NIVASA resident app

A UI change is **done only when** `npm run ui-lint` and `npm run ui-audit` both pass, and you have **looked at the
screenshots** for every screen you touched, at 360 px and 412 px. Report the numbers; never claim "pixel perfect"
without them.

## 1. Visual spec (source: the NIVASA prototype; tokens live in `src/theme.js`)
| Token | Value | Used for |
|---|---|---|
| navy | `#0b1a30` | headers, primary text accents, active tab, selected pill |
| navySoft | `#1e293b` | gradient end (promo / dues / society banner) |
| gold | `#d4af37` (pressed `#b89428`) | primary CTA background (text `#0f172a`), focus ring, avatar ring |
| goldLight | `#f9f3dd` | active tab pill, empty-state icon, date chips |
| bg | `#f4f6f9` | screen background |
| slate | `#f1f5f9` card border · `#e2e8f0` input border · `#64748b` muted · `#94a3b8` placeholder/icons · `#334155` labels · `#1e293b` text | |
| link | `#2563eb` | "View All", "Forgot Password?" |
| logoBg | `#032143` | native splash + boot screen (matches the logo PNG) |
- Font: Plus Jakarta Sans (400–800). Header title 16 bold; section title 14 bold; body 12–14; captions 10–11; never < 9.
- Radii: inputs / buttons / small tiles 12, cards 16, pills 999. Card = white, 1 px `#f1f5f9` border, faint shadow.
- Logo: `assets/images/logo-mark.png` (320 px copy of `App_main_icon.png`) via `<LogoMark>` / `<Logo>` / `<BrandBar>` —
  never the 1.3 MB original in the bundle, never a recoloured or stretched mark.
- Headers: tab screens → `<Hero>` (navy bar, white title, optional bell/right action); sub-screens → `<DetailHeader>`
  (navy, back arrow, left-aligned title); Home → white brand bar (logo + NIVASA, bell, avatar).
- Bottom tabs (exactly five): Home · Society (`/manage`) · Properties (`/explore`) · Services · Profile.
- Icons: Ionicons outline in pastel tiles (`colors.tile*`). No emoji in UI.
- Imagery: only real content (listing photos, uploads) or the logo. **No stock photos, no fake numbers, no fake ratings,
  no modules that don't exist** (the prototype's Visitor Mgmt / Meetings / Accounting / Emergency / prices / reviews are
  placeholders — omit them until the backend supports them).

## 2. Layout & alignment rules
- Screen gutter 16; vertical rhythm 14 between blocks; grid gaps 10 (`TileGrid` handles it).
- Grids: use `TileGrid` + `ModuleCard` (2 cols) / `GridTile` (3 cols). Cells stretch to the row height; labels get a
  fixed 2-line box so icons line up across a row.
- Rows of inputs: wrap in `flexDirection: 'row', gap: 10`, each `Field` with `style={{ flex: 1 }}` — `Field` sets
  `minWidth: 0` so inputs can shrink (web/RN-web otherwise overflow).
- Text that can be long (society names, titles, addresses) must have `numberOfLines` and must not push siblings off screen
  (`flex: 1, minWidth: 0` on the text column, `flexShrink: 0` on prices/badges).
- Must survive font scale 1.3 (inputs cap at `maxFontSizeMultiplier={1.3}`).

## 3. Safe areas
- Every route screen renders inside a safe-area-aware shell: `Screen` (+ `Hero`/`DetailHeader`/custom top bar that adds
  `insets.top`), `AuthShell`, or explicit `useSafeAreaInsets()`. `ui-lint` rule **E1** enforces this.
- Bottom: tab screens rely on the tab bar (`paddingBottom: max(insets.bottom, 6)`); stack screens with lists add
  `insets.bottom` to the list's bottom padding; sticky footers (`Screen footer`) add `insets.bottom` themselves.
- Status bar: `light` on navy headers/splash, `dark` on white screens (Home, auth).
- Keyboard: forms live in `Screen` / `AuthShell` (KeyboardAvoidingView + `keyboardShouldPersistTaps="handled"`).

## 4. Interaction & accessibility
- Every `Pressable` has `accessibilityRole` (+ `accessibilityLabel` when the content isn't plain text) — rule **E2**.
- Tap targets ≥ 44 px tall (buttons 50, rows 50, tabs 50, icon buttons 44, text links 44 via `TextLink`). Chips and
  segmented pills may be 34–36 (they're shown as warnings, not failures).
- Pressed feedback on every tappable (scale 0.98 / gold border / tint). Buttons disable + show a spinner while busy.
- Navigation: tabs navigate by URL (`router.navigate('/<tab>')`) — don't depend on the custom tab bar's `navigation` prop
  (it is undefined in this expo-router version; that bug made every tab tap a no-op on web).

## 5. The checks
```bash
cd Adda_App
npm run lint                 # eslint
npm run ui-lint              # static: E1 safe-area shell, E2 a11y role, E3 font ≥ 9, E4 no secrets, W1 palette, W2 tap height
# local backend first: Backend → node server.js dev:db ; PORT=3013 … CORS_ORIGINS=…,http://localhost:8099 node server.js
npm run ui-audit -- --build  # seeds data, builds web, signs in through the UI at 360/390/412 px
npx expo export --platform android   # native bundle compiles
```
`ui-audit` fails on: page crash or error screen · horizontal overflow · a control outside the screen · a tap target
< 24 px · a fixed control covered by the tab bar · any tab / home card / Society tile that doesn't open its screen.
It warns on tap targets < 44 px and console errors. Screenshots: `qa-screenshots/<width>/<screen>.png`.

## 6. Review checklist (look at the screenshots)
- Header height and title alignment identical across sibling screens; back arrow present on every sub-screen.
- Left edges of all cards, titles and inputs on one 16 px line; nothing touching the screen edge.
- Equal tile heights per grid row; icons on one baseline.
- Gold used only for CTAs/accents, not for body text on white (contrast).
- Empty, loading (skeleton), error (retry) and offline states exist for every list.
- Nothing hidden under the status bar, notch, gesture bar or tab bar.
- Real device pass before release: one Android phone with gesture navigation + one with 3-button nav (Expo Go or APK).

## Anti-patterns
Hard-coded hex outside the palette · emoji icons · fixed pixel widths on text/inputs · `position: absolute` for layout
(only for badges/watermarks) · stock imagery · claiming done without running both scripts.
