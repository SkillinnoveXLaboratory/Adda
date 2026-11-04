// Signs release builds with the upload keystore when CI provides it (see .github/workflows/android-apk.yml).
// The keystore and its passwords come from environment variables only - nothing secret is written into the repo.
// Without ANDROID_KEYSTORE_PATH the release build keeps Expo's default (debug) signing, so local builds still work,
// and the CI workflow refuses to publish an APK that is not signed with the release key.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_SIGNING = `
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }`;

function applyReleaseSigning(gradle) {
  if (gradle.includes("System.getenv('ANDROID_KEYSTORE_PATH')")) return gradle;

  // 1. Point the release build type at the release config (must run before step 2 adds another "release {").
  const buildTypes = gradle.indexOf('buildTypes {');
  const releaseType = gradle.indexOf('release {', buildTypes);
  const debugRef = gradle.indexOf('signingConfig signingConfigs.debug', releaseType);
  if (buildTypes < 0 || releaseType < 0 || debugRef < 0) throw new Error('withReleaseSigning: release buildType not found in app/build.gradle');
  gradle =
    gradle.slice(0, debugRef) +
    "signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug" +
    gradle.slice(debugRef + 'signingConfig signingConfigs.debug'.length);

  // 2. Add the release signing config next to the debug one.
  const signingConfigs = gradle.indexOf('signingConfigs {');
  if (signingConfigs < 0) throw new Error('withReleaseSigning: signingConfigs block not found in app/build.gradle');
  const at = signingConfigs + 'signingConfigs {'.length;
  return gradle.slice(0, at) + RELEASE_SIGNING + gradle.slice(at);
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('withReleaseSigning: expected a Groovy app/build.gradle');
    cfg.modResults.contents = applyReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
};
