---
name: react-native-expo-engineering
description: Use when building, refactoring, or debugging the AddaApp resident mobile app (React Native + Expo SDK 58, React Navigation 7, JSX). Covers project structure, navigation, API client, secure token storage, permissions, pickers, push notifications, and environment config. Use before adding any screen, hook, native module, or config change in AddaApp/.
---

# React Native + Expo Engineering (AddaApp)

## Purpose and scope
Standards for the resident Android app in `AddaApp/`. Stack: Expo SDK 58, React Native (version pinned by SDK 58),
React Navigation 7, `expo-secure-store`, `expo-image-picker`, `expo-document-picker`, `expo-notifications`,
`react-native-safe-area-context`, JavaScript/JSX. Out of scope: APK signing/release (see `android-apk-release`),
visual design system (see `premium-mobile-ui-ux`).

## Standards

### Dependencies
- Install native-touching packages ONLY with `npx expo install <pkg>` so versions match SDK 58. Never `npm i` a
  native module at an arbitrary version.
- Run `npx expo-doctor` after any dependency change; it must report no issues before commit.
- Do not add packages that require custom native code unless a config plugin exists; otherwise document the
  prebuild requirement in the PR.

### Project layout
```
AddaApp/
  App.js                 # providers only: SafeAreaProvider, AuthProvider, NavigationContainer
  app.config.js          # dynamic config; reads EXPO_PUBLIC_* env
  src/
    api/client.js        # single fetch wrapper (base URL, auth header, refresh, timeout)
    api/<domain>.js      # e.g. bills.js, complaints.js, notices.js, visitors.js
    auth/AuthContext.js  # session state machine: loading | signedOut | signedIn
    navigation/          # RootNavigator, AuthStack, AppTabs, linking config
    screens/<Domain>/    # one folder per feature
    components/          # shared presentational components
    hooks/               # useApi, useRefreshOnFocus, usePushRegistration
    theme/               # tokens (see premium-mobile-ui-ux)
    utils/               # money.js (paise <-> rupees), date.js
```
- Screens fetch via hooks in `src/api/*`; no raw `fetch` in screens.
- No business rules in the client that the server does not also enforce (amounts, dues, permissions).

### Configuration
- API base URL comes from `process.env.EXPO_PUBLIC_API_URL` (inlined at build). Default for dev:
  emulator `http://10.0.2.2:<port>/api/v1`, physical device `http://<LAN-IP>:<port>/api/v1`.
- Production/preview builds MUST use `https://`. Cleartext HTTP is allowed only in development builds.
- Never put secrets in `EXPO_PUBLIC_*` — everything there is shipped in the bundle. Razorpay key id (public) is
  acceptable; key secret never.

### Auth and token storage
- Access token: in memory (AuthContext). Refresh token: `expo-secure-store` (`SecureStore.setItemAsync`) only.
  Never AsyncStorage for tokens.
- `api/client.js` on 401 with `code: "TOKEN_EXPIRED"` performs ONE refresh (single in-flight promise shared by
  concurrent requests), retries the original request once, and on refresh failure clears SecureStore and moves
  to `signedOut`.
- Logout calls `POST /api/v1/auth/logout` (revokes session) then deletes SecureStore keys, even if the call fails.

### Networking
- Every request has a timeout (AbortController, 15 s default) and maps errors to `{ code, message }` from the
  server's error envelope. Show user-safe messages; never render raw stack/HTML.
- Uploads use `FormData` with `{ uri, name, type }`; validate size/mime on client (server still validates).
- Pagination: cursor-based, matching server `nextCursor`.

### Navigation (React Navigation 7)
- Auth gating by conditional rendering of stacks based on AuthContext state, not by `navigate()` after login.
- Typed route names centralized in `navigation/routes.js`. Deep links configured via `linking` for
  notification taps (e.g. `adda://bills/:billId`).
- Use `useFocusEffect` for refresh-on-focus; clean up subscriptions.

### Permissions, pickers, notifications
- Request permissions just-in-time with rationale UI; handle `denied` and `blocked` (link to settings).
- `expo-image-picker`: set `quality: 0.7`, restrict `mediaTypes` to images; compress before upload.
- `expo-document-picker`: `copyToCacheDirectory: true`; restrict types to PDF/images.
- Push: obtain token with `Notifications.getExpoPushTokenAsync({ projectId })` after login, POST to the
  authenticated register endpoint; re-register on token change; unregister on logout. Create Android channel
  (`setNotificationChannelAsync('default', ...)`) before requesting token.

### Code quality
- Function components + hooks only. ESLint (expo config) + Prettier. No unused deps.
- Lists: `FlatList` with `keyExtractor`, `getItemLayout` where fixed height; no `ScrollView` + `.map` for
  unbounded data.
- Money displayed via `utils/money.js` from integer paise; never float arithmetic for amounts.

## Implementation checklist
- [ ] Packages added via `npx expo install`; `npx expo-doctor` clean
- [ ] `EXPO_PUBLIC_API_URL` set per environment; no secrets in `EXPO_PUBLIC_*`
- [ ] Refresh token stored only in SecureStore; access token in memory
- [ ] Single-flight refresh + one retry in `api/client.js`
- [ ] Request timeout and error envelope mapping
- [ ] Loading, empty, error, and offline states for every data screen
- [ ] Permissions requested just-in-time with denied/blocked handling
- [ ] Push token registration after login, removal on logout, Android channel created
- [ ] Deep links for notification taps tested
- [ ] SafeAreaView / `useSafeAreaInsets` used on all screens

## Required tests
- Unit/component tests with `jest-expo` + `@testing-library/react-native`:
  ```bash
  cd AddaApp
  npx expo install jest-expo jest @testing-library/react-native --dev
  npx jest --ci
  ```
- Must cover: `api/client.js` refresh single-flight and logout-on-refresh-failure (mock `fetch`), AuthContext
  transitions, money formatting, form validation on login/OTP screens.
- Static checks: `npx expo-doctor`, `npx eslint src --max-warnings=0`.
- Manual smoke on emulator AND a physical device: login via OTP, view bills, pay flow up to Razorpay sheet,
  raise complaint with photo, receive a push notification and tap it.

## Common failure modes and recovery
| Symptom | Cause | Recovery |
|---|---|---|
| `Network request failed` on emulator | `localhost` points to the emulator itself | Use `http://10.0.2.2:<port>`; on device use LAN IP (same Wi-Fi, firewall allows port) or an HTTPS tunnel (`npx expo start --tunnel` for Metro; ngrok/cloudflared for API) |
| HTTP works in dev but fails in APK | Cleartext blocked in release | Use HTTPS API for preview/production builds |
| Stale code / "Unable to resolve module" after install | Metro cache | `npx expo start -c`; if persists delete `node_modules` and `.expo`, `npm ci` |
| Native module undefined (`Cannot find native module`) | Package needs a dev/prebuild, not Expo Go | Create dev build (`eas build --profile development`) or `npx expo prebuild` |
| Version mismatch warnings | Package installed with npm at wrong version | `npx expo install --fix` |
| Push token is null | Emulator without Google Play, missing `projectId`, or permission denied | Use Play-enabled image or device; set `extra.eas.projectId`; check permission status |
| Infinite refresh loop | Refresh endpoint itself going through retry logic | Exclude `/auth/refresh` from refresh interception |
| User logged out after app restart | SecureStore key changed or cleared on reinstall | Keep key names constant; reinstall clears keystore by design |

## Definition of done
- Feature works on Android emulator and a physical device against the dev backend.
- `npx expo-doctor`, ESLint, and Jest pass with no warnings.
- No tokens or secrets outside SecureStore/server; no `console.log` of tokens or PII.
- All screens handle loading/empty/error states and safe areas.
- API contract changes are coordinated with Backend and documented.
