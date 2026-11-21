---
name: android-apk-release
description: Use when building, signing, versioning, testing, or distributing an Android APK/AAB of AddaApp - via EAS (`eas build -p android --profile preview`) or locally (`npx expo prebuild` + `gradlew assembleRelease`) on Windows with Android SDK at %LOCALAPPDATA%\Android\Sdk and Java 21. Covers eas.json profiles, keystores, env config, Gradle issues, and release verification.
---

# Android APK Release (AddaApp)

## Purpose and scope
Produce installable, correctly configured, signed builds of the resident app. Preview APKs for internal QA;
production AAB (or APK for sideload pilots) for Play Store. Expo SDK 58.

## Build configuration
### app.config.js essentials
- `android.package`: stable reverse-DNS id (e.g. `in.skillinnovex.addaapp`) - never change after first release.
- `version` (user-facing, semver) and `android.versionCode` (integer, strictly increasing per upload). With EAS use
  `"appVersionSource": "remote"` + `autoIncrement: true` in production profile.
- `android.permissions`: only what is needed (camera/media for image picker, notifications). Remove unused
  (`READ_PHONE_STATE`, etc.) via `blockedPermissions`.
- `android.softwareKeyboardLayoutMode: "resize"`; icons/adaptive icon/splash configured.
- `extra.eas.projectId` set (required for push tokens).
- Notifications: `expo-notifications` plugin with icon/color; FCM credentials configured for builds.

### eas.json profiles
```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal",
                     "env": { "EXPO_PUBLIC_API_URL": "http://10.0.2.2:3013/api/v1" } },
    "preview":     { "distribution": "internal", "android": { "buildType": "apk" },
                     "env": { "EXPO_PUBLIC_API_URL": "https://staging-api.<domain>/api/v1" } },
    "production":  { "autoIncrement": true, "android": { "buildType": "app-bundle" },
                     "env": { "EXPO_PUBLIC_API_URL": "https://api.<domain>/api/v1" } }
  }
}
```
- Preview/production URLs must be HTTPS. Only public values in `env` / `EXPO_PUBLIC_*`.
- Use EAS environment variables (`eas env:create`) for values you do not want in the repo.

## Signing
- EAS-managed keystore recommended (`eas credentials`). Download a backup of the keystore and store in the team
  password vault; losing it blocks updates for sideloaded APKs (Play App Signing mitigates for AAB).
- Local builds: keystore file outside the repo; passwords in `%USERPROFILE%\.gradle\gradle.properties`
  (`ADDA_UPLOAD_STORE_FILE`, `ADDA_UPLOAD_STORE_PASSWORD`, `ADDA_UPLOAD_KEY_ALIAS`, `ADDA_UPLOAD_KEY_PASSWORD`),
  referenced from `android/app/build.gradle` `signingConfigs.release`. Never commit `.jks`/`.keystore` or passwords.
- Never ship a release signed with the debug keystore.

## Build commands
### EAS (cloud)
```bash
cd AddaApp
npx expo-doctor
npx eas-cli@latest login
eas build -p android --profile preview           # APK for QA
eas build -p android --profile production        # AAB for Play
eas build:list --limit 5
```
### Local Gradle (Windows PowerShell)
```powershell
cd AddaApp
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"     # adjust to installed JDK 21 path
$env:EXPO_PUBLIC_API_URL = "https://staging-api.<domain>/api/v1"
npx expo prebuild -p android --clean
cd android
.\gradlew.bat assembleRelease                         # APK: app\build\outputs\apk\release\app-release.apk
.\gradlew.bat bundleRelease                           # AAB
```
- Prefer `npx expo prebuild --clean` (regenerates `android/`) over hand-editing native files; customizations go
  in config plugins so they survive prebuild. If `android/` is committed, document why.
- Install and verify: `adb install -r android\app\build\outputs\apk\release\app-release.apk`.
- Verify signature: `& "$env:ANDROID_HOME\build-tools\<ver>\apksigner.bat" verify --print-certs app-release.apk`.

## Pre-release checklist
- [ ] `npx expo-doctor` clean; Jest + ESLint pass
- [ ] `version` bumped; `versionCode` greater than last distributed build
- [ ] API URL for the profile is HTTPS and correct environment
- [ ] No dev-only flags (test OTP hints, debug menus, verbose logging) in release
- [ ] Permissions list reviewed; unused blocked
- [ ] Release signed with the correct (non-debug) key; keystore backed up
- [ ] Push notifications work in the built APK (FCM credentials present)
- [ ] Razorpay checkout opens in release build (test mode for preview)
- [ ] App size reasonable (check `.apk` size; enable Hermes - default)

## Required tests (on the built artifact, not dev client)
```bash
adb install -r app-release.apk
adb logcat *:E ReactNativeJS:V
```
- Fresh install + upgrade-over-previous install (data/session retained; SecureStore works).
- OTP login, bills list, pay (test mode), receipt PDF download/open, raise complaint with camera + gallery photo,
  document picker upload, push receive + tap deep link, logout.
- Airplane mode -> offline state; restore -> recovers.
- Run on at least Android 10 and latest Android version (emulator + one physical device).

## Common failure modes and recovery
| Symptom | Cause | Recovery |
|---|---|---|
| `java.lang.OutOfMemoryError` / Metaspace during Gradle | Default heap too small | In `android/gradle.properties`: `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m`; close other apps; `.\gradlew.bat --stop` |
| `SDK location not found` | `ANDROID_HOME` unset | Set env var or `android/local.properties` `sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk` |
| `Unsupported class file major version` / AGP JDK error | Wrong JDK | Use JDK 21 for current AGP; `java -version`; set `JAVA_HOME` / `org.gradle.java.home` |
| Path too long / file lock errors on Windows | Deep `node_modules` paths, antivirus locks | Enable long paths (`git config core.longpaths true`, Windows LongPathsEnabled), shorter project path, exclude folder from Defender, `gradlew --stop` |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Different signing key than installed app | Uninstall old app (`adb uninstall <package>`) or sign with original key |
| `INSTALL_FAILED_VERSION_DOWNGRADE` | versionCode lower | Bump versionCode |
| APK installs but cannot reach API | HTTP URL (cleartext blocked) or wrong env baked in | HTTPS URL; rebuild - `EXPO_PUBLIC_*` is baked at build time |
| Crash on launch only in release | Missing env, Hermes/minify issue, native module not in prebuild | `adb logcat`; reproduce with `npx expo run:android --variant release` |
| Stale native config after changing app.config | `android/` not regenerated | `npx expo prebuild --clean` |
| EAS build fails on dependency | Version mismatch | `npx expo install --fix`; check build logs "Install dependencies" phase |
| Push token null in APK | FCM credentials missing / projectId missing | `eas credentials` -> configure FCM V1; set `extra.eas.projectId` |

## Distribution
- Preview APK: share EAS internal distribution link or upload to a controlled channel; record build id, commit SHA,
  and API environment in release notes.
- Production: upload AAB to Play Console internal testing track first, then staged rollout.

## Definition of done
- Signed artifact built from a tagged commit with recorded build id/versionCode.
- Release test list passed on emulator and physical device against the intended environment.
- Keystore and credentials backed up securely; no secrets in repo or bundle.
- Release notes include version, versionCode, API environment, known issues.
