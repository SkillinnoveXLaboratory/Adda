import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, formatDateTime, money, titleCase } from '../lib/format';
import { colors, shadow } from '../theme';
import { Badge, T } from './ui';

/** Short status names for chips, badges and the tracker (the server also sends a longer `statusText`). */
export function orderStatusLabel(status, fulfilment) {
  if (status === 'delivered') return fulfilment === 'pickup' ? 'Picked up' : 'Delivered';
  return (
    {
      awaiting_payment: 'Awaiting payment',
      placed: 'Placed',
      confirmed: 'Confirmed',
      packed: 'Packed',
      shipped: 'Shipped',
      out_for_delivery: 'Out for delivery',
      ready_for_pickup: 'Ready for pickup',
      cancelled: 'Cancelled',
    }[status] || titleCase(status || '')
  );
}

export function orderTone(status) {
  if (status === 'delivered') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'awaiting_payment') return 'warning';
  return 'info';
}

/** Payment line for an order / booking: `{ label, tone }` or null when there is nothing to say. */
export function paymentBadge(payment, { method } = {}) {
  const s = payment?.status;
  const how = (payment?.method || method) === 'online' ? 'online' : 'cash';
  if (s === 'paid') return { label: `Paid ${how}`, tone: 'success' };
  if (s === 'refund_pending') return { label: 'Refund in progress', tone: 'warning' };
  if (s === 'refunded') return { label: 'Refunded', tone: 'neutral' };
  return null;
}

const DELIVERY_STEPS = ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const PICKUP_STEPS = ['placed', 'confirmed', 'packed', 'ready_for_pickup', 'delivered'];

/**
 * Flipkart-style vertical step tracker. Delivery: Placed → Confirmed → Packed → Shipped → Out for delivery → Delivered;
 * pickup: Placed → Confirmed → Packed → Ready for pickup → Picked up. Times come from the order's timeline.
 */
export function OrderTracker({ order }) {
  const steps = order.fulfilment === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS;
  const reached = steps.indexOf(order.status);
  const at = {};
  for (const t of order.timeline || []) if (!at[t.status]) at[t.status] = t.at;
  return (
    <View testID="order-tracker" accessibilityLabel={`Order status: ${orderStatusLabel(order.status, order.fulfilment)}`}>
      {steps.map((s, i) => {
        const done = i <= reached;
        const current = i === reached;
        const last = i === steps.length - 1;
        return (
          <View key={s} style={styles.step}>
            <View style={styles.rail}>
              <View style={[styles.dot, done && styles.dotDone, current && !last && styles.dotCurrent]}>{done ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}</View>
              {!last ? <View style={[styles.bar, i < reached && styles.barDone]} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 18 }}>
              <T weight={current ? 'extrabold' : done ? 'bold' : 'medium'} size={13.5} color={done ? colors.navy : colors.subtle}>
                {orderStatusLabel(s, order.fulfilment)}
              </T>
              {done && at[s] ? (
                <T size={11.5} color={colors.muted}>
                  {formatDateTime(at[s])}
                </T>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** One order in My orders. */
export function OrderCard({ order: o, onPress }) {
  const pay = paymentBadge(o.payment, { method: o.paymentMethod });
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Order ${o.orderNumber}, ${o.product?.title}, ${orderStatusLabel(o.status, o.fulfilment)}, ${money(o.payablePaise)}`} style={({ pressed }) => [styles.card, pressed && styles.pressed]} testID="order-card">
      {o.product?.photoUrl ? (
        <Image source={{ uri: o.product.photoUrl }} style={styles.thumb} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.thumb, styles.noThumb]}>
          <Ionicons name="cube-outline" size={26} color={colors.goldDark} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <T weight="bold" size={13.5} color={colors.navy} numberOfLines={2}>
          {o.product?.title}
        </T>
        <T size={11.5} color={colors.muted} numberOfLines={1}>
          {o.quantity} × {o.product?.unit || 'item'} · {o.shopName}
        </T>
        <T size={11} color={colors.subtle} numberOfLines={1}>
          {o.orderNumber} · {formatDate(o.createdAt)}
        </T>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          <Badge tone={orderTone(o.status)} label={orderStatusLabel(o.status, o.fulfilment)} />
          {pay ? <Badge tone={pay.tone} label={pay.label} /> : null}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <T weight="extrabold" size={14} color={colors.navy}>
          {money(o.payablePaise)}
        </T>
        <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 12 },
  rail: { width: 22, alignItems: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.inputBorder, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.greenStrong, borderColor: colors.greenStrong },
  dotCurrent: { borderColor: colors.gold, borderWidth: 3 },
  bar: { flex: 1, width: 2, minHeight: 18, backgroundColor: colors.inputBorder, marginVertical: 2 },
  barDone: { backgroundColor: colors.greenStrong },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, ...shadow.card },
  pressed: { borderColor: colors.gold, opacity: 0.95 },
  thumb: { width: 60, height: 60, borderRadius: 12, backgroundColor: colors.divider },
  noThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldLight },
});
