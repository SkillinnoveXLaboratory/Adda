import { Tabs } from 'expo-router';
import { TabBar } from '../../../components/TabBar';
import { colors } from '../../../theme';

/** Vendor bottom navigation (template style): Home · Listings · Bookings · Boost · Profile. */
const TABS = {
  dashboard: ['home', 'home-outline', 'Home', true],
  'vendor-listings': ['pricetags', 'pricetags-outline', 'Listings'],
  'vendor-bookings': ['calendar', 'calendar-outline', 'Bookings'],
  ads: ['rocket', 'rocket-outline', 'Boost'],
  'vendor-profile': ['person', 'person-outline', 'Profile'],
};

export default function VendorTabs() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} tabs={TABS} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="vendor-listings" />
      <Tabs.Screen name="vendor-bookings" />
      <Tabs.Screen name="ads" />
      <Tabs.Screen name="vendor-profile" />
    </Tabs>
  );
}
