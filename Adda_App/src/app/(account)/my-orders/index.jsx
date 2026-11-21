import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { OrderCard } from '../../../components/OrderKit';
import { Chips, DetailHeader, EmptyState, ErrorState, LoadingList, Screen } from '../../../components/ui';
import { useApi } from '../../../hooks/useApi';

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: '', label: 'All' },
];

/** A member's product orders: open ones first, tap for the step tracker. */
export default function MyOrders() {
  const [status, setStatus] = useState('open');
  const list = useApi('/product-orders', { query: { status, limit: 50 } });

  return (
    <Screen header={<DetailHeader title="My orders" fallback="/market?tab=products" />} refreshing={list.refreshing} onRefresh={list.refresh}>
      <Chips options={FILTERS} value={status} onChange={setStatus} />
      {list.loading && !list.data ? (
        <LoadingList rows={4} card={96} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data.items.length ? (
        <EmptyState
          icon="cube-outline"
          title={status === 'open' ? 'No open orders' : 'No orders yet'}
          message={status === 'open' ? 'Orders on their way or waiting for the shop show up here.' : 'Buy from verified local shops in the Marketplace.'}
          action="Browse products"
          onAction={() => router.push({ pathname: '/market', params: { tab: 'products' } })}
        />
      ) : (
        <View style={{ gap: 10 }}>
          {list.data.items.map((o) => (
            <OrderCard key={o._id} order={o} onPress={() => router.push(`/my-orders/${o._id}`)} />
          ))}
        </View>
      )}
    </Screen>
  );
}
