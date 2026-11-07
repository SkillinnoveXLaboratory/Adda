import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SKY, SplashBackdrop, SplashBrand } from './SplashScene';

/**
 * Branded splash: the splash photo (whole, never cropped), gold mark, NIVASA wordmark, tagline and gold sweep.
 * It sits ON TOP of the app and fades out when `visible` turns false, so it dissolves into the Get Started screen,
 * which draws the same backdrop and brand block in the same place. `onHidden` fires when the fade has finished.
 */
export function CustomSplash({ visible = true, onHidden }) {
  // Animated values are created once (state, not refs, so render never reads a ref).
  const [intro] = useState(() => new Animated.Value(0));
  const [outro] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.timing(intro, { toValue: 1, duration: 650, useNativeDriver: true }).start();
  }, [intro]);

  useEffect(() => {
    if (visible) return;
    Animated.timing(outro, { toValue: 0, duration: 450, useNativeDriver: true }).start(({ finished }) => finished && onHidden?.());
  }, [visible, outro, onHidden]);

  const rise = intro.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.fill, { opacity: outro }]} pointerEvents={visible ? 'auto' : 'none'} testID="custom-splash">
      <StatusBar style="light" />
      <SplashBackdrop />
      <Animated.View style={{ opacity: intro, transform: [{ translateY: rise }] }}>
        <SplashBrand />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { backgroundColor: SKY, zIndex: 10 },
});
