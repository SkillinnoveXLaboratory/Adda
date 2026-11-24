import { useState } from 'react';
import { Image, Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderActionLabel, orderPaymentLabel, orderStatusLabel, orderStatusTone } from '../../../components/VendorOrderCard';
import { AsyncView, Badge, Button, Card, DetailHeader, Field, Hint, KeyValue, LoadingList, Screen, SectionTitle, T } from '../../../components/ui';
import { useToast } from '../../../context/toast';
import { useAction, useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { confirm } from '../../../lib/dialog';
import { formatDateTime, money } from '../../../lib/format';
import { colors } from '../../../theme';

const PAYMENT_STATUS = { unpaid: 'Not paid yet', paid: 'Paid', refund_pending: 'Refund in progress', refunded: 'Refunded' };
const TIMELINE_LABEL = {
  awaiting_payment: 'Waiting for online payment',
  placed: 'Order placed',
  confirmed: 'Confirmed by you',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  ready_for_pickup: 'Ready for pickup',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Vendor's view of one product order: customer, items, money, timeline and the next-step buttons (POST /vendor/orders/:id/status). */
export default function VendorOrderDetail() {
  const { id } = useLocalSearchParams();
  const order = useApi(`/vendor/orders/${id}`);
  return (
    <Screen header={<DetailHeader title={order.data?.orderNumber || 'Order'} fallback="/vendor-bookings?tab=orders" />} refreshing={order.refreshing} onRefresh={order.refresh}>
      <AsyncView state={order} skeleton={<LoadingList rows={4} card={110} />}>
        {(o) => <OrderBody o={o} onChanged={(next) => (next ? order.setData(next) : order.reload())} />}
      </AsyncView>
    </Screen>
  );
}

function Money({ label, value, strong, tone }) {
  return (
    <View style={styles.money}>
      <T size={12.5} weight={strong ? 'bold' : 'medium'} color={strong ? colors.navy : colors.muted} style={{ flex: 1, minWidth: 0 }}>
        {label}
      </T>
      <T size={strong ? 14 : 12.5} weight={strong ? 'extrabold' : 'semibold'} color={tone || (strong ? colors.navy : colors.textSoft)}>
        {value}
      </T>
    </View>
  );
}

function OrderBody({ o, onChanged }) {
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(null);
  const [pending, setPending] = useState(null);
  const pay = o.payment || {};
  const pickup = o.fulfilment === 'pickup';
  const next = o.nextStatuses || [];
  const forward = next.filter((s) => s !== 'cancelled');
  const canCancel = next.includes('cancelled');
  const phone = o.customer?.phone;
  const telHref = phone ? `tel:${/^\d{10}$/.test(phone) ? `+91${phone}` : phone}` : null;
  const settled = pay.status === 'paid' && o.settlement;

  const [move, busy] = useAction(async (to, note) => {
    if (to === 'delivered') {
      const cod = o.paymentMethod === 'cod' && pay.status === 'unpaid';
      const ok = await confirm(
        cod
          ? { title: `Cash of ${money(o.payablePaise)} collected?`, message: `Only confirm once the customer has paid you ${money(o.payablePaise)} in cash. This records the payment and can’t be undone.`, confirmText: pickup ? 'Yes, picked up' : 'Yes, delivered' }
          : { title: pickup ? 'Mark as picked up?' : 'Mark as delivered?', message: 'The customer will be notified. This is the last step.', confirmText: orderActionLabel(to, o) },
      );
      if (!ok) return;
    }
    if (to === 'cancelled') {
      const ok = await confirm({
        title: 'Cancel this order?',
        message: `${pay.status === 'paid' && o.paymentMethod === 'online' ? 'The customer gets a full refund. ' : ''}The stock goes back to your product and the customer is told why.`,
        confirmText: 'Cancel order',
        cancelText: 'Keep order',
        destructive: true,
      });
      if (!ok) return;
    }
    setPending(to);
    try {
      const updated = await api(`/vendor/orders/${o._id}/status`, { method: 'POST', body: { status: to, ...(note && { note }) } });
      toast.success(to === 'cancelled' ? 'Order cancelled' : updated.statusText || 'Order updated');
      setCancelling(false);
      setReason('');
      onChanged(updated);
    } catch (err) {
      toast.error(err.message);
      // Someone (the member, or another device) changed the order: show its current state.
      if (err.status === 409 || err.code === 'INVALID_TRANSITION') onChanged(null);
      else if (err.details?.length) setReasonError(err.details.map((d) => d.message).join(' '));
    } finally {
      setPending(null);
    }
  });

  const submitCancel = () => {
    const r = reason.trim();
    if (r.length < 3) return setReasonError('Tell the customer why you are cancelling (at least 3 characters)');
    setReasonError(null);
    return move('cancelled', r);
  };

  return (
    <>
      <Card style={{ gap: 12 }}>
        <View style={styles.rowTop}>
          {o.product?.photoUrl ? (
            <Image source={{ uri: o.product.photoUrl }} style={styles.thumb} accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.thumb, styles.noThumb]}>
              <Ionicons name="cube-outline" size={30} color={colors.goldDark} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Badge label={orderStatusLabel(o)} tone={orderStatusTone(o.status)} />
            <T weight="bold" size={14} numberOfLines={3}>
              {o.product?.title}
            </T>
            <T size={12} color={colors.muted}>
              Qty {o.quantity}
              {o.product?.unit ? ` × ${o.product.unit}` : ''} · placed {formatDateTime(o.createdAt)}
            </T>
          </View>
        </View>
        {o.status === 'cancelled' ? (
          <Hint tone="coral" icon="close-circle-outline">
            {`Cancelled by ${o.cancelledBy === 'vendor' ? 'you' : o.cancelledBy === 'member' ? 'the customer' : 'NIVASA'}${o.cancelReason ? `: ${o.cancelReason}` : ''}`}
          </Hint>
        ) : null}
      </Card>

      <SectionTitle title="Customer" />
      <Card style={{ gap: 10 }}>
        <View style={styles.rowTop}>
          <Ionicons name="person-circle-outline" size={34} color={colors.navy} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="bold" size={14} numberOfLines={1}>
              {o.customer?.name || 'Customer'}
            </T>
            {phone ? (
              <T size={12} color={colors.muted} selectable>
                {/^\d{10}$/.test(phone) ? `+91 ${phone}` : phone}
              </T>
            ) : null}
          </View>
          {telHref ? <Button small title="Call" icon="call-outline" variant="outline" onPress={() => Linking.openURL(telHref).catch(() => toast.error('Calling is not available on this device'))} accessibilityLabel={`Call ${o.customer?.name || 'customer'}`} style={{ flexShrink: 0, minHeight: 44 }} /> : null}
        </View>
        <View style={styles.infoRow}>
          <Ionicons name={pickup ? 'storefront-outline' : 'bicycle-outline'} size={18} color={colors.goldDark} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="bold" size={12.5} color={colors.navy}>
              {pickup ? 'Customer picks up from your shop' : 'Deliver to'}
            </T>
            <T size={12.5} color={colors.textSoft} selectable>
              {pickup ? o.pickupAddress || 'Your shop address' : o.address}
            </T>
          </View>
        </View>
        {o.note ? (
          <View style={styles.infoRow}>
            <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.goldDark} />
            <T size={12.5} color={colors.textSoft} style={{ flex: 1, minWidth: 0 }} selectable>
              {o.note}
            </T>
          </View>
        ) : null}
      </Card>

      <SectionTitle title="Money" />
      <Card style={{ gap: 6 }}>
        <Money label={`Price ${money(o.memberUnitPaise ?? o.vendorUnitPaise)} × ${o.quantity}`} value={money(o.memberTotalPaise ?? o.vendorTotalPaise)} />
        {o.discountPaise ? <Money label="Member discount (paid by NIVASA)" value={`− ${money(o.discountPaise)}`} tone={colors.green} /> : null}
        {o.deliveryChargePaise ? <Money label="Delivery charge (yours)" value={`+ ${money(o.deliveryChargePaise)}`} /> : null}
        <Money label="Customer pays" value={money(o.payablePaise)} strong />
        <View style={styles.line} />
        <Money label={`NIVASA fee${o.commissionPercent ? ` (${o.commissionPercent}%)` : ''}${o.discountPaise ? ', less the discount NIVASA covers' : ''}`} value={`− ${money((o.commissionPaise || 0) - (o.discountPaise || 0))}`} />
        <Money label="Your earnings" value={money(o.yourEarningsPaise)} strong tone={colors.green} />
        <View style={styles.line} />
        <KeyValue label="Payment" value={orderPaymentLabel(o)} />
        <KeyValue label="Payment status" value={`${PAYMENT_STATUS[pay.status] || pay.status}${pay.paidAt ? ` · ${formatDateTime(pay.paidAt)}` : ''}`} />
        {o.paymentMethod === 'cod' && pay.status === 'unpaid' && o.status !== 'cancelled' ? (
          <T size={11.5} color={colors.muted}>
            Collect {money(o.payablePaise)} in cash at {pickup ? 'pickup' : 'delivery'}. It is recorded when you mark the order {pickup ? 'picked up' : 'delivered'}.
          </T>
        ) : null}
      </Card>

      {settled ? (
        <>
          <SectionTitle title="Settlement" />
          <Card style={{ gap: 6 }}>
            <Money label={o.paymentMethod === 'online' ? 'Paid online' : 'Cash received'} value={money(o.settlement.cashPaise)} />
            <Money label="NIVASA fee" value={money(o.settlement.commissionPaise)} />
            {o.settlement.discountPaise ? <Money label="Member discount (paid by NIVASA)" value={`− ${money(o.settlement.discountPaise)}`} tone={colors.green} /> : null}
            <Money label="NIVASA’s share" value={money(o.settlement.netToPlatformPaise)} />
            <Money label="You earned" value={money(o.settlement.vendorEarningsPaise)} strong tone={colors.green} />
          </Card>
        </>
      ) : null}

      <SectionTitle title="Timeline" />
      <Card style={{ gap: 0 }}>
        {(o.timeline || []).map((t, i, arr) => (
          <View key={`${t.status}-${t.at}`} style={styles.step}>
            <View style={{ alignItems: 'center' }}>
              <View style={[styles.dot, i === arr.length - 1 && styles.dotNow, t.status === 'cancelled' && { backgroundColor: colors.danger }]} />
              {i < arr.length - 1 ? <View style={styles.rail} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingBottom: i < arr.length - 1 ? 14 : 0 }}>
              <T weight="bold" size={12.5} color={colors.navy}>
                {t.status === 'delivered' && pickup ? 'Picked up' : TIMELINE_LABEL[t.status] || t.status}
              </T>
              <T size={11} color={colors.muted}>
                {formatDateTime(t.at)}
              </T>
              {t.note ? (
                <T size={12} color={colors.textSoft}>
                  {t.note}
                </T>
              ) : null}
            </View>
          </View>
        ))}
      </Card>

      {next.length ? (
        <>
          <SectionTitle title="Next step" />
          <View style={{ gap: 10 }}>
            {forward.map((s, i) => (
              <Button key={s} title={orderActionLabel(s, o)} icon={s === 'delivered' ? 'checkmark-done' : 'arrow-forward'} variant={i === 0 ? 'primary' : 'outline'} loading={busy && pending === s} disabled={busy} onPress={() => move(s)} />
            ))}
            {canCancel && !cancelling ? <Button title="Cancel order" icon="close-circle-outline" variant="danger" disabled={busy} onPress={() => setCancelling(true)} /> : null}
            {canCancel && cancelling ? (
              <Card style={{ gap: 10 }}>
                <Field label="Reason for cancelling" value={reason} onChangeText={(v) => (setReason(v), setReasonError(null))} maxLength={300} placeholder="e.g. Out of stock, can’t deliver to this address" error={reasonError} multiline />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Keep order" variant="alt" disabled={busy} onPress={() => (setCancelling(false), setReasonError(null))} style={{ flex: 1 }} />
                  <Button title="Cancel order" variant="danger" loading={busy && pending === 'cancelled'} disabled={busy} onPress={submitCancel} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : null}
          </View>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#f1f5f9' },
  noThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldLight },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  money: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  step: { flexDirection: 'row', gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.gold, marginTop: 3 },
  dotNow: { backgroundColor: colors.navy, borderWidth: 2, borderColor: colors.gold },
  rail: { width: 2, flex: 1, backgroundColor: colors.border, marginTop: 2 },
});
