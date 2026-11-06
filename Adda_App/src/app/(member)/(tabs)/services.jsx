import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, Hero, ListRow, LoadingList, Screen, SearchBar, SectionTitle, Skeleton } from '../../../components/ui';
import { resolveIconKey } from '../../../components/CategoryIcon';
import { PopularServiceCard } from '../../../components/OfferCard';
import { GridTile, TileGrid } from '../../../components/Tiles';
import { useApi } from '../../../hooks/useApi';

/** The template grid has 3 columns and 2 rows; with more categories the last tile becomes "Others" (all categories). */
const MAX_TILES = 6;

/** Home Maintenance (template): search, admin-managed categories (name, icon, order), popular vendor services. */
export default function Services() {
  const cats = useApi('/service-offers/categories', { refetchOnFocus: false });
  const offers = useApi('/service-offers', { query: { limit: 6 } });
  const [q, setQ] = useState('');
  const items = cats.data?.items || [];
  const tiles = items.length > MAX_TILES ? items.slice(0, MAX_TILES - 1) : items;
  const more = items.length > MAX_TILES;

  const search = () => {
    const t = q.trim();
    router.push(t ? { pathname: '/offers', params: { q: t } } : '/offers');
  };

  return (
    <Screen
      refreshing={cats.refreshing || offers.refreshing}
      onRefresh={() => (cats.refresh(), offers.refresh())}
      header={<Hero title="Home Maintenance" onBack={() => router.navigate('/home')} onBell={() => router.push('/notifications')} />}
    >
      <SearchBar value={q} onChangeText={setQ} placeholder="Search service..." onSubmit={search} />

      {cats.loading && !cats.data ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={96} radius={16} style={{ flex: 1 }} />
          ))}
        </View>
      ) : items.length ? (
        <TileGrid columns={3}>
          {tiles.map((c) => (
            <GridTile key={c._id} nicon={resolveIconKey(c.icon, c.name)} label={c.name} testID={`service-cat-${c._id}`} onPress={() => router.push({ pathname: '/offers', params: { categoryId: c._id } })} />
          ))}
          {more ? <GridTile key="others" nicon="others" label="Others" testID="service-cat-others" onPress={() => router.push('/offers')} /> : null}
        </TileGrid>
      ) : cats.error ? null : (
        <EmptyState icon="construct-outline" title="No categories yet" message="Service categories appear here once NIVASA adds them." />
      )}

      <SectionTitle title="Popular Services" action={offers.data?.total ? 'See all' : undefined} onAction={() => router.push('/offers')} />
      {offers.loading && !offers.data ? (
        <LoadingList rows={2} card={104} />
      ) : offers.data?.items?.length ? (
        <View style={{ gap: 10 }}>
          {offers.data.items.map((o) => (
            <PopularServiceCard
              key={o._id}
              item={o}
              onPress={() => router.push(`/offers/${o._id}`)}
              onBook={() => router.push({ pathname: '/offers/book', params: { id: o._id } })}
            />
          ))}
        </View>
      ) : (
        <EmptyState icon="construct-outline" title="No services yet" message="Verified vendors near you will appear here once their services are approved." />
      )}

      <SectionTitle title="Your requests" />
      <View style={{ gap: 10 }}>
        <ListRow icon="calendar-number-outline" tone="gold" title="My service bookings" subtitle="Vendor visits you booked, their status and payment" onPress={() => router.push('/service-bookings')} />
        <ListRow icon="build-outline" tone="green" title="Society service requests" subtitle="Requests to your society office" onPress={() => router.push('/service-requests')} />
        <ListRow icon="calendar-outline" tone="blue" title="Amenity bookings" subtitle="Clubhouse, hall and other amenities" onPress={() => router.push('/bookings')} />
        <ListRow icon="megaphone-outline" tone="coral" title="My complaints" subtitle="Society maintenance issues" onPress={() => router.push('/complaints')} />
      </View>
    </Screen>
  );
}
