---
name: nivasa-ui
description: Use when building or changing any NIVASA app screen (Adda_App). The visual system from the NIVASA screen templates (_templates_.txt): navy/gold palette, building-photo banners, two-tone template icons, template tab bar, white native splash + branded splash. Includes the per-screen checklist and the commands that must pass.
---

# NIVASA UI (Adda_App)

Source of truth for the look: `_templates_.txt` (Home dashboard, Society Management, Home Maintenance) and the splash
mock-up (`assets/images/splashscreen.png`). Keep every feature; change only how it looks. Read with
`skills/mobile-ui-qa/SKILL.md` (alignment, safe area, workflow checks).

## Tokens (`src/theme.js`) — never hard-code other hex values
| Token | Value | Use |
|---|---|---|
| `colors.navy` | `#07162c` | headers, primary text on light, active tab pill |
| `colors.gold` | `#ca9e3b` | buttons, wordmark, icon accents |
| `colors.goldDark` | `#b38a2e` | pressed gold |
| `colors.goldLight` | `#f4ecd8` | soft gold surfaces, selected chips |
| `colors.bg` | `#f4f6fb` | screen background |
| `colors.border` | `#eef2f7` | card borders |
| `colors.muted` | `#637381` | secondary text |
Font: Plus Jakarta Sans (`T` component, weights regular…extrabold). Radius: cards/tiles 16, pills 999.
Gold buttons use **navy text** (white on this gold is ~2.4:1 — fails contrast). `ui-lint` W1 flags off-palette hex.

## Building blocks (use these, don't re-style by hand)
- `components/BrandHeader` — navy header with rounded bottom, gold mark + NIVASA, bell (Home).
- `Hero` (`components/ui`) — navy tab header; `onBack` adds the template back arrow (Society, Home Maintenance).
- `components/Banner` — **every banner** uses the building photo `assets/images/banner.jpg` (compressed copy of
  `banners.png`). `tone="dark"` (navy fade, white text — Home) or `tone="light"` (white fade, navy text — Society);
  pill `action` button.
- `components/NivasaIcons` → `<NIcon name="…" />` two-tone navy/gold UI icons from the templates (`society, properties,
  maintenance, community, bills, payments, complaints, notices, people, calendar, amenities, accounting, market,
  requests, vote`); unknown names fall through to the category icon set. `ModuleCard` / `GridTile` take `nicon`.
- **Service-category icons are data, not code**: `src/lib/serviceIcons.json` (41 two-tone icons) is shared byte-for-byte with
  Admin_Panel and SocialPanel (their icon pickers) and its keys are the backend allow-list (`SERVICE_ICON_KEYS`).
  Draw with `<CategoryIcon icon={category.icon} name={category.name} />` (`color` = one-colour, e.g. gold on navy).
  To add an icon: add it to the JSON, copy the file to both panels, add the key to `SERVICE_ICON_KEYS` — `npm run ui-lint` (E5) fails otherwise.
- `components/TabBar` — template bottom bar: first tab = navy pill with gold icon when active, others = soft gold circle.
- `PopularServiceCard` (template "Popular Services" card), `ListingCard` (shows `Sponsored` + `Verified`),
  `BookingCard` (service booking; member view: vendor contact, member price, discount, Cancel; vendor view: own price, NIVASA fee,
  accept/decline/complete, mark paid prefilled with `payablePaise`, settlement), `PollCard` (society vote),
  `LocationPicker` (GPS + geocode search + Leaflet WebView map; web shows search + coordinates), `ServiceBrowser` (search, categories,
  Near me with 2/5/10/25/50 km + custom), `Pricing` (`MemberPricePreview`, `BookingPriceSummary`, `DiscountOffer` — no coupons).

## Splash
- Native splash = **plain white** (`app.json` → `expo-splash-screen` with transparent `splash-blank.png`, bg `#ffffff`;
  Android 12+ would otherwise show the launcher icon).
- Then `components/CustomSplash` (building photo `splash-bg.jpg`, gold `logo-gold.png`, NIVASA wordmark, tagline, gold
  rule and sweep) for at least `SPLASH_MIN_MS` (1.8 s) while the session loads (`app/_layout.jsx`).

## Screen rules
1. Template structure first: header → greeting/banner → grid → lists. Gaps 14–16, side padding 14–16.
2. **Nothing the admin manages is hard-coded**: categories (names, icons, order), boost durations (`/public/config` → `ads.dayOptions`),
   prices and listings come from the server. Fixed UI lists are only for app features and server-enforced enums.
3. Show only features that exist. If the template shows a module the app doesn't have (e.g. Visitor Management,
   Meetings, Accounting), leave it out — never add dead tiles or fake numbers.
4. Three sign-ins share the app: members (society + Marketplace), vendors (`(vendor)` area: dashboard, listings, bookings, boost,
   profile, Shop settings, Earnings, KYC; listing forms only for KYC-approved vendors) and gate staff (`(gate)` only). Members never see listing-creation UI.
5. Every touch target ≥ 44 px, every `Pressable` has `accessibilityRole` + label, text ≥ 9.5 px.
6. Long names: `numberOfLines` + `minWidth: 0` in rows; grids wrap to 2-line labels (`'Society\nManagement'`).
7. Loading = skeletons, empty = `EmptyState` with a next step, errors = `ErrorState` with retry.

## Checklist before finishing a screen
- [ ] Matches the template at 360 / 390 / 412 px (screenshot from `npm run ui-audit` in `qa-screenshots/`).
- [ ] Header, safe area and tab bar correct; nothing under the status bar or home indicator.
- [ ] Only palette tokens; gold buttons have navy text.
- [ ] Member vs vendor: correct actions only (see `skills/vendor-marketplace/SKILL.md`).
- [ ] `npx eslint src scripts` → 0 problems; `npm run ui-lint` → 0 errors, 0 warnings; `npm run ui-audit -- --build` → 0 failures;
      `npx expo export --platform android` compiles (dry check — do not build an APK unless asked).
