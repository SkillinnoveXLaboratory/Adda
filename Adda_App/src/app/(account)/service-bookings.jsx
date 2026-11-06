import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { BookingCard } from '../../components/BookingCard';
import { Chips, DetailHeader, EmptyState, ErrorState, LoadingList, Screen } from '../../components/ui';
import { useApi } from '../../hooks/useApi';

const FILTERS = [
  { value: 'open', label: 'Upcoming' },
  { value: 'completed', label: 'Done' },
  { value: '', label: 'All' },
];

/** A member's bookings of vendor services: status, vendor contact, cash payment once recorded. */
export default function ServiceBookings() {
  const [status, setStatus] = useState('open');
  const list = useApi('/service-bookings', { query: { status, limit: 50 } });

  return (
    <Screen header={<DetailHeader title="My service bookings" fallback="/services" />} refreshing={list.refreshing} onRefresh={list.refresh}>
      <Chips options={FILTERS} value={status} onChange={setStatus} />
      {list.loading && !list.data ? (
        <LoadingList rows={3} card={150} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data.items.length ? (
        <EmptyState icon="calendar-outline" title={status === 'open' ? 'No upcoming bookings' : 'No bookings yet'} message="Book a plumber, electrician, cleaner and more from Home Maintenance." action="Find a service" onAction={() => router.push('/offers')} />
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
