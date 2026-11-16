import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { money } from '../lib/format';
import { colors } from '../theme';
import { T } from './Text';
import { Button } from './ui';

/**
 * Per-vendor pricing (skills/vendor-marketplace rule 5). The server always recomputes; these only preview it.
 * NIVASA's fee is ADDED on top of the vendor's price; the member discount is a share OF that fee.
 * Percent → basis points first (≤ 2 decimals), then half-up whole paise — the same rounding as the server.
 */
const bps = (percent) => Math.round((Number(percent) || 0) * 100);
export const feeOf = (vendorPricePaise, commissionPercent) => Math.round((vendorPricePaise * bps(commissionPercent)) / 10_000);
export const memberPriceOf = (vendorPricePaise, commissionPercent) => vendorPricePaise + feeOf(vendorPricePaise, commissionPercent);
export const discountOf = (vendorPricePaise, commissionPercent, discountPercent) => Math.round((feeOf(vendorPricePaise, commissionPercent) * bps(discountPercent)) / 10_000);

function Row({ label, value, strong, tone, testID }) {
  return (
    <View style={styles.row} testID={testID}>
      <T size={12.5} weight={strong ? 'bold' : 'medium'} color={strong ? colors.navy : '#475569'} style={{ flex: 1 }}>
        {label}
      </T>
      <T size={strong ? 14 : 12.5} weight={strong ? 'extrabold' : 'semibold'} color={tone || (strong ? colors.navy : colors.textSoft)}>
        {value}
      </T>
    </View>
  );
}

/**
 * Vendor's service form: what members will see for the price typed, from the vendor's own rates
 * (GET /vendor/profile → pricing). With 0% commission members simply see the vendor's price.
 */
export function MemberPricePreview({ pricePaise, pricing, onQuote }) {
  const commission = pricing?.commissionPercent || 0;
  const discount = pricing?.memberDiscountPercent || 0;
  if (onQuote || !(pricePaise > 0)) {
    return (
      <View style={styles.box} testID="member-price-preview">
        <T size={12} color="#475569" style={{ lineHeight: 18 }}>
          {commission > 0
            ? `Price on request: you record the amount you collect when you mark the job paid. NIVASA’s ${commission}% fee is taken from that amount.`
            : 'Price on request: you record the amount you collect when you mark the job paid.'}
        </T>
      </View>
    );
  }
  if (!(commission > 0)) {
    return (
      <View style={styles.box} testID="member-price-preview">
        <Row label="Members see" value={money(pricePaise)} strong testID="members-see" />
        <T size={11} color={colors.muted} style={{ lineHeight: 16 }}>
          Members pay your price. You keep all of it.
        </T>
      </View>
    );
  }
  const member = memberPriceOf(pricePaise, commission);
  const off = discountOf(pricePaise, commission, discount);
  return (
    <View style={styles.box} testID="member-price-preview">
      <Row label="Your price" value={money(pricePaise)} />
      <Row label={`NIVASA fee (${commission}%), added for members`} value={`+ ${money(member - pricePaise)}`} />
      <View style={styles.line} />
      <Row label="Members see" value={money(member)} strong testID="members-see" />
      <T size={11} color={colors.muted} style={{ lineHeight: 16 }}>
        {off > 0
          ? `Members can apply a ${money(off)} discount (${discount}% of the fee) and pay ${money(member - off)}. You still earn ${money(pricePaise)}.`
          : `You earn ${money(pricePaise)} for each paid job.`}
      </T>
    </View>
  );
}

/** Member's booking summary: member price, the discount when applied, what they pay the vendor. */
export function BookingPriceSummary({ memberPricePaise, discountPaise = 0 }) {
  if (!(memberPricePaise > 0)) {
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
      <Row label="Service price" value={money(memberPricePaise)} />
      {discountPaise > 0 ? <Row label="NIVASA discount" value={`− ${money(discountPaise)}`} tone={colors.green} /> : null}
      <View style={styles.line} />
      <Row label="You pay the vendor" value={money(Math.max(0, memberPricePaise - discountPaise))} strong testID="booking-payable" />
    </View>
  );
}

/** "Apply discount": the vendor's NIVASA discount, shown as −₹X and "you pay ₹Y"; Remove undoes it. */
export function DiscountOffer({ pricing, applied, onToggle }) {
  return (
    <View style={[styles.offer, applied && styles.offerOn]} testID={applied ? 'discount-applied' : 'discount-offer'}>
      <Ionicons name={applied ? 'checkmark-circle' : 'pricetag'} size={20} color={applied ? colors.green : colors.goldDark} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <T weight="bold" size={13} color={colors.navy}>
          {applied ? 'Discount applied' : `Save ${money(pricing.discountPaise)} with NIVASA`}
        </T>
        <T size={11.5} color={colors.muted}>
          {applied ? `−${money(pricing.discountPaise)}, you pay ${money(pricing.payableWithDiscountPaise)}` : `You’d pay ${money(pricing.payableWithDiscountPaise)} instead of ${money(pricing.memberPricePaise)}`}
        </T>
      </View>
      {applied ? (
        <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel="Remove discount" hitSlop={6} style={styles.remove}>
          <T weight="bold" size={12} color={colors.danger}>
            Remove
          </T>
        </Pressable>
      ) : (
        <Button small title="Apply discount" variant="brand" onPress={onToggle} style={styles.applyBtn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.goldLight, borderWidth: 1, borderColor: colors.gold, borderRadius: 14, padding: 12 },
  offerOn: { backgroundColor: colors.greenBg, borderColor: '#a7f3d0' },
  applyBtn: { paddingHorizontal: 12, flexShrink: 0 },
  remove: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
});
