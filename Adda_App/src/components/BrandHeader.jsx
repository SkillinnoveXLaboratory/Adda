import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from './Logo';
import { BellButton, T } from './ui';
import { colors, shadow } from '../theme';

const GOLD_MARK = require('../../assets/images/logo-gold.png');

/** Navy top bar with rounded bottom (template home): gold mark + NIVASA wordmark, notification bell. */
export function BrandHeader({ unread = 0, onBell = () => router.push('/notifications') }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.row}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityRole="header" accessibilityLabel={BRAND}>
          <Image source={GOLD_MARK} style={{ width: 32, height: 32 }} resizeMode="contain" />
          <T weight="extrabold" size={20} color={colors.gold} style={{ letterSpacing: 3.5 }}>
            {BRAND}
          </T>
        </View>
        <View style={styles.bell}>
          <BellButton unread={unread} onPress={onBell} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.navy, paddingHorizontal: 20, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, ...shadow.button },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bell: { borderRadius: 22, backgroundColor: 'rgba(30,41,59,0.6)' },
});
