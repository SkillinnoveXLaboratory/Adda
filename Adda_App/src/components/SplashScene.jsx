import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { BRAND, TAGLINE } from './Logo';
import { T } from './Text';
import { colors } from '../theme';

const BG = require('../../assets/images/splash-bg.jpg'); // 768 × 1376
const BG_RATIO = 768 / 1376;
const MARK = require('../../assets/images/logo-gold.png');
/** Exact colour of the photo's top edge, so the area above the photo blends into the sky. */
export const SKY = colors.sky;

/**
 * The splash photo, shown whole: full width, anchored to the bottom, sky colour above it (tall phones) — never
 * cropped at the sides. Used by both the branded splash and the Get Started screen so the hand-over is seamless.
 */
export function SplashBackdrop({ sweep = true }) {
  const { width, height } = useWindowDimensions();
  const photoHeight = width / BG_RATIO;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: SKY, overflow: 'hidden' }]} pointerEvents="none">
      <Image source={BG} resizeMode="cover" style={{ position: 'absolute', left: 0, bottom: 0, width, height: photoHeight }} accessibilityIgnoresInvertColors />
      {sweep ? (
        <Svg width={width} height={height * 0.3} style={{ position: 'absolute', left: 0, top: height * 0.5 }} viewBox="0 0 400 160" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="sweep" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor="#ca9e3b" stopOpacity="0" />
              <Stop offset="0.35" stopColor="#ca9e3b" stopOpacity="1" />
              <Stop offset="1" stopColor="#ca9e3b" stopOpacity="0.85" />
            </LinearGradient>
          </Defs>
          <Path d="M-10 150 C 120 70, 260 40, 410 8" stroke="url(#sweep)" strokeWidth={3.2} fill="none" strokeLinecap="round" />
          <Path d="M-10 158 C 125 82, 262 52, 410 20" stroke="url(#sweep)" strokeWidth={1.2} fill="none" strokeLinecap="round" opacity={0.6} />
        </Svg>
      ) : null}
    </View>
  );
}

/** Gold mark + NIVASA + tagline + rule, at the same place on the splash and on Get Started. */
export function SplashBrand({ fontsReady = true }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mark = Math.min(124, width * 0.32);
  return (
    <View style={[styles.brand, { paddingTop: insets.top + height * 0.08 }]} accessibilityRole="header" accessibilityLabel={`${BRAND}. ${TAGLINE}`}>
      <Image source={MARK} style={{ width: mark, height: mark }} resizeMode="contain" />
      {fontsReady ? (
        <>
          <T weight="bold" size={Math.min(44, width * 0.11)} color={colors.gold} style={styles.word} maxFontSizeMultiplier={1}>
            {BRAND}
          </T>
          <T weight="semibold" size={14} color={colors.white} style={{ marginTop: 6, letterSpacing: 0.2 }} maxFontSizeMultiplier={1.1}>
            {TAGLINE}
          </T>
        </>
      ) : (
        <View style={{ height: 76 }} />
      )}
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center' },
  word: { letterSpacing: 9, marginTop: 14, paddingLeft: 9 },
  rule: { width: 72, height: 2.5, borderRadius: 2, backgroundColor: colors.gold, marginTop: 16 },
});
