import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePublic } from '../hooks/usePublic';
import { colors, shadow } from '../theme';
import { T } from './Text';

export const VENDOR_PANEL_MESSAGE = 'Vendor accounts now use the NIVASA Vendor Panel website';

/**
 * Shown when the server answers VENDOR_USE_PANEL (vendor signing in, or an old vendor session in the app).
 * Links to the Vendor Panel when the platform has set `vendorPanelUrl` (GET /public/config).
 */
export function VendorPanelNotice({ onDismiss }) {
  const cfg = usePublic('/public/config');
  const url = cfg.data?.vendorPanelUrl || null;
  return (
    <View style={styles.box} accessibilityRole="alert" testID="vendor-panel-notice">
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={styles.icon}>
          <Ionicons name="storefront-outline" size={20} color={colors.navy} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <T weight="extrabold" size={14} color={colors.navy} style={{ lineHeight: 20 }}>
            {VENDOR_PANEL_MESSAGE}
          </T>
          <T size={12.5} color={colors.textSoft} style={{ lineHeight: 18 }}>
            Sign in there with the same mobile number and password to manage your listings, bookings and payouts. This app is for society members.
          </T>
          {!url && !cfg.loading ? (
            <T size={12} color={colors.muted} style={{ lineHeight: 17 }}>
              Ask NIVASA support for the Vendor Panel address.
            </T>
          ) : null}
        </View>
      </View>
      {url ? (
        <Pressable onPress={() => Linking.openURL(url).catch(() => {})} accessibilityRole="link" accessibilityLabel="Open the Vendor Panel website" style={({ pressed }) => [styles.link, pressed && { backgroundColor: colors.goldDark }]}>
          <Ionicons name="open-outline" size={17} color={colors.navy} />
          <T weight="bold" size={13.5} color={colors.navy}>
            Open the Vendor Panel
          </T>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close" style={styles.dismiss}>
          <T weight="bold" size={13} color={colors.textSoft}>
            OK
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.goldLight, borderWidth: 1, borderColor: colors.gold, borderRadius: 16, padding: 14, gap: 12, ...shadow.card },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 46, borderRadius: 12, backgroundColor: colors.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dismiss: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
