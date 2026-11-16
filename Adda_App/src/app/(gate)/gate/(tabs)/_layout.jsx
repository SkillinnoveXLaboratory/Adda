import { Tabs } from 'expo-router';
import { GateTabBar } from '../../../../components/GateTabBar';
import { colors } from '../../../../theme';

/** Gate bottom navigation: Guests · Add guest · Members · Profile. route → [active icon, icon, label, href]. */
const TABS = {
  index: ['people', 'people-outline', 'Guests', '/gate'],
  add: ['person-add', 'person-add-outline', 'Add guest', '/gate/add'],
  members: ['call', 'call-outline', 'Members', '/gate/members'],
  profile: ['shield-checkmark', 'shield-checkmark-outline', 'Profile', '/gate/profile'],
};

export default function GateTabsLayout() {
  return (
    <Tabs tabBar={(props) => <GateTabBar {...props} tabs={TABS} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="add" />
      <Tabs.Screen name="members" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
