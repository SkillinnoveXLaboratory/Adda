---
name: premium-mobile-ui-ux
description: Use when designing or implementing any user-facing screen, component, or flow in AddaApp (resident mobile app) or reviewing UI quality. Defines the design tokens, layout, typography, interaction, accessibility, and state-handling standards for a premium, ADDA-inspired society management experience.
---

# Premium Mobile UI/UX (AddaApp)

> **Current brand: NIVASA** (navy `#0b1a30` + gold `#d4af37`, Plus Jakarta Sans, logo `assets/images/App_main_icon.png`).
> The exact visual spec, tokens and the mandatory alignment / safe-area / workflow checks are in
> `skills/mobile-ui-qa/SKILL.md`; where this file disagrees on colours or components, that file wins.

## Purpose and scope
Ensure the resident app feels polished, trustworthy, and fast. Applies to all screens in `AddaApp/src/screens`
and shared components in `AddaApp/src/components`. Visual consistency with the SocialPanel web portal is
desirable (same brand colors and status semantics) but the mobile app follows Android/Material conventions.

## Core resident flows (priority order)
1. OTP login and society/flat selection
2. Home dashboard: dues summary, latest notices, quick actions
3. Bills and payments (view bill, pay via Razorpay, receipt PDF)
4. Complaints/helpdesk (raise with photo, track status)
5. Notices and events, visitor management, directory, profile/settings

## Design tokens (`src/theme/tokens.js`)
- Spacing scale (dp): 4, 8, 12, 16, 20, 24, 32, 40. Screen horizontal padding 16; card padding 16; section gap 24.
- Radius: 8 (inputs, chips), 12 (cards), 16 (bottom sheets), 999 (pills).
- Typography (system font / Inter if bundled): Display 28/34 semibold, Title 20/26 semibold, Body 16/22 regular,
  Label 14/20 medium, Caption 12/16 regular. Respect `allowFontScaling`; layouts must survive 1.3x font scale.
- Color roles (never hard-code hex in screens): `primary`, `onPrimary`, `surface`, `surfaceAlt`, `text`,
  `textMuted`, `border`, `success`, `warning`, `danger`, `info`. Provide light and dark palettes keyed off
  `useColorScheme()`.
- Status semantics fixed across app and web: Paid=success, Due=warning, Overdue=danger, Partially paid=info,
  Complaint Open=info, In progress=warning, Resolved=success, Closed=textMuted.
- Elevation: cards use subtle shadow (Android `elevation: 2`) or 1px border, not both heavily.

## Layout and interaction standards
- Every screen wrapped with safe-area handling (`useSafeAreaInsets` / `SafeAreaView` from
  `react-native-safe-area-context`); bottom actions clear the gesture bar.
- Minimum touch target 48x48 dp; use `hitSlop` for small icons.
- Primary action per screen is visually unique; destructive actions use `danger` and confirm dialogs.
- Feedback within 100 ms: pressed states (`Pressable` with `android_ripple`), button loading spinners, disabled
  while submitting (prevents double payments/complaints).
- Loading: skeleton placeholders for lists/cards; never a blank screen. Pull-to-refresh on list screens.
- Empty states: illustration/icon + one sentence + action ("No complaints yet - Raise a complaint").
- Error states: human message + Retry; offline banner when network unavailable.
- Forms: labels above inputs, inline validation on blur, error text in `danger`, correct `keyboardType`
  (`phone-pad` for mobile, `number-pad` for OTP), `KeyboardAvoidingView`, `textContentType="oneTimeCode"`
  / `autoComplete="sms-otp"` for OTP.
- OTP screen: 6 boxes or single input, resend countdown mirroring server cooldown, clear lockout message after
  max attempts.
- Money: always `₹1,23,456.00` Indian grouping via `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`
  from integer paise. Dates: `21 Oct 2026` format, relative time for activity ("2h ago").
- Payment flow: show bill breakdown, total, then a single "Pay ₹X" button. After return from Razorpay show
  "Verifying payment..." until server confirms; never show success based on client callback alone.
- Navigation: bottom tabs (Home, Bills, Helpdesk, Community, Profile) max 5; stacks inside. Back behavior
  predictable; Android hardware back handled.
- Images: `expo-image` or `Image` with fixed aspect ratio and placeholders; avoid layout shift.
- Motion: subtle (150-250 ms), respect reduce-motion (`AccessibilityInfo.isReduceMotionEnabled`).

## Screen recipes
- **Home**: header (society name, flat, avatar) -> dues card (total outstanding, due date, "Pay now") ->
  quick actions grid (Pay, Helpdesk, Visitors, Notices; 4 per row) -> latest notices (3) -> upcoming events.
- **Bill detail**: period, status pill, line items table (head, amount), penalties, paid so far, outstanding,
  sticky bottom "Pay ₹X" bar; receipt download for paid bills.
- **Complaint create**: category chips, title, description (max 1000 chars with counter), up to 3 photos with
  thumbnails and remove buttons, submit; success screen with ticket number.
- **Payments unavailable**: when server reports `onlinePayment.available: false` (or 503 PAYMENTS_UNAVAILABLE), replace Pay button with an info card
  "Online payment is currently unavailable. Please contact your society office." - never a dead button.

## Accessibility
- `accessibilityRole`, `accessibilityLabel` on all icon-only buttons; `accessibilityState` for toggles/disabled.
- Text contrast >= 4.5:1 (3:1 for large text) in both themes.
- Do not convey status by color alone; include text label or icon.
- TalkBack order logical; test with TalkBack on.

## Content standards
- Plain, polite tone; society context visible (society name + flat number in header).
- Error copy never exposes technical details ("Something went wrong. Please try again." + support code).
- Notifications: title <= 40 chars, body actionable ("Maintenance bill of ₹3,500 due on 5 Nov").

## Implementation checklist
- [ ] Uses only theme tokens (no inline hex, no magic spacing numbers)
- [ ] Light and dark mode verified
- [ ] Safe areas respected top and bottom
- [ ] Loading skeleton, empty, error, offline states implemented
- [ ] Touch targets >= 48dp; pressed feedback present
- [ ] Submit buttons disable + spinner while in-flight
- [ ] Forms: proper keyboard types, inline validation, keyboard avoidance
- [ ] Currency/date formatting via shared utils
- [ ] Accessibility labels/roles; TalkBack pass
- [ ] Tested at font scale 1.3 and on a small (360dp wide) screen

## Required tests
- Component tests (`@testing-library/react-native`) asserting state rendering:
  ```bash
  cd AddaApp && npx jest src/components src/screens --ci
  ```
  e.g. BillCard renders "Overdue" label with danger style; submit button disabled while loading; empty state
  shows CTA.
- Snapshot tests only for small stable components (avoid large screen snapshots).
- Manual UX QA script per release: run on small device (360x640) and large (412x915), light + dark, font scale
  1.3, TalkBack on, airplane mode (offline banner), slow network (Android emulator network throttling).

## Common failure modes and recovery
| Symptom | Recovery |
|---|---|
| Content hidden under status bar / gesture bar | Use `useSafeAreaInsets()`; ensure `SafeAreaProvider` at root |
| Keyboard covers input on Android | `KeyboardAvoidingView behavior="height"` or `android:windowSoftInputMode=adjustResize` in app config (`android.softwareKeyboardLayoutMode: "resize"`) |
| Double-submit of complaint/payment | Disable button on press; server idempotency key as backup |
| Text truncation at large font scale | Allow wrapping, avoid fixed heights, use `numberOfLines` only with tooltip/expand |
| Janky lists | `FlatList` virtualization, memoized row components, avoid inline anonymous objects in hot paths |
| Dark mode unreadable text | Missing token for a color; replace hard-coded colors with role tokens |
| Payment success shown but server says pending | UI trusted client callback; must poll/verify server status |

## Definition of done
- Screen matches tokens and patterns above; reviewer can find no hard-coded colors/spacing.
- All four states (loading/empty/error/success) demonstrated in PR screenshots (light + dark).
- Accessibility pass with TalkBack and 1.3x font scale.
- No double-submit possible on mutating actions.
- Component tests pass.
