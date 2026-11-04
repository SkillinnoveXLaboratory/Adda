import { Pressable, StyleSheet, View } from 'react-native';
import { router, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { T } from '../../../components/Text';
import { colors } from '../../../theme';

/** Prototype bottom navigation: Home · Society · Properties · Services · Profile. */
const TABS = {
  home: ['home', 'home-outline', 'Home'],
  manage: ['business', 'business-outline', 'Society'],
  explore: ['key', 'key-outline', 'Properties'],
  services: ['construct', 'construct-outline', 'Services'],
  profile: ['person', 'person-outline', 'Profile'],
};

/** Bottom navigation with safe-area padding for gesture navigation. */
function TabBar({ state }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const [on, off, label] = TABS[route.name] || ['ellipse', 'ellipse-outline', route.name];
        const focused = state.index === index;
        const tint = focused ? colors.navy : '#94a3b8';
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            testID={`tab-${route.name}`}
            // Navigate by URL: each tab file is a route of the same name (/home, /manage, …).
            onPress={() => {
              if (!focused) router.navigate(`/${route.name}`);
            }}
            style={styles.item}
          >
            <View style={[styles.pill, focused && styles.pillOn]}>
              <Ionicons name={focused ? on : off} size={20} color={tint} />
            </View>
            <T weight="bold" size={10} color={tint} numberOfLines={1} maxFontSizeMultiplier={1.15}>
              {label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="manage" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="services" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, paddingHorizontal: 6 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 50 },
  pill: { width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.goldLight },
});
