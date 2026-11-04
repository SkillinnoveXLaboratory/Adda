import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { OfferCard } from '../../../components/OfferCard';
import { Button, Chips, DetailHeader, EmptyState, ErrorState, LoadingList, Screen, SearchBar, T } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useApi } from '../../../hooks/useApi';
import { colors } from '../../../theme';

/** Local service providers: residents and nearby professionals (moderated listings). */
export default function Offers() {
  const { isMember } = useAuth();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [scope, setScope] = useState('all');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  const cats = useApi('/service-offers/categories', { refetchOnFocus: false });
  const list = useApi('/service-offers', { query: { q: debounced, categoryId, mySociety: scope === 'society' ? 'true' : '', limit: 50 } });

  return (
    <Screen
      header={<DetailHeader title="Local Services" fallback="/" />}
      refreshing={list.refreshing}
      onRefresh={list.refresh}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="My services" variant="alt" onPress={() => router.push({ pathname: '/my-listings', params: { tab: 'service' } })} style={{ flex: 1 }} />
          <Button title="Offer your service" icon="add" onPress={() => router.push('/offers/edit')} style={{ flex: 1.4 }} />
        </View>
      }
    >
      <SearchBar value={q} onChangeText={setQ} placeholder="Search plumber, tutor, cook…" />
      {cats.data?.items?.length ? <Chips options={[{ value: '', label: 'All' }, ...cats.data.items.map((c) => ({ value: c._id, label: c.name }))]} value={categoryId} onChange={setCategoryId} /> : null}
      {isMember ? (
        <Chips
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'society', label: 'My society only' },
          ]}
          value={scope}
          onChange={setScope}
        />
      ) : null}
      {list.loading && !list.data ? (
        <LoadingList rows={4} card={96} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data.items.length ? (
        <EmptyState icon="construct-outline" title={debounced || categoryId || scope !== 'all' ? 'No matching services' : 'No services listed yet'} message="Are you a plumber, tutor, cook or electrician? List your service so neighbours can call you." action="Offer your service" onAction={() => router.push('/offers/edit')} />
      ) : (
        <View style={{ gap: 10 }}>
          <T size={12} color={colors.muted}>
            {list.data.total} service{list.data.total === 1 ? '' : 's'}
          </T>
          {list.data.items.map((o) => (
            <OfferCard key={o._id} item={o} onPress={() => router.push(`/offers/${o._id}`)} />
          ))}
        </View>
      )}
    </Screen>
  );
}
