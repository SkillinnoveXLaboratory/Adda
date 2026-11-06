import { Image, ImageBackground, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BRAND, TAGLINE } from '../../components/Logo';
import { T } from '../../components/Text';
import { colors, shadow } from '../../theme';

// Same building photo and gold mark as the branded splash, so the hand-over is seamless.
const BG = require('../../../assets/images/splash-bg.jpg');
const MARK = require('../../../assets/images/logo-gold.png');

const POINTS = [
  ['business-outline', 'Society management', 'Bills, complaints, notices & amenities'],
  ['key-outline', 'Properties', 'Buy, sell or rent homes near you'],
  ['construct-outline', 'Home services', 'Plumbing, electrical, cleaning & more'],
];

/** Splash / first screen (prototype screen 1). */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <ImageBackground source={BG} resizeMode="cover" style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]} imageStyle={styles.photo} testID="welcome-bg">
      <StatusBar style="light" />
      {/* Navy fade over the lower half keeps the card and buttons readable on the photo. */}
      <LinearGradient colors={['rgba(7,22,44,0)', 'rgba(7,22,44,0.55)', 'rgba(7,22,44,0.95)']} locations={[0.35, 0.6, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <View style={styles.brand}>
        <Image source={MARK} style={{ width: 104, height: 104 }} resizeMode="contain" accessibilityLabel={`${BRAND} logo`} />
        <T weight="bold" size={34} color={colors.gold} style={{ letterSpacing: 7, marginTop: 12, paddingLeft: 7 }}>
          {BRAND}
        </T>
        <T weight="semibold" size={13} color={colors.white} style={{ letterSpacing: 0.3, marginTop: 4, textAlign: 'center' }}>
          {TAGLINE}
        </T>
      </View>

      <View style={styles.bottom}>
        <View style={styles.card}>
          {POINTS.map(([icon, title, sub], i) => (
            <View key={title} style={[styles.point, i < POINTS.length - 1 && styles.pointLine]}>
              <View style={styles.pointIcon}>
                <Ionicons name={icon} size={18} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <T weight="bold" size={13.5} color={colors.white}>
                  {title}
                </T>
                <T size={11.5} color="#94a3b8" numberOfLines={1}>
                  {sub}
                </T>
              </View>
            </View>
          ))}
        </View>
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
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  // overflow + a full-size photo keep the picture inside the screen (on web it otherwise renders at its natural size).
  screen: { flex: 1, backgroundColor: colors.navy, paddingHorizontal: 24, justifyContent: 'space-between', overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  brand: { alignItems: 'center', paddingTop: 40 },
  bottom: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 14 },
  card: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(148,163,184,0.25)', backgroundColor: 'rgba(7,22,44,0.72)', paddingHorizontal: 14, ...shadow.button },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  pointLine: { borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.18)' },
  pointIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(202,158,59,0.16)', alignItems: 'center', justifyContent: 'center' },
  cta: { backgroundColor: colors.gold, borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', ...shadow.gold },
});
