import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { PayButton, useCheckout } from '../../components/Checkout';
import { AsyncView, Badge, Button, Card, DetailHeader, IconCircle, Screen, T } from '../../components/ui';
import { useToast } from '../../context/toast';
import { useAction, useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { confirm, notify } from '../../lib/dialog';
import { formatDate, money, timeRange } from '../../lib/format';
import { colors } from '../../theme';

const FEE_BADGE = {
  paid: { label: 'Paid', tone: 'success' },
  refund_pending: { label: 'Refund pending', tone: 'warning' },
  refunded: { label: 'Refunded', tone: 'neutral' },
};

export default function Bookings() {
  const toast = useToast();
  const list = useApi('/resident/bookings', { query: { limit: 50 } });
  const pay = useCheckout({ onResult: list.refresh, onClose: list.refresh });
  const [payingId, setPayingId] = useState(null);

  const [cancel] = useAction(async (b) => {
    const ok = await confirm({ title: 'Cancel booking?', message: `${b.facility?.name} on ${formatDate(b.start)} will be released for others.`, confirmText: 'Cancel booking', cancelText: 'Keep', destructive: true });
    if (!ok) return;
    try {
      await api(`/resident/bookings/${b._id}/cancel`, { method: 'POST' });
      toast.success('Booking cancelled');
      list.refresh();
    } catch (err) {
      // A fee paid online is refunded only through the society office.
      if (err.code === 'PAID_BOOKING') notify('Booking fee already paid', err.message);
      else toast.error(err.message);
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
              const fee = b.feePaise > 0;
              const payState = b.payment?.status || 'unpaid';
              const canPay = fee && b.status === 'confirmed' && payState === 'unpaid';
              const payInfo = fee ? FEE_BADGE[payState] : null;
              return (
                <Card key={b._id} style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                    <IconCircle icon="calendar-outline" tone={b.status === 'confirmed' ? 'green' : b.status === 'pending' ? 'amber' : 'navy'} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T weight="bold" size={15} numberOfLines={2}>
                        {b.facility?.name}
                      </T>
                      <T size={12.5} color={colors.muted}>
                        {formatDate(b.start)} · {timeRange(b.start, b.end)}
                      </T>
                      <T size={12} color={colors.subtle}>
                        {fee ? money(b.feePaise) : 'Free'}
                        {b.purpose ? ` · ${b.purpose}` : ''}
                      </T>
                      {b.decisionReason ? (
                        <T size={12} color={colors.danger}>
                          {b.decisionReason}
                        </T>
                      ) : null}
                      {payInfo ? <Badge tone={payInfo.tone} label={payInfo.label} style={{ marginTop: 4 }} /> : null}
                    </View>
                    <Badge status={upcoming || b.status !== 'confirmed' ? b.status : 'completed'} label={!upcoming && b.status === 'confirmed' ? 'Completed' : undefined} />
                  </View>
                  {canPay ? <PayButton small title={`Pay fee · ${money(b.feePaise)}`} onPress={() => (setPayingId(b._id), pay.start(`/resident/bookings/${b._id}/pay`))} loading={pay.busy && payingId === b._id} disabled={pay.busy && payingId !== b._id} testID="booking-pay-fee" /> : null}
                  {fee && b.status === 'pending' && payState === 'unpaid' ? (
                    <T size={11.5} color={colors.muted}>
                      You can pay the fee once the society office confirms the booking.
                    </T>
                  ) : null}
                  {payState === 'refund_pending' ? (
                    <T size={11.5} color={colors.amber}>
                      Your fee refund has been started. Banks usually take a few working days to credit it.
                    </T>
                  ) : null}
                  {cancellable ? <Button title="Cancel booking" variant="danger" small onPress={() => cancel(b)} /> : null}
                </Card>
              );
            })}
          </View>
        )}
      </AsyncView>
      {pay.sheet}
    </Screen>
  );
}
