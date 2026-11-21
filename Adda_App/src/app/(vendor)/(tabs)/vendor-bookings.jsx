import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BookingCard } from '../../../components/BookingCard';
import { ORDER_FILTERS, orderCount, VendorOrderCard } from '../../../components/VendorOrderCard';
import { Chips, EmptyState, ErrorState, Hero, LoadingList, PillToggle, Screen, T } from '../../../components/ui';
import { useApi } from '../../../hooks/useApi';
import { colors } from '../../../theme';

const FILTERS = [
  { value: 'requested', label: 'New' },
  { value: 'accepted', label: 'Confirmed' },
  { value: 'completed', label: 'Done' },
  { value: '', label: 'All' },
];
const SEGMENTS = [
  { value: 'bookings', label: 'Service bookings' },
  { value: 'orders', label: 'Product orders' },
];

/**
 * Bookings of the vendor's services (accept / decline, job done, cash received) and orders of the vendor's
 * products (next-step tracking). Both live on this tab behind a segmented control so the bottom bar keeps five tabs;
 * `?tab=orders` opens the orders side (dashboard card, notifications).
 */
export default function VendorBookings() {
  const { tab } = useLocalSearchParams();
  // The ?tab= link wins when it changes; otherwise the user's own choice stays.
  const [sel, setSel] = useState({ tab, seg: tab === 'orders' ? 'orders' : 'bookings' });
  const seg = sel.tab === tab ? sel.seg : tab === 'orders' ? 'orders' : sel.seg;
  const setSeg = (s) => setSel({ tab, seg: s });

  const [status, setStatus] = useState('requested');
  const [orderStatus, setOrderStatus] = useState('open');
  const list = useApi('/vendor/bookings', { query: { status, limit: 50 }, enabled: seg === 'bookings' });
  const orders = useApi('/vendor/orders', { query: { status: orderStatus, limit: 50 }, enabled: seg === 'orders' });
  const active = seg === 'orders' ? orders : list;
  const counts = orders.data?.counts;

  return (
    <Screen header={<Hero title="Bookings & orders" subtitle={seg === 'orders' ? 'Orders for your products' : 'Requests for your services'} />} refreshing={active.refreshing} onRefresh={active.refresh}>
      <PillToggle options={SEGMENTS} value={seg} onChange={setSeg} />
      {seg === 'orders' ? (
        <>
          <Chips options={ORDER_FILTERS.map((f) => ({ value: f.value, label: counts ? `${f.label} (${orderCount(counts, f.value)})` : f.label }))} value={orderStatus} onChange={setOrderStatus} />
          {orders.error && !orders.data ? (
            <ErrorState error={orders.error} onRetry={orders.reload} />
          ) : !orders.data ? (
            <LoadingList rows={3} card={150} />
          ) : !orders.data.items.length ? (
            <EmptyState
              icon="cube-outline"
              title={orderStatus === 'open' ? 'No open orders' : 'Nothing here'}
              message="Members buy your approved products from the Marketplace. New orders show up here."
              action="My products"
              onAction={() => router.push({ pathname: '/vendor-listings', params: { tab: 'product' } })}
            />
          ) : (
            <View style={{ gap: 12 }}>
              {orders.data.items.map((o) => (
                <VendorOrderCard key={o._id} order={o} onPress={() => router.push(`/vendor-orders/${o._id}`)} />
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          <Chips options={FILTERS} value={status} onChange={setStatus} />
          {status === 'completed' ? (
            <T size={12} color={colors.muted}>
              After a job, tap “Mark as paid (cash)” when the customer pays you in person.
            </T>
          ) : null}
          {list.error && !list.data ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : !list.data ? (
            <LoadingList rows={3} card={170} />
          ) : !list.data.items.length ? (
            <EmptyState icon="calendar-outline" title={status === 'requested' ? 'No new requests' : 'Nothing here'} message="Members book your approved services from Home Maintenance. New requests show up here." />
          ) : (
            <View style={{ gap: 12 }}>
              {list.data.items.map((b) => (
                <BookingCard key={b._id} booking={b} onChanged={list.refresh} />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
