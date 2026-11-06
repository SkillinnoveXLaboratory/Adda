import { useEffect, useState } from 'react';
import { Animated, Image, ImageBackground, StyleSheet, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { BRAND, TAGLINE } from './Logo';
import { T } from './Text';
import { colors } from '../theme';

const BG = require('../../assets/images/splash-bg.jpg');
const MARK = require('../../assets/images/logo-gold.png');

/**
 * Branded splash (design reference: the NIVASA splash mock-up): building photo, gold house-N mark,
 * NIVASA wordmark, tagline, gold rule and the gold sweep across the sky. The native splash before it is plain white.
 * `fontsReady` false → the wordmark waits for Plus Jakarta Sans instead of flashing a fallback font.
 */
export function CustomSplash({ fontsReady = true, onShown }) {
  const { width, height } = useWindowDimensions();
  // Created once; state (not refs) so render never reads a ref.
  const [fade] = useState(() => new Animated.Value(0));
  const [rise] = useState(() => new Animated.Value(14));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 650, useNativeDriver: true }),
    ]).start();
  }, [fade, rise]);

  const mark = Math.min(132, width * 0.34);
  const curveTop = height * 0.5;
  return (
    <ImageBackground source={BG} resizeMode="cover" style={styles.fill} imageStyle={styles.photo} onLoadEnd={onShown} testID="custom-splash" accessibilityLabel={`${BRAND}. ${TAGLINE}`}>
      <StatusBar style="light" />
      <Svg width={width} height={height * 0.3} style={{ position: 'absolute', left: 0, top: curveTop }} viewBox="0 0 400 160" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
      <Animated.View style={[styles.brand, { paddingTop: height * 0.13, opacity: fade, transform: [{ translateY: rise }] }]}>
        <Image source={MARK} style={{ width: mark, height: mark }} resizeMode="contain" />
        {fontsReady ? (
          <>
            <T weight="bold" size={Math.min(46, width * 0.115)} color={colors.gold} style={styles.word} maxFontSizeMultiplier={1}>
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
      </Animated.View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.navy, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  brand: { alignItems: 'center' },
  word: { letterSpacing: 9, marginTop: 14, paddingLeft: 9 },
  rule: { width: 72, height: 2.5, borderRadius: 2, backgroundColor: colors.gold, marginTop: 18 },
});
