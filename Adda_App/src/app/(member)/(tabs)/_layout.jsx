import { Tabs } from 'expo-router';
import { TabBar } from '../../../components/TabBar';
import { colors } from '../../../theme';

/** Template bottom navigation: Home · Society · Properties · Services · Profile. */
const TABS = {
  home: ['home', 'home-outline', 'Home', true],
  manage: ['business', 'business-outline', 'Society'],
  explore: ['home', 'home-outline', 'Properties'],
  services: ['construct', 'construct-outline', 'Services'],
  profile: ['person', 'person-outline', 'Profile'],
};

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} tabs={TABS} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="manage" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="services" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
