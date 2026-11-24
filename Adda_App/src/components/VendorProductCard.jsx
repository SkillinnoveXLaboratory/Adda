import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { money } from '../lib/format';
import { colors, shadow } from '../theme';
import { CategoryIcon } from './CategoryIcon';
import { discountOf, feeOf } from './Pricing';
import { Badge, T } from './ui';

export const LOW_STOCK = 5;

/** Stock badge for the vendor: out of stock / only N left / nothing when there is plenty. */
export function stockBadge(stock) {
  if (!(stock > 0)) return { label: 'Out of stock', tone: 'danger' };
  if (stock <= LOW_STOCK) return { label: `Low stock: ${stock} left`, tone: 'warning' };
  return null;
}

/** One of the vendor's own products (owner view of GET /products/mine): review status, stock, own + member price. */
export function VendorProductCard({ item, onPress }) {
  const photo = item.photos?.[0]?.url;
  const pr = item.pricing || {};
  const stock = stockBadge(item.stock);
  const mod = item.moderationStatus;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}. Edit product`} style={({ pressed }) => [styles.card, pressed && styles.pressed]} testID="vendor-product-card">
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={styles.badges}>
            {mod === 'pending' ? <Badge label="In review" tone="warning" /> : mod === 'rejected' ? <Badge label="Rejected" tone="danger" /> : mod === 'approved' ? <Badge label="Approved" tone="success" /> : null}
            {item.status === 'paused' ? <Badge label="Paused" tone="neutral" /> : <Badge label="Active" tone="info" />}
            {stock ? <Badge label={stock.label} tone={stock.tone} /> : null}
          </View>
          <T weight="bold" size={13.5} numberOfLines={2}>
            {item.title}
          </T>
          <T size={11.5} color={colors.muted} numberOfLines={1}>
            {[item.category?.name, item.unit, `Stock ${item.stock}`].filter(Boolean).join(' · ')}
          </T>
        </View>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.thumb} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.thumb, styles.noThumb]}>
            <CategoryIcon icon={item.category?.icon} name={item.category?.name} size={32} />
          </View>
        )}
      </View>
      <View style={styles.prices}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={10.5} color={colors.muted}>
            Price (members pay)
          </T>
          <T weight="extrabold" size={13} color={colors.navy}>
            {money(item.pricePaise)}
          </T>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={10.5} color={colors.muted}>
            You earn
          </T>
          <T weight="extrabold" size={13} color={colors.green}>
            {pr.vendorEarningsPaise != null ? money(pr.vendorEarningsPaise) : money(item.pricePaise - (pr.commissionPaise || 0))}
          </T>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={10.5} color={colors.muted}>
            Fulfilment
          </T>
          <T weight="bold" size={12} color={colors.textSoft} numberOfLines={1}>
            {[item.delivery ? 'Delivery' : null, item.pickup ? 'Pickup' : null].filter(Boolean).join(' + ')}
          </T>
        </View>
      </View>
      {mod === 'rejected' || (mod === 'pending' && item.moderationNote) ? (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={mod === 'rejected' ? colors.danger : colors.amber} />
          <T size={11.5} color={mod === 'rejected' ? colors.danger : colors.amber} style={{ flex: 1, minWidth: 0 }}>
            {item.moderationNote ? `NIVASA: ${item.moderationNote}` : 'Not approved. Edit the product and save to send it for review again.'}
          </T>
        </View>
      ) : null}
    </Pressable>
  );
}

function Row({ label, value, strong, tone, testID }) {
  return (
    <View style={styles.pRow} testID={testID}>
      <T size={12.5} weight={strong ? 'bold' : 'medium'} color={strong ? colors.navy : colors.textSoft} style={{ flex: 1, minWidth: 0 }}>
        {label}
      </T>
      <T size={strong ? 14 : 12.5} weight={strong ? 'extrabold' : 'semibold'} color={tone || (strong ? colors.navy : colors.textSoft)}>
        {value}
      </T>
    </View>
  );
}

/**
 * Product form preview of what members see per unit. Uses the server's owner-view `pricing` when it matches the
 * price typed (saved product), else this vendor's own rates from GET /vendor/profile with the shared formula
 * (components/Pricing). Without either it says so instead of guessing.
 */
export function ProductPricePreview({ pricePaise, deliveryChargePaise = 0, rates, saved }) {
  if (!(pricePaise > 0)) {
    return (
      <View style={styles.box} testID="product-price-preview">
        <T size={12} color={colors.textSoft}>
          Enter your price to see what members pay.
        </T>
      </View>
    );
  }
  let fee;
  let off;
  let commission;
  let discount;
  if (saved && saved.vendorPricePaise === pricePaise) {
    fee = saved.commissionPaise;
    off = saved.discountPaise;
    commission = saved.commissionPercent;
    discount = saved.memberDiscountPercent;
  } else if (rates) {
    commission = rates.commissionPercent || 0;
    discount = rates.memberDiscountPercent || 0;
    fee = feeOf(pricePaise, commission);
    off = discountOf(pricePaise, commission, discount);
  } else {
    return (
      <View style={styles.box} testID="product-price-preview">
        <T size={12} color={colors.textSoft}>
          Your NIVASA rates could not be loaded, so the member price is shown after you save.
        </T>
      </View>
    );
  }
  // Members see and pay the vendor's price; NIVASA's fee comes out of it and is never shown to members.
  const earn = pricePaise - fee;
  return (
    <View style={styles.box} testID="product-price-preview">
      <Row label="Members see and pay (per unit)" value={money(pricePaise)} testID="product-members-see" />
      {fee > 0 ? <Row label={`NIVASA fee (${commission}%)`} value={`− ${money(fee)}`} /> : null}
      <View style={styles.line} />
      <Row label="You earn (per unit)" value={money(earn)} strong tone={colors.green} testID="product-you-earn" />
      <T size={11} color={colors.muted} style={{ lineHeight: 16 }}>
        {fee > 0 ? 'Members never see the fee. ' : 'Members pay your price. '}
        {off > 0 ? `They can apply a ${money(off)} NIVASA discount (${discount}% of the fee) — NIVASA covers it, your earnings don't change.` : ''}
        {deliveryChargePaise > 0 ? ` You also keep the ${money(deliveryChargePaise)} delivery charge (no fee on it).` : ''}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9', padding: 12, gap: 10, ...shadow.card },
  pressed: { borderColor: colors.gold, opacity: 0.95 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumb: { width: 68, height: 68, borderRadius: 12, backgroundColor: '#f1f5f9' },
  noThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldLight },
  prices: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  box: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
});
