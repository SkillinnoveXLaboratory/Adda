import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AsyncView, EmptyState, Hero, ListRow, LoadingList, Screen, SearchBar, SectionTitle, T } from '../../../components/ui';
import { OfferCard } from '../../../components/OfferCard';
import { GridTile, TileGrid } from '../../../components/Tiles';
import { useApi } from '../../../hooks/useApi';
import { colors, shadow } from '../../../theme';

/** Category name → [icon, tone]. Unknown categories get a generic tool icon. */
const SERVICE_ICON = {
  Plumber: ['water-outline', 'blue'],
  Plumbing: ['water-outline', 'blue'],
  Electrician: ['flash-outline', 'amber'],
  Electrical: ['flash-outline', 'amber'],
  Carpenter: ['hammer-outline', 'gold'],
  Carpentry: ['hammer-outline', 'gold'],
  Housekeeping: ['sparkles-outline', 'green'],
  Cleaning: ['sparkles-outline', 'green'],
  'Pest Control': ['bug-outline', 'rose'],
  'Appliance Repair': ['snow-outline', 'blue'],
  'AC & Appliances': ['snow-outline', 'blue'],
  Painting: ['color-palette-outline', 'purple'],
  Gardening: ['leaf-outline', 'green'],
};

/** Home Maintenance (prototype screen 7). */
export default function Services() {
  const cats = useApi('/resident/service-categories');
  const offers = useApi('/service-offers', { query: { limit: 4 } });
  const [q, setQ] = useState('');
  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = cats.data?.items || [];
    return t ? all.filter((c) => c.name.toLowerCase().includes(t) || (c.description || '').toLowerCase().includes(t)) : all;
  }, [cats.data, q]);

  return (
    <Screen refreshing={cats.refreshing || offers.refreshing} onRefresh={() => (cats.refresh(), offers.refresh())} header={<Hero title="Home Maintenance" onBell={() => router.push('/notifications')} />}>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search service..." />
      <AsyncView state={cats} skeleton={<LoadingList rows={2} card={88} />} empty={{ when: (d) => !d.items.length, icon: 'construct-outline', title: 'No services listed', message: 'Your society has not listed home services yet.' }}>
        {() =>
          items.length ? (
            <TileGrid columns={3}>
              {items.map((c) => {
                const [icon, tone] = SERVICE_ICON[c.name] || ['construct-outline', 'slate'];
                return <GridTile key={c._id} icon={icon} tone={tone} label={c.name} onPress={() => router.push({ pathname: '/service/new', params: { categoryId: c._id, name: c.name } })} />;
              })}
            </TileGrid>
          ) : (
            <EmptyState icon="search-outline" title="No matching service" message={`Nothing matches “${q.trim()}”. Try another word.`} />
          )
        }
      </AsyncView>

      <SectionTitle title="Local service providers" action={offers.data?.total ? 'See all' : undefined} onAction={() => router.push('/offers')} />
      {offers.data?.items?.length ? (
        <View style={{ gap: 10 }}>
          {offers.data.items.map((o) => (
            <OfferCard key={o._id} item={o} onPress={() => router.push(`/offers/${o._id}`)} />
          ))}
        </View>
      ) : offers.loading && !offers.data ? (
        <LoadingList rows={2} card={92} />
      ) : null}
      <Pressable onPress={() => router.push('/offers/edit')} accessibilityRole="button" accessibilityLabel="Offer your service" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.navy, borderRadius: 16, padding: 14, ...shadow.button }, pressed && { opacity: 0.92 }]}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={22} color={colors.navy} />
        </View>
        <View style={{ flex: 1 }}>
          <T weight="bold" size={13.5} color={colors.white}>
            Offer your service
          </T>
          <T size={11.5} color="#cbd5e1">
            Plumber, tutor, cook, electrician? Get calls from neighbours.
          </T>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.gold} />
      </Pressable>

      <SectionTitle title="Your requests" />
      <View style={{ gap: 10 }}>
        <ListRow icon="build-outline" tone="green" title="My service requests" subtitle="Track booked visits and their status" onPress={() => router.push('/service-requests')} />
        <ListRow icon="calendar-outline" tone="gold" title="My bookings" subtitle="Clubhouse, hall and other amenities" onPress={() => router.push('/bookings')} />
        <ListRow icon="megaphone-outline" tone="coral" title="My complaints" subtitle="Society maintenance issues" onPress={() => router.push('/complaints')} />
      </View>
    </Screen>
  );
}
