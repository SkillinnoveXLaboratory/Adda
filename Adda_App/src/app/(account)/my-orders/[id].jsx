import { Image, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PayButton, useCheckout } from '../../../components/Checkout';
import { OrderTracker, orderStatusLabel, orderTone, paymentBadge } from '../../../components/OrderKit';
import { AsyncView, Badge, Button, Card, DetailHeader, Divider, Hint, KeyValue, LoadingList, Screen, SectionTitle, T } from '../../../components/ui';
import { useToast } from '../../../context/toast';
import { useAction, useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { confirm } from '../../../lib/dialog';
import { formatDateTime, money } from '../../../lib/format';
import { colors } from '../../../theme';

const CANCELLED_BY = {
  member: 'You cancelled this order.',
  vendor: 'The shop cancelled this order.',
  system: 'Cancelled automatically — the online payment wasn’t completed in time.',
};

function paymentText(o) {
  const p = o.payment || {};
  const cod = o.paymentMethod === 'cod';
  if (p.status === 'paid') return `Paid ${money(p.amountPaise || o.payablePaise)}${p.method === 'online' ? ' online' : ' in cash'}${p.paidAt ? ` on ${formatDateTime(p.paidAt)}` : ''}.`;
  if (p.status === 'refund_pending') return `Your refund of ${money(p.amountPaise || o.payablePaise)} has been started. Banks usually take a few working days to credit it.`;
  if (p.status === 'refunded') return `${money(p.amountPaise || o.payablePaise)} was refunded${p.refundedAt ? ` on ${formatDateTime(p.refundedAt)}` : ''}.`;
  if (o.status === 'cancelled') return 'Nothing to pay.';
  if (o.status === 'awaiting_payment') return 'Waiting for your online payment.';
  return cod ? `Pay ${money(o.payablePaise)} ${o.fulfilment === 'pickup' ? 'when you pick it up' : 'when it is delivered'} (cash or UPI).` : 'Not paid yet.';
}

function OrderDetail({ o, state }) {
  const toast = useToast();
  const pay = useCheckout({ onResult: state.refresh, onClose: state.refresh });
  const actions = o.actions || [];
  const payBadge = paymentBadge(o.payment, { method: o.paymentMethod });
  const cancelled = o.status === 'cancelled';
  const paidOnline = o.payment?.status === 'paid' && o.payment?.method === 'online';

  const [cancel, cancelling] = useAction(async () => {
    const ok = await confirm({
      title: 'Cancel this order?',
      message: paidOnline ? `The shop will be told, and your ${money(o.payment.amountPaise || o.payablePaise)} will be refunded to the way you paid.` : 'The shop will be told and the items go back on sale.',
      confirmText: 'Cancel order',
      cancelText: 'Keep order',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/product-orders/${o._id}/cancel`, { method: 'POST', body: {} });
      toast.success(paidOnline ? 'Order cancelled — refund started' : 'Order cancelled');
    } catch (err) {
      toast.error(err.message);
    }
    state.refresh();
  });

  const timeline = [...(o.timeline || [])].reverse();

  return (
    <>
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T weight="extrabold" size={15} color={colors.navy} style={{ flex: 1, minWidth: 0 }} selectable>
            {o.orderNumber}
          </T>
          <Badge tone={orderTone(o.status)} label={orderStatusLabel(o.status, o.fulfilment)} />
        </View>
        <T size={13} color={colors.textSoft} testID="order-status-text">
          {o.statusText || orderStatusLabel(o.status, o.fulfilment)}
        </T>
        <T size={11.5} color={colors.muted}>
          Ordered {formatDateTime(o.createdAt)}
        </T>
        {payBadge ? <Badge tone={payBadge.tone} label={payBadge.label} /> : null}
      </Card>

      {o.status === 'awaiting_payment' ? (
        <View style={{ gap: 10 }}>
          <Hint tone="amber" icon="time-outline">
            Complete the payment to send this order to the shop. Unpaid orders are cancelled automatically 30 minutes after they’re placed.
          </Hint>
          {actions.includes('pay') ? <PayButton title={`Pay now · ${money(o.payablePaise)}`} onPress={() => pay.start(`/product-orders/${o._id}/pay`)} loading={pay.busy} testID="order-pay" /> : null}
        </View>
      ) : null}

      {cancelled ? (
        <Card style={{ gap: 6, borderColor: colors.dangerBg }} testID="order-cancelled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="close-circle" size={22} color={colors.danger} />
            <T weight="extrabold" size={15} color={colors.danger}>
              Order cancelled
            </T>
          </View>
          <T size={13} color={colors.textSoft}>
            {CANCELLED_BY[o.cancelledBy] || 'This order was cancelled.'}
          </T>
          {o.cancelReason ? (
            <T size={13} color={colors.textSoft}>
              Reason: {o.cancelReason}
            </T>
          ) : null}
        </Card>
      ) : o.status !== 'awaiting_payment' ? (
        <Card>
          <T weight="bold" size={14} style={{ marginBottom: 12 }}>
            Order tracking
          </T>
          <OrderTracker order={o} />
        </Card>
      ) : null}

      <Card onPress={o.product?._id ? () => router.push(`/market/product/${o.product._id}`) : undefined} accessibilityLabel={`Product ${o.product?.title}`} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {o.product?.photoUrl ? <Image source={{ uri: o.product.photoUrl }} style={styles.thumb} accessibilityIgnoresInvertColors /> : <View style={[styles.thumb, { backgroundColor: colors.goldLight }]} />}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T weight="bold" size={14} color={colors.navy} numberOfLines={2}>
            {o.product?.title}
          </T>
          <T size={12} color={colors.muted}>
            {o.quantity} × {o.product?.unit || 'item'}
          </T>
          <T size={12} color={colors.textSoft} numberOfLines={1}>
            Sold by {o.shopName}
          </T>
        </View>
      </Card>

      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={o.fulfilment === 'pickup' ? 'storefront-outline' : 'location-outline'} size={18} color={colors.goldDark} />
          <T weight="bold" size={14}>
            {o.fulfilment === 'pickup' ? 'Pick up from the shop' : 'Delivery address'}
          </T>
        </View>
        <T size={13} color={colors.textSoft} style={{ lineHeight: 19 }} selectable>
          {o.fulfilment === 'pickup' ? [o.shopName, o.pickupAddress].filter(Boolean).join('\n') || 'The shop will share the pickup details.' : o.address}
        </T>
        {o.note ? (
          <T size={12} color={colors.muted}>
            Your note: {o.note}
          </T>
        ) : null}
      </Card>

      <Card testID="order-price">
        <T weight="bold" size={14} style={{ marginBottom: 4 }}>
          Price details
        </T>
        <KeyValue label={`${money(o.memberUnitPaise)} × ${o.quantity}`} value={money(o.memberTotalPaise)} />
        {o.discountPaise > 0 ? <KeyValue label="NIVASA discount" value={`− ${money(o.discountPaise)}`} valueColor={colors.green} /> : null}
        {o.fulfilment === 'delivery' ? <KeyValue label="Delivery charge" value={o.deliveryChargePaise > 0 ? `+ ${money(o.deliveryChargePaise)}` : 'Free'} /> : null}
        <Divider dashed />
        <KeyValue label="Total" value={money(o.payablePaise)} strong />
        <Divider />
        <KeyValue label="Payment method" value={o.paymentMethod === 'online' ? 'Online (Cashfree)' : o.fulfilment === 'pickup' ? 'Pay at pickup' : 'Pay on delivery'} />
        <T size={12.5} color={o.payment?.status === 'refund_pending' ? colors.amber : colors.muted} style={{ marginTop: 4, lineHeight: 18 }} testID="order-payment-text">
          {paymentText(o)}
        </T>
      </Card>

      {timeline.length ? (
        <>
          <SectionTitle title="Updates" />
          <Card style={{ gap: 12 }}>
            {timeline.map((t, i) => (
              <View key={`${t.status}-${t.at}-${i}`} style={{ flexDirection: 'row', gap: 10 }}>
                <Ionicons name={t.status === 'cancelled' ? 'close-circle-outline' : 'ellipse'} size={t.status === 'cancelled' ? 16 : 9} color={t.status === 'cancelled' ? colors.danger : colors.gold} style={{ marginTop: t.status === 'cancelled' ? 1 : 5 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T weight="bold" size={13} color={colors.navy}>
                    {orderStatusLabel(t.status, o.fulfilment)}
                  </T>
                  {t.note ? (
                    <T size={12.5} color={colors.textSoft} style={{ lineHeight: 18 }}>
                      {t.note}
                    </T>
                  ) : null}
                  <T size={11} color={colors.subtle}>
                    {formatDateTime(t.at)}
                  </T>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {actions.includes('cancel') ? (
        <View style={{ gap: 6 }}>
          <Button title="Cancel order" icon="close-circle-outline" variant="danger" onPress={cancel} loading={cancelling} testID="order-cancel" />
          <T size={11.5} color={colors.muted} style={{ textAlign: 'center' }}>
            You can cancel until the shop packs your order.
          </T>
        </View>
      ) : null}
      {pay.sheet}
    </>
  );
}

/** Order detail (members): step tracker, updates, address, price, payment / refund, Pay now and Cancel. */
export default function OrderScreen() {
  const { id } = useLocalSearchParams();
  const order = useApi(`/product-orders/${id}`);
  return (
    <Screen header={<DetailHeader title="Order details" fallback="/my-orders" />} refreshing={order.refreshing} onRefresh={order.refresh}>
      <AsyncView state={order} skeleton={<LoadingList rows={3} card={150} />}>
        {(d) => <OrderDetail o={d} state={order} />}
      </AsyncView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 60, height: 60, borderRadius: 12, backgroundColor: colors.divider },
});
