import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, BellButton, Card, ErrorState, ListRow, Screen, SectionTitle, Skeleton, T } from '../../../components/ui';
import { BrandBar, LogoMark } from '../../../components/Logo';
import { ModuleCard, TileGrid } from '../../../components/Tiles';
import { useAuth } from '../../../context/auth';
import { useApi } from '../../../hooks/useApi';
import { formatDate, greeting, money, periodLabel, timeRange } from '../../../lib/format';
import { colors, shadow } from '../../../theme';

/** White top bar (prototype home): logo + NIVASA, bell, avatar → profile. */
function TopBar({ unread, name }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.topRow}>
        <BrandBar />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <BellButton unread={unread} color="#475569" onPress={() => router.push('/notifications')} />
          <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Your profile" hitSlop={6} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Avatar name={name} size={34} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function Home() {
  const { user } = useAuth();
  const home = useApi('/resident/home');
  const d = home.data;
  const firstName = (user?.name || 'Resident').split(' ')[0];

  return (
    <Screen padded={false} statusBar="dark" refreshing={home.refreshing} onRefresh={home.refresh} contentStyle={{ paddingBottom: 24 }} header={<TopBar unread={d?.unreadNotifications || 0} name={user?.name} />}>
      <View style={styles.body}>
        <View>
          <T weight="medium" size={12} color={colors.muted}>
            {greeting()},
          </T>
          <T weight="bold" size={15} numberOfLines={1}>
            {user?.name || firstName}
          </T>
          {d ? (
            <T size={11.5} color={colors.muted} numberOfLines={1} style={{ marginTop: 1 }}>
              {d.society.name} · {d.membership.flat.building} · Flat {d.membership.flat.number}
            </T>
          ) : null}
        </View>

        <LinearGradient colors={[colors.navy, colors.navySoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.promo, shadow.button]}>
          <LogoMark size={130} rounded={false} style={styles.promoMark} />
          <View style={{ width: '66%', gap: 9 }}>
            <T weight="bold" size={15} color={colors.white} style={{ lineHeight: 20 }}>
              Better Living Starts Here
            </T>
            <Pressable onPress={() => router.push('/explore')} accessibilityRole="button" style={({ pressed }) => [styles.promoBtn, pressed && { backgroundColor: colors.goldDark }]}>
              <T weight="bold" size={11} color="#0f172a">
                Explore Properties
              </T>
            </Pressable>
          </View>
        </LinearGradient>

        <TileGrid columns={2}>
          <ModuleCard icon="business-outline" tone="blue" label="Society Management" onPress={() => router.push('/manage')} testID="home-society" />
          <ModuleCard icon="home-outline" tone="amber" label="Properties" caption="Buy / Sell / Rent" onPress={() => router.push('/explore')} testID="home-properties" />
          <ModuleCard icon="construct-outline" tone="green" label="Home Maintenance" onPress={() => router.push('/services')} testID="home-services" />
          <ModuleCard icon="people-outline" tone="purple" label="Community & Events" onPress={() => router.push('/community')} testID="home-community" />
        </TileGrid>

        {home.error && !d ? (
          <ErrorState error={home.error} onRetry={home.reload} />
        ) : !d ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={72} radius={12} />
            <Skeleton height={64} radius={12} />
          </View>
        ) : (
          <>
            <SectionTitle title="Recent Activities" action="View All" onAction={() => router.push('/notifications')} />
            <DuesAlert dues={d.dues} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatTile icon="megaphone-outline" tone="rose" value={d.openComplaints} label="Open complaints" onPress={() => router.push('/complaints')} />
              <StatTile icon="stats-chart-outline" tone="purple" value={d.openPolls} label="Open polls" onPress={() => router.push('/community')} />
            </View>

            <SectionTitle title="Latest announcements" action={d.announcements.length ? 'See all' : undefined} onAction={() => router.push('/notices')} />
            {d.announcements.length ? (
              d.announcements.map((a) => (
                <ListRow
                  key={a._id}
                  icon={a.important ? 'megaphone' : 'megaphone-outline'}
                  tone={a.important ? 'coral' : 'amber'}
                  title={a.title}
                  subtitle={formatDate(a.createdAt)}
                  right={a.important ? <Badge label="Important" tone="danger" /> : null}
                  onPress={() => router.push(`/notices/${a._id}`)}
                />
              ))
            ) : (
              <Card style={styles.emptyRow}>
                <Ionicons name="megaphone-outline" size={20} color="#94a3b8" />
                <T size={12.5} color={colors.muted}>
                  No announcements from your society yet.
                </T>
              </Card>
            )}

            <SectionTitle title="Upcoming bookings" action="Book" onAction={() => router.push('/facilities')} />
            {d.upcomingBookings.length ? (
              d.upcomingBookings.map((b) => {
                const day = new Date(b.start);
                return (
                  <Card key={b._id} onPress={() => router.push('/bookings')} style={styles.event}>
                    <View style={styles.eventDate}>
                      <T weight="extrabold" size={16} color={colors.navy} style={{ lineHeight: 20 }}>
                        {day.toLocaleDateString('en-IN', { day: '2-digit', timeZone: 'Asia/Kolkata' })}
                      </T>
                      <T weight="bold" size={9.5} color={colors.goldText}>
                        {day.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }).toUpperCase()}
                      </T>
                    </View>
                    <View style={{ flex: 1 }}>
                      <T weight="bold" size={13.5} numberOfLines={1}>
                        {b.facility}
                      </T>
                      <T size={11.5} color={colors.muted}>
                        {timeRange(b.start, b.end)}
                      </T>
                    </View>
                    <Badge status={b.status} />
                  </Card>
                );
              })
            ) : (
              <Card style={styles.emptyRow}>
                <Ionicons name="calendar-outline" size={20} color="#94a3b8" />
                <T size={12.5} color={colors.muted}>
                  No upcoming bookings.
                </T>
              </Card>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

/** "Maintenance Bill Due" activity card (prototype amber alert), or an all-clear card. */
function DuesAlert({ dues }) {
  const inv = dues.nextInvoice;
  if (!inv) {
    return (
      <View style={[styles.alert, { borderColor: '#a7f3d0' }]}>
        <View style={[styles.alertIcon, { backgroundColor: '#d1fae5' }]}>
          <Ionicons name="checkmark-circle" size={18} color="#047857" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="bold" size={12.5}>
            All caught up
          </T>
          <T size={11} color={colors.muted}>
            You have no pending maintenance dues.
          </T>
        </View>
      </View>
    );
  }
  return (
    <Pressable onPress={() => router.push(`/invoice/${inv._id}`)} accessibilityRole="button" accessibilityLabel="View maintenance bill" style={({ pressed }) => [styles.alert, { borderColor: inv.overdue ? '#fecaca' : '#fde68a' }, pressed && { opacity: 0.9 }]}>
      <View style={[styles.alertIcon, { backgroundColor: inv.overdue ? '#fee2e2' : '#fef3c7' }]}>
        <Ionicons name="warning-outline" size={18} color={inv.overdue ? '#b91c1c' : '#b45309'} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="bold" size={12.5}>
          {inv.overdue ? 'Maintenance Bill Overdue' : 'Maintenance Bill Due'}
        </T>
        <T size={11} color={colors.muted} style={{ lineHeight: 16 }}>
          Your {periodLabel(inv.period)} maintenance bill of {money(inv.balancePaise)} is due on {formatDate(inv.dueDate)}.
          {dues.openInvoices > 1 ? ` ${dues.openInvoices} open bills, ${money(dues.outstandingPaise)} in total.` : ''}
        </T>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
    </Pressable>
  );
}

function StatTile({ icon, tone, value, label, onPress }) {
  const [bg, fg] = { rose: colors.tileRose, purple: colors.tilePurple }[tone] || colors.tileBlue;
  return (
    <Card onPress={onPress} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }} accessibilityLabel={`${value} ${label}`}>
      <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={fg} />
      </View>
      <View style={{ flex: 1 }}>
        <T weight="extrabold" size={17} style={{ lineHeight: 21 }}>
          {value}
        </T>
        <T size={11} color={colors.muted} numberOfLines={1}>
          {label}
        </T>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  topBar: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingHorizontal: 16 },
  topRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { padding: 16, gap: 14 },
  promo: { borderRadius: 16, padding: 16, minHeight: 104, justifyContent: 'center', overflow: 'hidden' },
  promoMark: { position: 'absolute', right: -16, top: -12, opacity: 0.35 },
  promoBtn: { alignSelf: 'flex-start', backgroundColor: colors.gold, borderRadius: 8, paddingHorizontal: 12, minHeight: 34, justifyContent: 'center' },
  alert: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderRadius: 12, padding: 12, ...shadow.card },
  alertIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  eventDate: { backgroundColor: colors.goldLight, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 50 },
});
