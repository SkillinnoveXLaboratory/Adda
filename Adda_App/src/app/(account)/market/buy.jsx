import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PayButton, TestModeBadge, useCheckout, usePaymentsConfig } from '../../../components/Checkout';
import { DiscountOffer } from '../../../components/Pricing';
import { ShopBadge } from '../../../components/OfferCard';
import { AsyncView, Button, Card, DetailHeader, Field, Hint, IconButton, LoadingList, Screen, SectionTitle, T, TextLink } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useToast } from '../../../context/toast';
import { useAction, useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { payErrorCopy } from '../../../lib/checkout';
import { money } from '../../../lib/format';
import { colors } from '../../../theme';

/** Buy a product (members): quantity, delivery / pickup, address, discount, pay on delivery or online. */
export default function BuyProduct() {
  const { id } = useLocalSearchParams();
  const product = useApi(`/products/${id}`, { refetchOnFocus: false });
  if (product.data) return <BuyForm product={product.data} reload={product.reload} />;
  return (
    <Screen header={<DetailHeader title="Buy" fallback="/market?tab=products" />}>
      <AsyncView state={product} skeleton={<LoadingList rows={3} card={100} />}>
        {() => null}
      </AsyncView>
    </Screen>
  );
}

function Choice({ icon, title, subtitle, selected, disabled, onPress, testID, right }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={`${title}${subtitle ? `. ${subtitle}` : ''}`}
      style={[styles.choice, selected && styles.choiceOn, disabled && { opacity: 0.55 }]}
      testID={testID}
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.navy : colors.subtle} />
      <Ionicons name={icon} size={20} color={colors.goldDark} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T weight="bold" size={13.5} color={colors.navy}>
          {title}
        </T>
        {subtitle ? (
          <T size={11.5} color={colors.muted} style={{ lineHeight: 16 }}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

function Line({ label, value, strong, tone, testID }) {
  return (
    <View style={styles.line} testID={testID}>
      <T size={12.5} weight={strong ? 'bold' : 'medium'} color={strong ? colors.navy : colors.chipText} style={{ flex: 1, minWidth: 0 }}>
        {label}
      </T>
      <T size={strong ? 15 : 12.5} weight={strong ? 'extrabold' : 'semibold'} color={tone || (strong ? colors.navy : colors.textSoft)}>
        {value}
      </T>
    </View>
  );
}

function BuyForm({ product: p, reload }) {
  const { activeMembership: m, isVendor } = useAuth();
  const toast = useToast();
  const params = useLocalSearchParams();
  const payments = usePaymentsConfig();
  const pr = p.pricing || {};
  const unit = pr.memberPricePaise ?? p.pricePaise;
  const canDiscount = !!pr.discountAvailable && pr.discountPaise > 0;
  const maxQty = Math.max(0, Math.min(p.maxPerOrder || 1, p.stock || 0));
  const defaultAddress = m ? [m.flat?.number ? `Flat ${m.flat.number}` : null, m.building?.name, m.society?.name, m.society?.city].filter(Boolean).join(', ') : '';

  const [qty, setQty] = useState(1);
  const [fulfilment, setFulfilment] = useState(p.delivery ? 'delivery' : 'pickup');
  const [address, setAddress] = useState(defaultAddress);
  const [note, setNote] = useState('');
  const [discount, setDiscount] = useState(params.discount === '1' && canDiscount);
  const [method, setMethod] = useState('cod');
  const [onlineBlocked, setOnlineBlocked] = useState(null); // reason the shop / gateway can't take online payment
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  // Live total, same formula as the server: unit×qty − discount×qty + delivery charge (delivery only).
  const itemsTotal = unit * qty;
  const discountTotal = discount ? pr.discountPaise * qty : 0;
  const deliveryCharge = fulfilment === 'delivery' ? p.deliveryChargePaise || 0 : 0;
  const total = itemsTotal - discountTotal + deliveryCharge;

  const onlineReason = !payments.loaded ? 'Checking online payment…' : !payments.configured ? 'Online payment is not available yet.' : onlineBlocked;
  const onlineOk = !onlineReason;

  const goToOrder = (orderId) => router.replace(`/my-orders/${orderId}`);
  const [placed, setPlaced] = useState(null);
  const pay = useCheckout({ onClose: () => placed && goToOrder(placed) });

  const [submit, busy] = useAction(async () => {
    const e = {};
    if (qty < 1 || qty > maxQty) e.qty = `Choose 1 to ${maxQty}`;
    if (fulfilment === 'delivery' && address.trim().length < 5) e.address = 'Enter the full delivery address (flat, building, area)';
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    try {
      const res = await api(`/products/${p._id}/orders`, {
        method: 'POST',
        body: {
          quantity: qty,
          fulfilment,
          ...(fulfilment === 'delivery' && { address: address.trim() }),
          ...(note.trim() && { note: note.trim() }),
          ...(discount && { applyDiscount: true }),
          paymentMethod: method,
        },
      });
      const order = res.order;
      if (method === 'online' && res.checkout) {
        setPlaced(order._id);
        toast.info(`Order ${order.orderNumber} reserved — complete the payment`);
        await pay.start(`/product-orders/${order._id}/pay`, { checkout: res.checkout });
        return;
      }
      toast.success(`Order ${order.orderNumber} placed`);
      goToOrder(order._id);
    } catch (err) {
      if (err.code === 'NO_DISCOUNT') setDiscount(false);
      if (err.code === 'OUT_OF_STOCK') reload();
      if (['VENDOR_PAYOUT_NOT_READY', 'PAYMENTS_UNAVAILABLE'].includes(err.code)) {
        setOnlineBlocked(err.message || payErrorCopy(err).message);
        setMethod('cod');
      }
      const copy = payErrorCopy(err);
      setFormError({ title: ['VENDOR_PAYOUT_NOT_READY', 'PAYMENTS_UNAVAILABLE', 'PHONE_REQUIRED'].includes(err.code) ? copy.title : 'Couldn’t place the order', message: err.code === 'VENDOR_PAYOUT_NOT_READY' || err.code === 'PAYMENTS_UNAVAILABLE' ? `${copy.message} We switched you to ${fulfilment === 'pickup' ? 'pay at pickup' : 'pay on delivery'}.` : copy.message, action: copy.action });
    }
  });

  const codLabel = fulfilment === 'pickup' ? 'Pay at pickup' : 'Pay on delivery';
  const placeTitle = method === 'online' ? `Pay ${money(total)}` : `Place order · ${money(total)}`;

  return (
    <Screen
      header={<DetailHeader title="Buy" fallback={`/market/product/${p._id}`} />}
      footer={
        isVendor || maxQty < 1 ? null : method === 'online' ? (
          <PayButton title={placeTitle} onPress={submit} loading={busy || pay.busy} testID="place-order" />
        ) : (
          <Button title={placeTitle} icon="bag-check-outline" variant="gold" onPress={submit} loading={busy} testID="place-order" />
        )
      }
    >
      <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {p.photos?.[0]?.url ? <Image source={{ uri: p.photos[0].url }} style={styles.thumb} accessibilityIgnoresInvertColors /> : <View style={[styles.thumb, { backgroundColor: colors.goldLight }]} />}
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <T weight="extrabold" size={14.5} color={colors.navy} numberOfLines={2}>
            {p.title}
          </T>
          <T weight="bold" size={13} color={colors.goldText}>
            {money(unit)}
            {p.unit ? ` / ${p.unit}` : ''}
          </T>
          <ShopBadge shop={p.shop} size={18} />
        </View>
      </Card>

      {isVendor ? <Hint tone="amber">Vendor accounts can’t buy products. Use a member account to order.</Hint> : null}
      {maxQty < 1 ? <Hint tone="amber" icon="alert-circle-outline">This product is out of stock right now.</Hint> : null}

      <SectionTitle title="Quantity" />
      <View style={styles.qtyRow}>
        <IconButton icon="remove" label="Decrease quantity" onPress={() => setQty((q) => Math.max(1, q - 1))} style={[styles.qtyBtn, qty <= 1 && { opacity: 0.4 }]} />
        <T weight="extrabold" size={18} color={colors.navy} style={{ minWidth: 40, textAlign: 'center' }} accessibilityLabel={`Quantity ${qty}`} testID="qty-value">
          {qty}
        </T>
        <IconButton icon="add" label="Increase quantity" onPress={() => setQty((q) => Math.min(maxQty, q + 1))} style={[styles.qtyBtn, qty >= maxQty && { opacity: 0.4 }]} />
        <T size={11.5} color={colors.muted} style={{ flex: 1, minWidth: 0 }}>
          {maxQty > 0 ? `Up to ${maxQty}${p.stock <= 10 ? ` · only ${p.stock} left` : ''}` : 'Out of stock'}
        </T>
      </View>
      {errors.qty ? (
        <T size={12} color={colors.danger}>
          {errors.qty}
        </T>
      ) : null}

      <SectionTitle title="How do you want it?" />
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        {p.delivery ? <Choice icon="bicycle-outline" title="Home delivery" subtitle={p.deliveryChargePaise > 0 ? `Delivery charge ${money(p.deliveryChargePaise)}` : 'Free delivery'} selected={fulfilment === 'delivery'} onPress={() => setFulfilment('delivery')} testID="fulfil-delivery" /> : null}
        {p.pickup ? <Choice icon="storefront-outline" title="Pick up from the shop" subtitle="No delivery charge. The shop tells you when it’s ready." selected={fulfilment === 'pickup'} onPress={() => setFulfilment('pickup')} testID="fulfil-pickup" /> : null}
      </View>
      {fulfilment === 'delivery' ? <Field label="Delivery address" value={address} onChangeText={(v) => (setAddress(v), setErrors((x) => ({ ...x, address: null })))} multiline maxLength={300} placeholder="Flat, building, society, area" error={errors.address} testID="order-address" /> : null}
      <Field label="Note for the shop (optional)" value={note} onChangeText={setNote} maxLength={300} placeholder="e.g. Ring the bell twice" />

      {canDiscount ? (
        <>
          <SectionTitle title="Discount" />
          <DiscountOffer pricing={{ ...pr, discountPaise: pr.discountPaise * qty, payableWithDiscountPaise: (unit - pr.discountPaise) * qty, memberPricePaise: itemsTotal }} applied={discount} onToggle={() => setDiscount((d) => !d)} />
        </>
      ) : null}

      <SectionTitle title="Payment" />
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        <Choice icon="cash-outline" title={codLabel} subtitle={fulfilment === 'pickup' ? 'Pay the shop in cash or UPI when you collect it.' : 'Pay in cash or UPI when it arrives.'} selected={method === 'cod'} onPress={() => setMethod('cod')} testID="pay-cod" />
        <Choice
          icon="card-outline"
          title="Pay online"
          subtitle={onlineOk ? 'UPI, cards or net banking via Cashfree.' : onlineReason}
          selected={method === 'online'}
          disabled={!onlineOk}
          onPress={() => setMethod('online')}
          testID="pay-online"
          right={payments.testMode && onlineOk ? <TestModeBadge /> : null}
        />
      </View>

      <View style={styles.summary} testID="order-summary">
        <Line label={`${money(unit)} × ${qty}`} value={money(itemsTotal)} />
        {discountTotal > 0 ? <Line label="NIVASA discount" value={`− ${money(discountTotal)}`} tone={colors.green} /> : null}
        {fulfilment === 'delivery' ? <Line label="Delivery charge" value={deliveryCharge > 0 ? `+ ${money(deliveryCharge)}` : 'Free'} /> : null}
        <View style={styles.rule} />
        <Line label="You pay" value={money(total)} strong testID="order-total" />
      </View>

      {formError ? (
        <View style={{ gap: 4 }}>
          <Hint tone="coral" icon="alert-circle-outline">{`${formError.title}. ${formError.message}`}</Hint>
          {formError.action ? <TextLink title={formError.action.title} onPress={() => router.push(formError.action.href)} /> : null}
        </View>
      ) : null}
      {method === 'online' ? (
        <T size={11.5} color={colors.muted} style={{ lineHeight: 17 }}>
          The items are held for you for 30 minutes while you pay. If the payment isn’t completed, the order is cancelled automatically.
        </T>
      ) : null}
      {pay.sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.divider },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 6 },
  qtyBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.goldLight },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, padding: 12, minHeight: 56 },
  choiceOn: { borderColor: colors.navy, backgroundColor: colors.goldLight },
  summary: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
});
