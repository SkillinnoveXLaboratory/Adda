# AddaApp — resident app (Expo SDK 58)

Production resident app for the AddaApp society platform, built from the `Prototype/` design. It is fully server-driven against **https://adda.skillinnovex.in**.

## Run it in Expo Go
```bash
cd Adda_App
npm install
npx expo start            # scan the QR code with Expo Go (Android) — SDK 58
```
- The app talks to `https://adda.skillinnovex.in` by default.
- To test against a local backend, create `.env` with `EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:3013`. On the emulator, use `http://10.0.2.2:3013`. Then run `npx expo start --clear`.
- **Server requirement:** the server `.env` must include `RESIDENT_PASSWORD_LOGIN=true`. Sign-up and sign-in use phone + password while SMS OTP is disabled.

## Resident flow
1. **Welcome**, then **Create account**: name and mobile, then password with a strength meter and terms, then the account is created.
2. **Find your society**: search by name, area, city or code. Then **Join**: pick building, flat number and owner/tenant/family.
3. **Membership pending**: a live status screen that refreshes every 20 seconds. Society admin approval unlocks the app automatically and shows a welcome toast.
4. **Tabs:**
   - **Home**: dues card, quick actions, counts, notices, bookings.
   - **Community**: feed, likes, comments, polls, reporting.
   - **Bills**: invoices, invoice detail, payments, receipt with PDF download.
   - **Services**: request a service, my requests.
   - **Profile**: settings, memberships, log out.
5. **More screens:**
   - Complaints: raise with photos/PDF, timeline, updates, close/reopen.
   - Notices.
   - Facility booking: date strip, multi-slot selection, fee summary.
   - My bookings.
   - Property and local marketplaces: browse, filter, call/WhatsApp, report, post/edit/sold/delete.
   - My listings.
   - Notifications with deep links.
   - Edit profile.
6. **Sign out, then sign in** again with mobile + password.

Skipped by decision: SMS OTP and online payment. Invoices tell residents to pay at the society office, and the office records the payment in the panel, which produces the receipt. Push notifications aren't available in Expo Go; in-app notifications work.

## Screen map (Prototype → App)
| Prototype | App route |
|---|---|
| Splash / Login / Verify | `(auth)/welcome`, `(auth)/login`, `(auth)/register` |
| Join society / Membership pending | `(onboarding)/society`, `join`, `membership` |
| Home | `(member)/(tabs)/home` |
| Bills / Invoice / Payment / Success / Receipt / History | `(tabs)/bills`, `invoice/[id]`, `receipt/[id]`, `payments` |
| Complaints / New / Detail | `complaints/index`, `complaints/new`, `complaints/[id]` |
| Community / Create post / Post detail | `(tabs)/community`, `posts/new`, `posts/[id]` |
| Notices / Notice detail | `notices/index`, `notices/[id]` |
| Facilities / Facility detail / My bookings | `facilities/index`, `facilities/[id]`, `bookings` |
| Services | `(tabs)/services`, `service/new`, `service-requests` |
| Property / Marketplace / New listing | `(account)/properties/*`, `(account)/marketplace/*`, `my-listings` |
| Notifications / Profile / Edit profile | `(account)/notifications`, `(tabs)/profile`, `(account)/edit-profile`, `memberships` |

## Quality checks
See `SKILL.md` for the standards and `TASKS.md` for the verified checklist.
```bash
npx eslint --no-cache src
npx expo-doctor
npx expo export --platform android --output-dir ../.tmp-export-android
node scripts/api-check.mjs https://adda.skillinnovex.in <superAdminEmail> <superAdminPassword>   # writes test data — use staging
```

## Build an APK
`eas.json` has `preview` (APK) and `production` (AAB) profiles, both pointing at `https://adda.skillinnovex.in`.
```bash
npx eas-cli build -p android --profile preview
```
Android package: `com.nivasa.app`.
