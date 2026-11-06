import { useState } from 'react';
import { View } from 'react-native';
import { BookingCard } from '../../../components/BookingCard';
import { Chips, EmptyState, ErrorState, Hero, LoadingList, Screen, T } from '../../../components/ui';
import { useApi } from '../../../hooks/useApi';
import { colors } from '../../../theme';

const FILTERS = [
  { value: 'requested', label: 'New' },
  { value: 'accepted', label: 'Confirmed' },
  { value: 'completed', label: 'Done' },
  { value: '', label: 'All' },
];

/** Bookings of the vendor's services: accept / decline, mark the job done, record cash received. */
export default function VendorBookings() {
  const [status, setStatus] = useState('requested');
  const list = useApi('/vendor/bookings', { query: { status, limit: 50 } });

  return (
    <Screen header={<Hero title="Bookings" subtitle="Requests for your services" />} refreshing={list.refreshing} onRefresh={list.refresh}>
      <Chips options={FILTERS} value={status} onChange={setStatus} />
      {status === 'completed' ? (
        <T size={12} color={colors.muted}>
          After a job, tap “Mark as paid (cash)” when the customer pays you in person.
        </T>
      ) : null}
      {list.loading && !list.data ? (
        <LoadingList rows={3} card={170} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data.items.length ? (
        <EmptyState icon="calendar-outline" title={status === 'requested' ? 'No new requests' : 'Nothing here'} message="Members book your approved services from Home Maintenance. New requests show up here." />
      ) : (
        <View style={{ gap: 12 }}>
          {list.data.items.map((b) => (
            <BookingCard key={b._id} booking={b} onChanged={list.refresh} />
          ))}
        </View>
      )}
    </Screen>
  );
}
