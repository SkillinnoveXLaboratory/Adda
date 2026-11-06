import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Avatar, Badge, Card, Hero, IconButton, Screen, T } from '../../../components/ui';
import { BRAND } from '../../../components/Logo';
import { useAuth } from '../../../context/auth';
import { API_URL } from '../../../lib/config';
import { confirm, notify } from '../../../lib/dialog';
import { colors } from '../../../theme';

const KYC_BADGE = { approved: ['Verified vendor', 'success'], pending: ['KYC under review', 'warning'], rejected: ['KYC needs changes', 'danger'], not_submitted: ['KYC not submitted', 'warning'] };

const OPTIONS = [
  ['KYC & bank details', 'shield-checkmark-outline', '/kyc'],
  ['My listings', 'pricetags-outline', '/vendor-listings'],
  ['Bookings', 'calendar-outline', '/vendor-bookings'],
  ['My boosts', 'rocket-outline', '/ads'],
  ['Notifications', 'notifications-outline', '/notifications'],
  ['Edit Profile', 'create-outline', '/edit-profile'],
  ['Change Password', 'lock-closed-outline', '/change-password'],
];

function MenuRow({ icon, label, onPress, danger, last }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { backgroundColor: danger ? '#fef2f2' : '#f8fafc' }]}>
      <Ionicons name={icon} size={19} color={danger ? '#dc2626' : '#475569'} />
      <T weight="semibold" size={13} color={danger ? '#dc2626' : '#334155'} style={{ flex: 1 }}>
        {label}
      </T>
      <Ionicons name="chevron-forward" size={16} color={danger ? '#dc2626' : '#94a3b8'} />
    </Pressable>
  );
}

/** Vendor profile: business identity + KYC status; no society section (vendors are outside every society). */
export default function VendorProfile() {
  const { user, vendor, signOut } = useAuth();
  const [label, tone] = KYC_BADGE[vendor?.kycStatus || 'not_submitted'];

  const logout = async () => {
    const ok = await confirm({ title: 'Log out?', message: 'You will need your mobile number and password to sign in again.', confirmText: 'Log out', destructive: true });
    if (ok) await signOut();
  };

  return (
    <Screen header={<Hero title="Profile" right={<IconButton icon="settings-outline" label="Account settings" color={colors.white} onPress={() => router.push('/edit-profile')} />} />}>
      <Card style={{ alignItems: 'center', gap: 2, paddingVertical: 18 }}>
        <Avatar name={vendor?.businessName || user?.name} size={64} />
        <T weight="extrabold" size={15} numberOfLines={1} style={{ marginTop: 8 }}>
          {vendor?.businessName || user?.name}
        </T>
        {vendor?.businessName && vendor.businessName !== user?.name ? (
          <T weight="medium" size={12} color={colors.muted}>
            {user?.name}
          </T>
        ) : null}
        <T weight="medium" size={12} color={colors.muted}>
          +91 {user?.phone}
        </T>
        <View style={{ marginTop: 8 }}>
          <Badge label={label} tone={tone} />
        </View>
      </Card>

      <View style={styles.menu}>
        {OPTIONS.map(([text, icon, href]) => (
          <MenuRow key={text} icon={icon} label={text} onPress={() => router.push(href)} />
        ))}
        <MenuRow icon="help-circle-outline" label="Help & Support" onPress={() => notify('Help & support', 'For KYC, listings or ads, email support@skillinnovex.in with your registered mobile number.')} />
        <MenuRow icon="log-out-outline" label="Logout" danger last onPress={logout} />
      </View>

      <T size={11} color={colors.subtle} style={{ textAlign: 'center' }}>
        {BRAND} v{Constants.expoConfig?.version || '1.0.0'} · {API_URL.replace(/^https?:\/\//, '')}
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  menu: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 50 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
});
