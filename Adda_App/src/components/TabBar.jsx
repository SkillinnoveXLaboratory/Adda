import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { T } from './Text';
import { colors } from '../theme';

/**
 * Template bottom navigation. `tabs` maps route name → [activeIcon, icon, label, pill?].
 * The first ("home") tab shows the navy pill with a gold icon when active; the others a soft gold circle.
 */
export function TabBar({ state, tabs }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const [on, off, label, pill] = tabs[route.name] || ['ellipse', 'ellipse-outline', route.name];
        const focused = state.index === index;
        const go = () => {
          // Navigate by URL: each tab file is a route of the same name (/home, /manage, …).
          if (!focused) router.navigate(`/${route.name}`);
        };
        const common = { accessibilityState: { selected: focused }, accessibilityLabel: label, testID: `tab-${route.name}`, onPress: go };
        if (focused && pill) {
          return (
            <Pressable key={route.key} accessibilityRole="tab" {...common} style={styles.item}>
              <View style={styles.navyPill}>
                <Ionicons name={on} size={16} color={colors.gold} />
                <T weight="bold" size={12} color={colors.white} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                  {label}
                </T>
              </View>
            </Pressable>
          );
        }
        return (
          <Pressable key={route.key} accessibilityRole="tab" {...common} style={styles.item}>
            <View style={[styles.circle, focused && styles.circleOn]}>
              <Ionicons name={focused ? on : off} size={20} color={focused ? colors.navy : '#94a3b8'} />
            </View>
            <T weight={focused ? 'bold' : 'semibold'} size={10} color={focused ? colors.navy : '#94a3b8'} numberOfLines={1} maxFontSizeMultiplier={1.15}>
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
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  circleOn: { backgroundColor: 'rgba(202,158,59,0.2)' },
  navyPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.navy, borderRadius: 999, paddingHorizontal: 14, minHeight: 34 },
});
