import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Card, ErrorState, ListRow, Screen, SectionTitle, Skeleton, T } from '../../../components/ui';
import { BrandHeader } from '../../../components/BrandHeader';
import { Banner } from '../../../components/Banner';
import { ModuleCard, TileGrid } from '../../../components/Tiles';
import { useAuth } from '../../../context/auth';
import { useApi } from '../../../hooks/useApi';
import { formatDate, greeting, money, periodLabel, timeRange } from '../../../lib/format';
import { colors, shadow } from '../../../theme';

export default function Home() {
  const { user } = useAuth();
  const home = useApi('/resident/home');
  const d = home.data;
  const firstName = (user?.name || 'Resident').split(' ')[0];

  return (
    <Screen padded={false} statusBar="light" refreshing={home.refreshing} onRefresh={home.refresh} contentStyle={{ paddingBottom: 24 }} header={<BrandHeader unread={d?.unreadNotifications || 0} />}>
      <View style={styles.body}>
        <View style={styles.greet}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="semibold" size={12} color="#64748b">
              {greeting()},
            </T>
            <T weight="extrabold" size={16} color={colors.navy} numberOfLines={1} style={{ letterSpacing: -0.2 }}>
              {user?.name || firstName}
            </T>
            {d ? (
              <T size={11.5} color={colors.muted} numberOfLines={1} style={{ marginTop: 1 }}>
                {d.society.name} · {d.membership.flat.building} · Flat {d.membership.flat.number}
              </T>
            ) : null}
          </View>
          <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Your profile" hitSlop={6} style={styles.avatarRing}>
            <Avatar name={user?.name} size={42} />
          </Pressable>
        </View>

        <Banner tone="dark" title={'Better Living\nStarts Here'} action="Explore Properties" onAction={() => router.push('/explore')} testID="home-banner" />

        <TileGrid columns={2}>
          <ModuleCard nicon="society" label={'Society\nManagement'} onPress={() => router.push('/manage')} testID="home-society" />
          <ModuleCard nicon="properties" label="Properties" caption="Buy / Rent" onPress={() => router.push('/explore')} testID="home-properties" />
          <ModuleCard nicon="maintenance" label={'Home\nMaintenance'} onPress={() => router.push('/services')} testID="home-services" />
          <ModuleCard nicon="community" label={'Community\n& Events'} onPress={() => router.push('/community')} testID="home-community" />
        </TileGrid>

        {home.error && !d ? (
          <ErrorState error={home.error} onRetry={home.reload} />
        ) : !d ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={72} radius={16} />
            <Skeleton height={64} radius={16} />
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

/** "Maintenance Bill Due" activity card (template: amber bell circle, text, chevron), or an all-clear card. */
function DuesAlert({ dues }) {
  const inv = dues.nextInvoice;
  if (!inv) {
    return (
      <View style={[styles.alert, { borderColor: colors.border }]}>
        <View style={[styles.alertIcon, { backgroundColor: '#d1fae5' }]}>
          <Ionicons name="checkmark-circle" size={18} color="#047857" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="bold" size={12.5} color={colors.navy}>
            All caught up
          </T>
          <T size={11} color="#64748b">
            You have no pending maintenance dues.
          </T>
        </View>
      </View>
    );
  }
  return (
    <Pressable onPress={() => router.push(`/invoice/${inv._id}`)} accessibilityRole="button" accessibilityLabel="View maintenance bill" style={({ pressed }) => [styles.alert, { borderColor: inv.overdue ? '#fecaca' : colors.border }, pressed && { borderColor: colors.gold }]}>
      <View style={[styles.alertIcon, { backgroundColor: inv.overdue ? '#fee2e2' : '#fef3c7' }]}>
        <Ionicons name="notifications" size={18} color={inv.overdue ? '#b91c1c' : '#b45309'} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="bold" size={12.5} color={colors.navy}>
          {inv.overdue ? 'Maintenance Bill Overdue' : 'Maintenance Bill Due'}
        </T>
        <T size={11} color="#64748b" style={{ lineHeight: 16 }}>
          Your {periodLabel(inv.period)} maintenance bill of {money(inv.balancePaise)} is due on {formatDate(inv.dueDate)}.
          {dues.openInvoices > 1 ? ` ${dues.openInvoices} open bills, ${money(dues.outstandingPaise)} in total.` : ''}
        </T>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={{ alignSelf: 'center' }} />
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
  body: { padding: 16, gap: 16 },
  greet: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  avatarRing: { borderRadius: 26, borderWidth: 2, borderColor: colors.white, ...shadow.card },
  alert: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderRadius: 16, padding: 12, ...shadow.card },
  alertIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  eventDate: { backgroundColor: colors.goldLight, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 50 },
});
