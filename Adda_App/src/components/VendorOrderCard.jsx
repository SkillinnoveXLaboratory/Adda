import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDateTime, money } from '../lib/format';
import { colors, shadow } from '../theme';
import { Badge, T } from './ui';

/**
 * Vendor product orders (skills/vendor-products). Labels and tones for the server's order status machine:
 * placed → confirmed → packed → shipped → out_for_delivery → delivered (delivery) | packed → ready_for_pickup → delivered (pickup).
 */
const STATUS = {
  placed: ['New order', 'warning'],
  confirmed: ['Confirmed', 'info'],
  packed: ['Packed', 'info'],
  shipped: ['Shipped', 'info'],
  out_for_delivery: ['Out for delivery', 'info'],
  ready_for_pickup: ['Ready for pickup', 'info'],
  delivered: ['Delivered', 'success'],
  cancelled: ['Cancelled', 'neutral'],
};

/** Short status label; a delivered pickup order reads "Picked up". */
export function orderStatusLabel(o) {
  if (o.status === 'delivered' && o.fulfilment === 'pickup') return 'Picked up';
  return STATUS[o.status]?.[0] || o.statusText || o.status;
}
export const orderStatusTone = (status) => STATUS[status]?.[1] || 'neutral';

/** Friendly button labels for the next steps the server allows (`nextStatuses`). */
export function orderActionLabel(status, o) {
  return (
    {
      confirmed: 'Confirm order',
      packed: 'Mark packed',
      shipped: 'Mark shipped',
      out_for_delivery: 'Out for delivery',
      ready_for_pickup: 'Ready for pickup',
      delivered: o?.fulfilment === 'pickup' ? 'Mark picked up' : 'Mark delivered',
      cancelled: 'Cancel order',
    }[status] || status
  );
}

/** COD / Paid online / Refund pending … from the order's payment method + payment status. */
export function orderPaymentLabel(o) {
  const st = o.payment?.status;
  if (st === 'refund_pending') return 'Refund pending';
  if (st === 'refunded') return 'Refunded';
  if (o.paymentMethod === 'online') return st === 'paid' ? 'Paid online' : 'Online (unpaid)';
  return st === 'paid' ? 'COD · cash received' : 'Cash on delivery';
}

/** Filter chips for the vendor's orders list (server `status` query values). */
export const ORDER_FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'placed', label: 'New' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'ready_for_pickup', label: 'Ready for pickup' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: '', label: 'All' },
];
const CLOSED = ['delivered', 'cancelled'];
/** Count for a filter chip from the server's `counts:{status:n}`. */
export function orderCount(counts = {}, value) {
  if (value === '') return Object.values(counts).reduce((a, b) => a + b, 0);
  if (value === 'open') return Object.entries(counts).reduce((a, [k, n]) => a + (CLOSED.includes(k) ? 0 : n), 0);
  return counts[value] || 0;
}

function Pill({ icon, label }) {
  return (
    <View style={styles.pill}>
      <Ionicons name={icon} size={12} color={colors.textSoft} />
      <T weight="semibold" size={11} color={colors.textSoft} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}

/** One order in the vendor's Orders list. */
export function VendorOrderCard({ order: o, onPress }) {
  const label = orderStatusLabel(o);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Order ${o.orderNumber}, ${o.product?.title}, ${label}`} style={({ pressed }) => [styles.card, pressed && styles.pressed]} testID="vendor-order-card">
      <View style={styles.top}>
        <T weight="extrabold" size={12.5} color={colors.navy} style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
          {o.orderNumber}
          <T size={11} color={colors.muted}>{`  ·  ${formatDateTime(o.createdAt)}`}</T>
        </T>
        <Badge label={label} tone={orderStatusTone(o.status)} style={{ flexShrink: 0 }} />
      </View>
      <View style={styles.row}>
        {o.product?.photoUrl ? (
          <Image source={{ uri: o.product.photoUrl }} style={styles.thumb} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.thumb, styles.noThumb]}>
            <Ionicons name="cube-outline" size={26} color={colors.goldDark} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T weight="bold" size={13.5} numberOfLines={2}>
            {o.product?.title}
          </T>
          <T size={12} color={colors.muted} numberOfLines={1}>
            Qty {o.quantity}
            {o.product?.unit ? ` × ${o.product.unit}` : ''}
            {o.customer?.name ? ` · ${o.customer.name}` : ''}
          </T>
          <T weight="bold" size={12} color={colors.green} numberOfLines={1}>
            You get {money(o.yourEarningsPaise)}
          </T>
        </View>
      </View>
      <View style={styles.pills}>
        <Pill icon={o.fulfilment === 'pickup' ? 'storefront-outline' : 'bicycle-outline'} label={o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'} />
        <Pill icon={o.paymentMethod === 'online' ? 'card-outline' : 'cash-outline'} label={orderPaymentLabel(o)} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9', padding: 12, gap: 10, ...shadow.card },
  pressed: { borderColor: colors.gold, opacity: 0.95 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#f1f5f9' },
  noThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldLight },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
});
