import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { T } from './Text';
import { colors } from '../theme';

/**
 * Bottom bar of the gate area (same look as the member TabBar). `tabs` maps route name → [activeIcon, icon, label, href].
 * Navigates by URL, like the member bar (the custom tab bar's `navigation` prop is not reliable in this expo-router).
 */
export function GateTabBar({ state, tabs }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const [on, off, label, href] = tabs[route.name] || ['ellipse', 'ellipse-outline', route.name, `/gate/${route.name}`];
        const focused = state.index === index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            testID={`gate-tab-${route.name}`}
            onPress={() => !focused && router.navigate(href)}
            style={styles.item}
          >
            <View style={[styles.circle, focused && styles.circleOn]}>
              <Ionicons name={focused ? on : off} size={20} color={focused ? colors.gold : '#94a3b8'} />
            </View>
            <T weight={focused ? 'bold' : 'semibold'} size={10.5} color={focused ? colors.navy : '#94a3b8'} numberOfLines={1} maxFontSizeMultiplier={1.15}>
              {label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8, paddingHorizontal: 8 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 50 },
  circle: { width: 36, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  circleOn: { backgroundColor: colors.navy },
});
