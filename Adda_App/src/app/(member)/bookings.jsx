import { View } from 'react-native';
import { router } from 'expo-router';
import { AsyncView, Badge, Button, Card, DetailHeader, IconCircle, Screen, T } from '../../components/ui';
import { useToast } from '../../context/toast';
import { useAction, useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { confirm } from '../../lib/dialog';
import { formatDate, money, timeRange } from '../../lib/format';
import { colors } from '../../theme';

export default function Bookings() {
  const toast = useToast();
  const list = useApi('/resident/bookings', { query: { limit: 50 } });

  const [cancel] = useAction(async (b) => {
    const ok = await confirm({ title: 'Cancel booking?', message: `${b.facility?.name} on ${formatDate(b.start)} will be released for others.`, confirmText: 'Cancel booking', cancelText: 'Keep', destructive: true });
    if (!ok) return;
    try {
      await api(`/resident/bookings/${b._id}/cancel`, { method: 'POST' });
      toast.success('Booking cancelled');
      list.refresh();
    } catch (err) {
      toast.error(err.message);
    }
  });

  return (
    <Screen header={<DetailHeader title="My bookings" fallback="/facilities" />} refreshing={list.refreshing} onRefresh={list.refresh}>
      <AsyncView state={list} empty={{ when: (d) => !d.items.length, icon: 'calendar-outline', title: 'No facility bookings yet', message: 'Book the community hall, courts and more.', action: 'Book a facility', onAction: () => router.push('/facilities') }}>
        {(d) => (
          <View style={{ gap: 10 }}>
            {d.items.map((b) => {
              const upcoming = new Date(b.start) > new Date();
              const cancellable = upcoming && ['pending', 'confirmed'].includes(b.status);
              return (
                <Card key={b._id} style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                    <IconCircle icon="calendar-outline" tone={b.status === 'confirmed' ? 'green' : b.status === 'pending' ? 'amber' : 'navy'} />
                    <View style={{ flex: 1 }}>
                      <T weight="bold" size={15}>
                        {b.facility?.name}
                      </T>
                      <T size={12.5} color={colors.muted}>
                        {formatDate(b.start)} · {timeRange(b.start, b.end)}
                      </T>
                      <T size={12} color={colors.subtle}>
                        {b.feePaise ? money(b.feePaise) : 'Free'}
                        {b.purpose ? ` · ${b.purpose}` : ''}
                      </T>
                      {b.decisionReason ? (
                        <T size={12} color={colors.danger}>
                          {b.decisionReason}
                        </T>
                      ) : null}
                    </View>
                    <Badge status={upcoming || b.status !== 'confirmed' ? b.status : 'completed'} label={!upcoming && b.status === 'confirmed' ? 'Completed' : undefined} />
                  </View>
                  {cancellable ? <Button title="Cancel booking" variant="danger" small onPress={() => cancel(b)} /> : null}
                </Card>
              );
            })}
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}
