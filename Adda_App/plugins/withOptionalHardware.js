// Google Play: hardware features that Android *implies* from the manifest are treated as required and hide the app
// from devices without them. NIVASA doesn't need either:
//   - android.hardware.screen.portrait  (implied by orientation "portrait")
//   - android.hardware.wifi             (implied by a library's ACCESS_WIFI_STATE permission; mobile data works too)
// Declaring them explicitly with android:required="false" keeps the app installable on every device
// (tablets, Chromebooks, desktop, XR) without changing how it behaves.
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL_FEATURES = ['android.hardware.screen.portrait', 'android.hardware.wifi'];

function withOptionalHardware(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const features = (manifest['uses-feature'] = manifest['uses-feature'] || []);
    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find((f) => f.$?.['android:name'] === name);
      if (existing) existing.$['android:required'] = 'false';
      else features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    return cfg;
  });
}

module.exports = withOptionalHardware;
