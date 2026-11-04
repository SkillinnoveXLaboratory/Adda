import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Hero, Screen, SectionTitle, T } from '../../../components/ui';
import { LogoMark } from '../../../components/Logo';
import { GridTile, TileGrid } from '../../../components/Tiles';
import { useAuth } from '../../../context/auth';
import { useApi } from '../../../hooks/useApi';
import { money, titleCase } from '../../../lib/format';
import { colors, shadow } from '../../../theme';

/** Every module of the resident's society (prototype screen 4 "Society Management"). */
const MODULES = [
  ['Maintenance Bills', 'receipt-outline', '/bills', 'blue'],
  ['Payments', 'card-outline', '/payments', 'green'],
  ['Complaints', 'megaphone-outline', '/complaints', 'rose'],
  ['Notices', 'pin-outline', '/notices', 'amber'],
  ['Community', 'people-outline', '/community', 'purple'],
  ['Amenities', 'water-outline', '/facilities', 'blue'],
  ['My Bookings', 'calendar-outline', '/bookings', 'gold'],
  ['Service Requests', 'build-outline', '/service-requests', 'green'],
  ['Local Market', 'bag-handle-outline', '/marketplace', 'slate'],
];

export default function SocietyHub() {
  const { activeMembership: m } = useAuth();
  const home = useApi('/resident/home');
  const d = home.data;

  return (
    <Screen padded={false} refreshing={home.refreshing} onRefresh={home.refresh} header={<Hero title="Society Management" unread={d?.unreadNotifications || 0} onBell={() => router.push('/notifications')} />}>
      <View style={styles.body}>
        <LinearGradient colors={[colors.navy, colors.navySoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.banner, shadow.button]}>
          <LogoMark size={120} rounded={false} style={styles.watermark} />
          <View style={{ flex: 1, gap: 3 }}>
            <T weight="bold" size={10} color={colors.gold} style={{ letterSpacing: 1 }}>
              MY SOCIETY
            </T>
            <T weight="extrabold" size={16} color={colors.white} numberOfLines={2}>
              {m?.society?.name || 'Your society'}
            </T>
            <T size={11.5} color="#cbd5e1" numberOfLines={1}>
              {[m?.building?.name, m?.flat?.number ? `Flat ${m.flat.number}` : null, m?.society?.city].filter(Boolean).join(' · ')}
            </T>
            {m?.residentType ? (
              <T size={11} color="#94a3b8">
                {titleCase(m.residentType)} · Code {m.society?.code}
              </T>
            ) : null}
          </View>
          <Pressable onPress={() => router.push('/memberships')} accessibilityRole="button" accessibilityLabel="View society details" style={({ pressed }) => [styles.bannerBtn, pressed && { backgroundColor: colors.goldDark }]}>
            <T weight="bold" size={11} color="#0f172a">
              View Details
            </T>
          </Pressable>
        </LinearGradient>

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

        <SectionTitle title="Manage" />
        <TileGrid columns={3}>
          {MODULES.map(([label, icon, href, tone]) => (
            <GridTile
              key={label}
              icon={icon}
              label={label}
              tone={tone}
              testID={`module-${href.slice(1)}`}
              badge={label === 'Complaints' && d?.openComplaints ? String(d.openComplaints) : label === 'Community' && d?.openPolls ? String(d.openPolls) : undefined}
              onPress={() => router.push(href)}
            />
          ))}
        </TileGrid>

        <Pressable onPress={() => router.push('/complaints/new')} accessibilityRole="button" style={({ pressed }) => [styles.raise, pressed && { opacity: 0.9 }]}>
          <View style={styles.raiseIcon}>
            <Ionicons name="add" size={20} color={colors.navy} />
          </View>
          <View style={{ flex: 1 }}>
            <T weight="bold" size={13.5}>
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
  body: { padding: 16, gap: 14 },
  banner: { borderRadius: 16, padding: 16, minHeight: 128, flexDirection: 'row', alignItems: 'flex-end', gap: 10, overflow: 'hidden' },
  watermark: { position: 'absolute', right: -18, top: -14, opacity: 0.16 },
  bannerBtn: { backgroundColor: colors.gold, borderRadius: 9, paddingHorizontal: 11, minHeight: 34, justifyContent: 'center' },
  dues: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 12, padding: 12, minHeight: 48 },
  raise: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 16, padding: 12, ...shadow.card },
  raiseIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
});
