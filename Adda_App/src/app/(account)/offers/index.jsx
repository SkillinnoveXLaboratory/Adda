import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { OfferCard } from '../../../components/OfferCard';
import { Button, Chips, DetailHeader, EmptyState, ErrorState, LoadingList, Screen, SearchBar, T } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useApi } from '../../../hooks/useApi';
import { colors } from '../../../theme';

/** Home services from KYC-verified vendors. Members browse and book; vendors also manage their own. */
export default function Offers() {
  const { isVendor } = useAuth();
  const params = useLocalSearchParams();
  const [q, setQ] = useState(typeof params.q === 'string' ? params.q : '');
  const [debounced, setDebounced] = useState(q.trim());
  const [categoryId, setCategoryId] = useState(typeof params.categoryId === 'string' ? params.categoryId : '');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  const cats = useApi('/service-offers/categories', { refetchOnFocus: false });
  const list = useApi('/service-offers', { query: { q: debounced, categoryId, limit: 50 } });
  const sponsored = list.data?.sponsoredCount || 0;

  return (
    <Screen
      header={<DetailHeader title="Home Services" fallback="/" />}
      refreshing={list.refreshing}
      onRefresh={list.refresh}
      footer={
        isVendor ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="My services" variant="alt" onPress={() => router.push({ pathname: '/vendor-listings', params: { tab: 'service' } })} style={{ flex: 1 }} />
            <Button title="Add a service" icon="add" onPress={() => router.push('/offers/edit')} style={{ flex: 1.3 }} />
          </View>
        ) : null
      }
    >
      <SearchBar value={q} onChangeText={setQ} placeholder="Search plumber, electrician, cleaning…" />
      {cats.data?.items?.length ? <Chips options={[{ value: '', label: 'All' }, ...cats.data.items.map((c) => ({ value: c._id, label: c.name }))]} value={categoryId} onChange={setCategoryId} /> : null}
      {list.loading && !list.data ? (
        <LoadingList rows={4} card={96} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data.items.length ? (
        <EmptyState
          icon="construct-outline"
          title={debounced || categoryId ? 'No matching services' : 'No services listed yet'}
          message={isVendor ? 'Add your service so members can find and book you.' : 'Verified vendors will appear here once their services are approved.'}
          action={isVendor ? 'Add a service' : undefined}
          onAction={isVendor ? () => router.push('/offers/edit') : undefined}
        />
      ) : (
        <View style={{ gap: 10 }}>
          <T size={12} color={colors.muted}>
            {list.data.total + sponsored} service{list.data.total + sponsored === 1 ? '' : 's'}
            {sponsored ? ` · ${sponsored} sponsored` : ''}
          </T>
          {list.data.items.map((o) => (
            <OfferCard key={o._id} item={o} onPress={() => router.push(`/offers/${o._id}`)} />
          ))}
        </View>
      )}
    </Screen>
  );
}
