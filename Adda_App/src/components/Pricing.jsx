import { StyleSheet, View } from 'react-native';
import { money } from '../lib/format';
import { colors } from '../theme';
import { T } from './Text';

/** Commission in paise for a price and a percentage (same rounding as the server: half up, whole paise). */
export const commissionOf = (pricePaise, percent) => Math.round((pricePaise * Math.round((percent || 0) * 100)) / 10_000);

function Row({ label, value, strong, tone }) {
  return (
    <View style={styles.row}>
      <T size={12.5} weight={strong ? 'bold' : 'medium'} color={strong ? colors.navy : '#475569'} style={{ flex: 1 }}>
        {label}
      </T>
      <T size={strong ? 14 : 12.5} weight={strong ? 'extrabold' : 'semibold'} color={tone || (strong ? colors.navy : '#334155')}>
        {value}
      </T>
    </View>
  );
}

/**
 * Vendor's view while publishing a service: price, the platform commission at the admin's current rate,
 * and what the vendor earns. "Price on request" services show the rate only.
 */
export function CommissionBreakdown({ pricePaise, percent = 0, onQuote }) {
  if (onQuote || !(pricePaise > 0)) {
    return (
      <View style={styles.box} testID="commission-breakdown">
        <T size={12} color="#475569" style={{ lineHeight: 18 }}>
          {percent > 0 ? `NIVASA keeps a ${percent}% platform commission on the amount you collect for each booking.` : 'No platform commission is charged right now.'}
        </T>
      </View>
    );
  }
  const commission = commissionOf(pricePaise, percent);
  return (
    <View style={styles.box} testID="commission-breakdown">
      <Row label="Price members see" value={money(pricePaise)} />
      <Row label={`NIVASA commission (${percent}%)`} value={percent > 0 ? `− ${money(commission)}` : money(0)} tone={percent > 0 ? colors.danger : undefined} />
      <View style={styles.line} />
      <Row label="You earn" value={money(pricePaise - commission)} strong />
      <T size={11} color={colors.muted} style={{ marginTop: 4, lineHeight: 16 }}>
        Members pay you directly. The commission is settled with NIVASA later. Coupons members use are paid back to you by NIVASA.
      </T>
    </View>
  );
}

/** Member's booking summary: price, coupon discount, what they pay the vendor. */
export function BookingPriceSummary({ listPricePaise, discountPaise = 0, couponCode }) {
  if (!(listPricePaise > 0)) {
    return (
      <View style={styles.box}>
        <T size={12.5} color="#475569">
          Price on request — the vendor tells you the price before starting.
        </T>
      </View>
    );
  }
  return (
    <View style={styles.box} testID="booking-price-summary">
      <Row label="Service price" value={money(listPricePaise)} />
      {discountPaise > 0 ? <Row label={`Coupon ${couponCode || ''}`.trim()} value={`− ${money(discountPaise)}`} tone={colors.green} /> : null}
      <View style={styles.line} />
      <Row label="You pay the vendor" value={money(Math.max(0, listPricePaise - discountPaise))} strong />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
});
