import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Hero, Screen, SectionTitle, T } from '../../../components/ui';
import { Banner } from '../../../components/Banner';
import { GridTile, TileGrid } from '../../../components/Tiles';
import { useAuth } from '../../../context/auth';
import { useApi } from '../../../hooks/useApi';
import { money } from '../../../lib/format';
import { colors, shadow } from '../../../theme';

/** Society modules (template "Society Management" 3×3 grid) — only features the app really has. */
const MODULES = [
  ['Maintenance\nBills', 'bills', '/bills'],
  ['Payments', 'payments', '/payments'],
  ['Complaints', 'complaints', '/complaints'],
  ['Notices', 'notices', '/notices'],
  ['Community', 'people', '/community'],
  ['Amenities', 'amenities', '/facilities'],
  ['My Bookings', 'calendar', '/bookings'],
  ['Service\nRequests', 'requests', '/service-requests'],
  ['Local Market', 'market', '/marketplace'],
];

export default function SocietyHub() {
  const { activeMembership: m } = useAuth();
  const home = useApi('/resident/home');
  const d = home.data;
  const where = [m?.building?.name, m?.society?.city].filter(Boolean).join(', ');

  return (
    <Screen padded={false} refreshing={home.refreshing} onRefresh={home.refresh} header={<Hero title="Society Management" onBack={() => router.navigate('/home')} unread={d?.unreadNotifications || 0} onBell={() => router.push('/notifications')} />}>
      <View style={styles.body}>
        <Banner
          tone="light"
          title={m?.society?.name || 'Your society'}
          subtitle={[where, m?.flat?.number ? `Flat ${m.flat.number}` : null].filter(Boolean).join(' · ')}
          action="View Details"
          onAction={() => router.push('/memberships')}
          testID="society-banner"
        />

        {d?.dues?.outstandingPaise > 0 ? (
          <Pressable onPress={() => router.push('/bills')} accessibilityRole="button" style={({ pressed }) => [styles.dues, pressed && { opacity: 0.9 }]}>
            <Ionicons name="alert-circle" size={20} color={colors.amber} />
            <T size={12.5} color="#78350f" style={{ flex: 1 }}>
              <T weight="bold" size={12.5} color="#78350f">
                {money(d.dues.outstandingPaise)}
              </T>{' '}
              maintenance due{d.dues.overdueInvoices ? ` · ${d.dues.overdueInvoices} overdue` : ''}
            </T>
            <Ionicons name="chevron-forward" size={16} color={colors.amber} />
          </Pressable>
        ) : null}

        <TileGrid columns={3}>
          {MODULES.map(([label, nicon, href]) => (
            <GridTile
              key={href}
              nicon={nicon}
              label={label}
              testID={`module-${href.slice(1)}`}
              badge={href === '/complaints' && d?.openComplaints ? String(d.openComplaints) : href === '/community' && d?.openPolls ? String(d.openPolls) : undefined}
              onPress={() => router.push(href)}
            />
          ))}
        </TileGrid>

        <SectionTitle title="Quick action" />
        <Pressable onPress={() => router.push('/complaints/new')} accessibilityRole="button" style={({ pressed }) => [styles.raise, pressed && { borderColor: colors.gold }]}>
          <View style={styles.raiseIcon}>
            <Ionicons name="add" size={20} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <T weight="bold" size={13.5} color={colors.navy}>
              Raise a complaint
            </T>
            <T size={11.5} color={colors.muted}>
              Lift, water, parking, security — tracked until it’s resolved
            </T>
          </View>
          <Ionicons name="chevron-forward" size={17} color="#94a3b8" />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 14, gap: 14 },
  dues: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 16, padding: 12, minHeight: 48 },
  raise: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, ...shadow.card },
  raiseIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
});
