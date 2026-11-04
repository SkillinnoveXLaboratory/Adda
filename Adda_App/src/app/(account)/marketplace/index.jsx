import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ListingCard } from '../../../components/ListingCard';
import { Button, Chips, DetailHeader, EmptyState, ErrorState, LoadingList, Screen, SearchBar, T } from '../../../components/ui';
import { useApi } from '../../../hooks/useApi';
import { colors } from '../../../theme';

export default function Marketplace() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const cats = useApi('/marketplace/categories', { refetchOnFocus: false });
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  const list = useApi('/marketplace', { query: { q: debounced, categoryId, limit: 50 } });
  const options = [{ value: '', label: 'All' }, ...(cats.data?.items || []).map((c) => ({ value: c._id, label: c.name }))];

  return (
    <Screen
      header={<DetailHeader title="Buy & sell" fallback="/" />}
      refreshing={list.refreshing}
      onRefresh={list.refresh}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="My listings" variant="alt" onPress={() => router.push('/my-listings')} style={{ flex: 1 }} />
          <Button title="Sell an item" icon="add" onPress={() => router.push('/marketplace/edit')} style={{ flex: 1.3 }} />
        </View>
      }
    >
      <SearchBar value={q} onChangeText={setQ} placeholder="Search furniture, electronics…" />
      <Chips options={options} value={categoryId} onChange={setCategoryId} />
      {list.loading && !list.data ? (
        <LoadingList rows={4} card={110} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data.items.length ? (
        <EmptyState icon="bag-handle-outline" title="Nothing listed here yet" message="Sell things you no longer need to neighbours nearby." />
      ) : (
        <View style={{ gap: 10 }}>
          <T size={12.5} color={colors.muted}>
            {list.data.total} item{list.data.total === 1 ? '' : 's'}
          </T>
          {list.data.items.map((p) => (
            <ListingCard key={p._id} item={p} kind="marketplace" onPress={() => router.push(`/marketplace/${p._id}`)} />
          ))}
        </View>
      )}
    </Screen>
  );
}
