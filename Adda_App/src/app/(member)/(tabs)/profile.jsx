import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Avatar, Badge, Card, Hero, IconButton, Screen, T } from '../../../components/ui';
import { BRAND } from '../../../components/Logo';
import { useAuth } from '../../../context/auth';
import { API_URL } from '../../../lib/config';
import { confirm, notify } from '../../../lib/dialog';
import { titleCase } from '../../../lib/format';
import { colors } from '../../../theme';

const OPTIONS = [
  ['My Service Bookings', 'calendar-number-outline', '/service-bookings'],
  ['My Listings', 'pricetags-outline', '/my-listings'],
  ['My Society', 'business-outline', '/memberships'],
  ['My Bookings', 'calendar-outline', '/bookings'],
  ['Payment History', 'card-outline', '/payments'],
  ['My Complaints', 'megaphone-outline', '/complaints'],
  ['Service Requests', 'build-outline', '/service-requests'],
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

export default function Profile() {
  const { user, activeMembership: m, signOut } = useAuth();

  const logout = async () => {
    const ok = await confirm({ title: 'Log out?', message: 'You will need your mobile number and password to sign in again.', confirmText: 'Log out', destructive: true });
    if (ok) await signOut();
  };

  return (
    <Screen header={<Hero title="Profile" right={<IconButton icon="settings-outline" label="Account settings" color={colors.white} onPress={() => router.push('/edit-profile')} />} />}>
      <Card style={{ alignItems: 'center', gap: 2, paddingVertical: 18 }}>
        <Avatar name={user?.name} size={64} />
        <T weight="extrabold" size={15} numberOfLines={1} style={{ marginTop: 8 }}>
          {user?.name}
        </T>
        <T weight="medium" size={12} color={colors.muted}>
          +91 {user?.phone}
        </T>
        {user?.email ? (
          <T size={11} color="#94a3b8" numberOfLines={1}>
            {user.email}
          </T>
        ) : null}
        <View style={{ marginTop: 8 }}>
          <Badge status="approved" label="Approved resident" />
        </View>
      </Card>

      {m ? (
        <Pressable onPress={() => router.push('/memberships')} accessibilityRole="button" style={({ pressed }) => [styles.society, pressed && { opacity: 0.92 }]}>
          <View style={styles.societyIcon}>
            <Ionicons name="business" size={19} color={colors.gold} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <T weight="bold" size={13.5} color={colors.white} numberOfLines={1}>
              {m.society?.name}
            </T>
            <T size={11.5} color="#cbd5e1" numberOfLines={1}>
              {m.building?.name} · Flat {m.flat?.number} · {titleCase(m.residentType)}
            </T>
            <T size={11} color="#94a3b8">
              Society code {m.society?.code}
            </T>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
        </Pressable>
      ) : null}

      <View style={styles.menu}>
        {OPTIONS.map(([label, icon, href]) => (
          <MenuRow key={label} icon={icon} label={label} onPress={() => router.push(href)} />
        ))}
        <MenuRow icon="help-circle-outline" label="Help & Support" onPress={() => notify('Help & support', 'For bills, approvals or account access, contact your society office. For app issues, email support@skillinnovex.in.')} />
        <MenuRow icon="log-out-outline" label="Logout" danger last onPress={logout} />
      </View>

      <T size={11} color={colors.subtle} style={{ textAlign: 'center' }}>
        {BRAND} v{Constants.expoConfig?.version || '1.0.0'} · {API_URL.replace(/^https?:\/\//, '')}
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  society: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.navy, borderRadius: 16, padding: 14 },
  societyIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(212,175,55,0.14)', alignItems: 'center', justifyContent: 'center' },
  menu: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 50 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
});
