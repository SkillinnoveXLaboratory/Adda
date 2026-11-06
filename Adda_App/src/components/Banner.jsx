import { ImageBackground, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadow } from '../theme';
import { T } from './Text';

// Compressed copy of assets/images/banners.png — the building photo used behind every banner.
const BANNER = require('../../assets/images/banner.jpg');

const FADES = {
  // Template home hero: navy on the left fading to the photo on the right; white text.
  dark: ['rgba(7,22,44,1)', 'rgba(7,22,44,0.82)', 'rgba(7,22,44,0.05)'],
  // Template society hero: white on the left fading to the photo; navy text.
  light: ['rgba(255,255,255,0.92)', 'rgba(255,255,255,0.72)', 'rgba(255,255,255,0)'],
};

/**
 * Building-photo banner (templates: Home "Better Living Starts Here", Society "Green Valley Residency").
 * `tone` dark|light, `title`, optional `subtitle`, `eyebrow`, and a pill `action` button.
 */
export function Banner({ tone = 'dark', eyebrow, title, subtitle, action, onAction, height = 144, children, testID }) {
  const dark = tone === 'dark';
  return (
    <ImageBackground source={BANNER} resizeMode="cover" style={[styles.wrap, { height }, dark ? shadow.button : styles.lightBorder]} imageStyle={styles.image} testID={testID}>
      <LinearGradient colors={FADES[dark ? 'dark' : 'light']} locations={[0, 0.45, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <View style={styles.body}>
        <View style={{ maxWidth: '68%', gap: 2 }}>
          {eyebrow ? (
            <T weight="bold" size={10} color={dark ? colors.gold : colors.goldText} style={{ letterSpacing: 1 }}>
              {eyebrow}
            </T>
          ) : null}
          <T weight="extrabold" size={dark ? 16 : 14.5} color={dark ? colors.white : colors.navy} style={{ lineHeight: dark ? 21 : 19 }} numberOfLines={2}>
            {title}
          </T>
          {subtitle ? (
            <T weight="semibold" size={11.5} color={dark ? '#cbd5e1' : '#475569'} numberOfLines={2}>
              {subtitle}
            </T>
          ) : null}
        </View>
        {children}
        {action ? (
          <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={action} hitSlop={4} style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.goldDark, transform: [{ scale: 0.97 }] }]}>
            <T weight="bold" size={12} color={colors.navy}>
              {action}
            </T>
          </Pressable>
        ) : null}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.navy },
  image: { borderRadius: 16 },
  lightBorder: { borderWidth: 1, borderColor: '#f1f5f9', backgroundColor: colors.white },
  body: { flex: 1, padding: 16, justifyContent: 'space-between' },
  action: { alignSelf: 'flex-start', backgroundColor: colors.gold, borderRadius: 999, paddingHorizontal: 18, minHeight: 36, justifyContent: 'center', ...shadow.gold },
});
