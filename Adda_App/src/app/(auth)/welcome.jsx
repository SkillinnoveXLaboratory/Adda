import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SKY, SplashBackdrop, SplashBrand } from '../../components/SplashScene';
import { T } from '../../components/Text';
import { colors, shadow } from '../../theme';

/**
 * Get Started. Same backdrop and brand block as the branded splash (SplashScene), in the same place, so the splash
 * dissolves into this screen; only the buttons fade up.
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 500, delay: 250, useNativeDriver: true }).start();
  }, [enter]);
  const rise = enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <View style={styles.screen} testID="welcome-bg">
      <StatusBar style="light" />
      <SplashBackdrop />
      {/* Navy fade at the bottom keeps the buttons readable on the photo. */}
      <LinearGradient colors={['rgba(7,22,44,0)', 'rgba(7,22,44,0.6)', 'rgba(7,22,44,0.96)']} locations={[0.4, 0.62, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <SplashBrand />

      <Animated.View style={[styles.bottom, { paddingBottom: insets.bottom + 20, opacity: enter, transform: [{ translateY: rise }] }]}>
        <Pressable onPress={() => router.push('/login')} accessibilityRole="button" accessibilityLabel="Get started" style={({ pressed }) => [styles.cta, pressed && { backgroundColor: colors.goldDark, transform: [{ scale: 0.98 }] }]}>
          <T weight="bold" size={14} color="#0f172a">
            Get Started
          </T>
        </Pressable>
        <Pressable onPress={() => router.push('/register')} accessibilityRole="button" accessibilityLabel="Create a new account" hitSlop={8} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
          <T size={12.5} color="#cbd5e1">
            New here? <T weight="bold" size={12.5} color={colors.gold}>Create an account</T>
          </T>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SKY, overflow: 'hidden' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, width: '100%', maxWidth: 488, alignSelf: 'center', gap: 14 },
  cta: { backgroundColor: colors.gold, borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', ...shadow.gold },
});
