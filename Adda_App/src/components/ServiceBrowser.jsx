import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { NearMeBox, useNearMe } from './NearMe';
import { OfferCard } from './OfferCard';
import { Button, Chips, EmptyState, ErrorState, LoadingList, Screen, SearchBar, T } from './ui';
import { useApi } from '../hooks/useApi';
import { colors } from '../theme';

export { RADIUS_PICKS } from './NearMe';

/**
 * Vendor services for members: search, category chips and "Near me" (the member's GPS position, or a place they
 * search for — the server does not share a society's location with members) + radius → nearest first with
 * "x.x km away". `top` renders above the search (e.g. the Marketplace Services / Products / Properties switch).
 */
export function ServiceBrowser({ header, top, initialQ = '', initialCategory = '', initialNear = false }) {
  const [q, setQ] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ.trim());
  const [categoryId, setCategoryId] = useState(initialCategory);
  const nm = useNearMe(initialNear);
  const { near, radius, bigger } = nm;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const cats = useApi('/service-offers/categories', { refetchOnFocus: false });
  const nearQuery = near && nm.where ? { ...nm.query, sort: 'nearest' } : {};
  const list = useApi(nm.waiting ? null : '/service-offers', { query: { q: debounced, categoryId, limit: 50, ...nearQuery } });
  const sponsored = near ? 0 : list.data?.sponsoredCount || 0;

  return (
    <Screen header={header} refreshing={list.refreshing} onRefresh={list.refresh}>
      {top}
      <SearchBar value={q} onChangeText={setQ} placeholder="Search plumber, electrician, cleaning…" />
      {cats.data?.items?.length ? <Chips options={[{ value: '', label: 'All' }, ...cats.data.items.map((c) => ({ value: c._id, label: c.name }))]} value={categoryId} onChange={setCategoryId} /> : null}

      <NearMeBox nm={nm} offText="Show services closest to you first" />

      {nm.waiting ? null : list.loading && !list.data ? (
        <LoadingList rows={4} card={96} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data.items.length ? (
        near ? (
          <EmptyState
            icon="navigate-outline"
            title={`No services within ${radius} km — try a bigger radius`}
            message="Only vendors who added their shop location show up in Near me."
            action={bigger ? `Search within ${bigger} km` : undefined}
            onAction={bigger ? () => nm.pickRadius(bigger) : undefined}
          />
        ) : (
          <EmptyState icon="construct-outline" title={debounced || categoryId ? 'No matching services' : 'No services listed yet'} message="Verified vendors will appear here once their services are approved." />
        )
      ) : (
        <View style={{ gap: 10 }}>
          <T size={12} color={colors.muted} testID="service-count">
            {list.data.total + sponsored} service{list.data.total + sponsored === 1 ? '' : 's'}
            {near ? ` within ${radius} km · nearest first` : sponsored ? ` · ${sponsored} sponsored` : ''}
          </T>
          {list.data.items.map((o) => (
            <OfferCard key={o._id} item={o} onPress={() => router.push(`/offers/${o._id}`)} />
          ))}
        </View>
      )}
      {near && nm.where && list.data?.items?.length && bigger ? <Button title={`Search wider (${bigger} km)`} variant="alt" icon="expand-outline" onPress={() => nm.pickRadius(bigger)} /> : null}
    </Screen>
  );
}
