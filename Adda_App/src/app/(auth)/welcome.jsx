import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { BRAND, LogoMark, TAGLINE } from '../../components/Logo';
import { T } from '../../components/Text';
import { colors, shadow } from '../../theme';

const POINTS = [
  ['business-outline', 'Society management', 'Bills, complaints, notices & amenities'],
  ['key-outline', 'Properties', 'Buy, sell or rent homes near you'],
  ['construct-outline', 'Home services', 'Plumbing, electrical, cleaning & more'],
];

/** Splash / first screen (prototype screen 1). */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
      <StatusBar style="light" />
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 800" preserveAspectRatio="none" pointerEvents="none" opacity={0.2}>
        <Path d="M-50 200 C 100 300, 200 100, 450 300" stroke={colors.gold} strokeWidth={2} fill="none" />
        <Path d="M-50 250 C 120 350, 220 150, 450 350" stroke={colors.gold} strokeWidth={1.5} fill="none" />
        <Path d="M-50 600 C 150 500, 250 700, 450 550" stroke={colors.gold} strokeWidth={2} fill="none" />
      </Svg>

      <View style={styles.brand}>
        <LogoMark size={96} />
        <T weight="extrabold" size={30} color={colors.white} style={{ letterSpacing: 3, marginTop: 16 }}>
          {BRAND}
        </T>
        <T weight="medium" size={12} color="#cbd5e1" style={{ letterSpacing: 0.4, marginTop: 4, textAlign: 'center' }}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navy, paddingHorizontal: 24, justifyContent: 'space-between' },
  brand: { alignItems: 'center', paddingTop: 40 },
  bottom: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 14 },
  card: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(148,163,184,0.25)', backgroundColor: 'rgba(30,41,59,0.6)', paddingHorizontal: 14, ...shadow.button },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  pointLine: { borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.18)' },
  pointIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(212,175,55,0.12)', alignItems: 'center', justifyContent: 'center' },
  cta: { backgroundColor: colors.gold, borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', ...shadow.gold },
});
