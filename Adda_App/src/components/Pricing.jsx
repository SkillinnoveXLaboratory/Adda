import { StyleSheet, View } from 'react-native';
import { money } from '../lib/format';
import { colors } from '../theme';
import { T } from './Text';

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
