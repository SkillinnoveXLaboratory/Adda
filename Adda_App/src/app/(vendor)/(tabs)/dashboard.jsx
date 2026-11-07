import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, ErrorState, Screen, SectionTitle, Skeleton, T } from '../../../components/ui';
import { Banner } from '../../../components/Banner';
import { BookingCard } from '../../../components/BookingCard';
import { BrandHeader } from '../../../components/BrandHeader';
import { KycStatusCard } from '../../../components/KycStatusCard';
import { NIcon } from '../../../components/NivasaIcons';
import { GridTile, TileGrid } from '../../../components/Tiles';
import { useAuth } from '../../../context/auth';
import { useApi } from '../../../hooks/useApi';
import { greeting, money } from '../../../lib/format';
import { colors, shadow } from '../../../theme';

const sum = (o = {}) => Object.values(o).reduce((a, b) => a + b, 0);

/** Vendor home: KYC status, business numbers, quick actions and the latest open bookings. */
export default function VendorDashboard() {
  const { user, refreshProfile } = useAuth();
  const dash = useApi('/vendor/dashboard');
  const open = useApi('/vendor/bookings', { query: { status: 'open', limit: 3 } });
  const unread = useApi('/notifications', { query: { limit: 1 } });
  const d = dash.data;
  const verified = d?.kycStatus === 'approved';
  const refresh = () => {
    dash.refresh();
    open.refresh();
    unread.refresh();
    refreshProfile().catch(() => {});
  };
  const needKyc = (go) => () => (verified ? go() : router.push('/kyc'));

  return (
    <Screen padded={false} statusBar="light" refreshing={dash.refreshing} onRefresh={refresh} contentStyle={{ paddingBottom: 24 }} header={<BrandHeader unread={unread.data?.unread || 0} />}>
      <View style={styles.body}>
        <View style={styles.greet}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="semibold" size={12} color="#64748b">
              {greeting()},
            </T>
            <T weight="extrabold" size={16} color={colors.navy} numberOfLines={1}>
              {d?.businessName || user?.name || 'Vendor'}
            </T>
            <T size={11.5} color={colors.muted}>
              {verified ? 'Verified vendor' : 'Vendor account'}
            </T>
          </View>
          <Pressable onPress={() => router.push('/vendor-profile')} accessibilityRole="button" accessibilityLabel="Your profile" style={styles.avatarRing}>
            <Avatar name={d?.businessName || user?.name} size={42} />
          </Pressable>
        </View>

        {dash.error && !d ? <ErrorState error={dash.error} onRetry={dash.reload} /> : null}
        {d && !verified ? <KycStatusCard status={d.kycStatus} note={d.kycNote} /> : null}

        <Banner
          tone="dark"
          eyebrow="FOR VENDORS"
          title={'Grow your business\nwith NIVASA'}
          action={verified ? 'Boost a post' : 'Complete KYC'}
          onAction={verified ? () => router.push('/boost') : () => router.push('/kyc')}
          testID="vendor-banner"
        />

        {!d ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Skeleton height={96} radius={16} style={{ flex: 1 }} />
            <Skeleton height={96} radius={16} style={{ flex: 1 }} />
          </View>
        ) : (
          <View style={styles.stats}>
            <Stat nicon="properties" value={sum(d.properties)} label="Properties" note={d.properties.pending ? `${d.properties.pending} in review` : null} onPress={() => router.push({ pathname: '/vendor-listings', params: { tab: 'property' } })} />
            <Stat nicon="maintenance" value={sum(d.services)} label="Services" note={d.services.pending ? `${d.services.pending} in review` : null} onPress={() => router.push({ pathname: '/vendor-listings', params: { tab: 'service' } })} />
            <Stat nicon="calendar" value={(d.bookings.requested || 0) + (d.bookings.accepted || 0)} label="Open bookings" note={d.bookings.requested ? `${d.bookings.requested} new` : null} onPress={() => router.push('/vendor-bookings')} />
            <Stat nicon="cash" value={money(d.cashCollectedPaise)} label="Cash recorded" note={`${d.paidBookings} paid job${d.paidBookings === 1 ? '' : 's'}`} onPress={() => router.push('/vendor-bookings')} />
          </View>
        )}

        {d ? (
          <View style={styles.settle} testID="vendor-settlement">
            <T weight="bold" size={13.5} color={colors.navy}>
              Settlement with NIVASA
            </T>
            <T size={11.5} color={colors.muted}>
              Platform commission now: {d.commissionPercent || 0}% · applies to services you publish or edit
            </T>
            <View style={styles.settleRow}>
              <T size={12.5} color="#475569">
                Commission on paid jobs
              </T>
              <T weight="semibold" size={12.5} color="#334155">
                {money(d.settlement?.commissionPaise || 0)}
              </T>
            </View>
            <View style={styles.settleRow}>
              <T size={12.5} color="#475569">
                Coupon credits (NIVASA pays you)
              </T>
              <T weight="semibold" size={12.5} color={colors.green}>
                − {money(d.settlement?.couponCreditsPaise || 0)}
              </T>
            </View>
            <View style={[styles.settleRow, styles.settleTotal]}>
              <T weight="bold" size={13} color={colors.navy}>
                {(d.settlement?.netToPlatformPaise || 0) < 0 ? 'NIVASA owes you' : 'You owe NIVASA'}
              </T>
              <T weight="extrabold" size={14} color={(d.settlement?.netToPlatformPaise || 0) > 0 ? colors.amber : colors.green}>
                {money(Math.abs(d.settlement?.netToPlatformPaise || 0))}
              </T>
            </View>
          </View>
        ) : null}

        <SectionTitle title="Quick actions" />
        <TileGrid columns={3}>
          <GridTile nicon="properties" label={'Add\nproperty'} onPress={needKyc(() => router.push('/properties/edit'))} testID="vendor-add-property" />
          <GridTile nicon="maintenance" label={'Add\nservice'} onPress={needKyc(() => router.push('/offers/edit'))} testID="vendor-add-service" />
          <GridTile nicon="boost" label={'Boost\na post'} badge={d?.ads?.active ? String(d.ads.active) : undefined} onPress={needKyc(() => router.push('/boost'))} testID="vendor-boost" />
        </TileGrid>

        <SectionTitle title="New & upcoming bookings" action="View all" onAction={() => router.push('/vendor-bookings')} />
        {open.data?.items?.length ? (
          <View style={{ gap: 10 }}>
            {open.data.items.map((b) => (
              <BookingCard key={b._id} booking={b} onChanged={refresh} />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <NIcon name="calendar" size={28} />
            <T size={12.5} color={colors.muted} style={{ flex: 1 }}>
              {open.loading ? 'Loading bookings…' : 'No open bookings. Members book your services from Home Maintenance.'}
            </T>
          </View>
        )}
      </View>
    </Screen>
  );
}

function Stat({ nicon, value, label, note, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={({ pressed }) => [styles.stat, pressed && { borderColor: colors.gold }]}>
      <NIcon name={nicon} size={30} />
      <T weight="extrabold" size={17} color={colors.navy} numberOfLines={1} style={{ marginTop: 4 }}>
        {value}
      </T>
      <T weight="bold" size={11.5} color="#475569" numberOfLines={1}>
        {label}
      </T>
      {note ? (
        <T size={10.5} color={colors.goldText} numberOfLines={1}>
          {note}
        </T>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16 },
  greet: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  avatarRing: { borderRadius: 26, borderWidth: 2, borderColor: colors.white, ...shadow.card },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '48%', flexGrow: 1, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 1, ...shadow.card },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
  settle: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6, ...shadow.card },
  settleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  settleTotal: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 2 },
});
