import { Stack } from 'expo-router';
import { colors } from '../../theme';

/** Vendor accounts: dashboard, listings, bookings, ads, profile. No society screens are reachable from here. */
export default function VendorLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }} />;
}
