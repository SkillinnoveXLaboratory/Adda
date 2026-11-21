import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CategoryIcon } from '../../../../components/CategoryIcon';
import { distanceText, ShopBadge } from '../../../../components/OfferCard';
import { stockText } from '../../../../components/ProductBrowser';
import { AsyncView, Badge, Button, Card, DetailHeader, Hint, KeyValue, LoadingList, Screen, T } from '../../../../components/ui';
import { useAuth } from '../../../../context/auth';
import { useToast } from '../../../../context/toast';
import { useApi } from '../../../../hooks/useApi';
import { api } from '../../../../lib/api';
import { money } from '../../../../lib/format';
import { colors } from '../../../../theme';

const REASONS = ['Fraud or scam', 'Wrong or misleading information', 'Prohibited item', 'Inappropriate content'];

function Photos({ item }) {
  const { width: screen } = useWindowDimensions();
  const width = Math.min(screen, 600) - 32;
  const [index, setIndex] = useState(0);
  if (!item.photos?.length) {
    return (
      <View style={[styles.noPhoto, { height: 160 }]}>
        <CategoryIcon icon={item.category?.icon} name={item.category?.name} size={64} />
      </View>
    );
  }
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ borderRadius: 16 }}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        accessibilityLabel={`${item.photos.length} photo${item.photos.length === 1 ? '' : 's'}`}
      >
        {item.photos.map((p) => (
          <Image key={p._id} source={{ uri: p.url }} style={{ width, height: 240, borderRadius: 16, backgroundColor: colors.divider }} accessibilityIgnoresInvertColors />
        ))}
      </ScrollView>
      {item.photos.length > 1 ? (
        <View style={styles.dots}>
          {item.photos.map((p, i) => (
            <View key={p._id} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ProductDetail({ item }) {
  const { isVendor } = useAuth();
  const toast = useToast();
  const [reporting, setReporting] = useState(false);
  const pr = item.pricing || {};
  const price = pr.memberPricePaise ?? item.pricePaise;
  const out = !item.inStock || !(item.stock > 0);
  const stock = stockText(item);
  const canBuy = !isVendor && !item.mine && !out;
  const discount = pr.discountAvailable && pr.discountPaise > 0;
  const buy = (withDiscount) => router.push({ pathname: '/market/buy', params: { id: item._id, ...(withDiscount && { discount: '1' }) } });

  const report = async (reason) => {
    try {
      const r = await api(`/products/${item._id}/report`, { method: 'POST', body: { reason } });
      toast.success(r?.message || 'Thanks — our team will review this product.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReporting(false);
    }
  };

  return (
    <>
      <Photos item={item} />

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {item.category?.name ? <Badge label={item.category.name} tone="info" /> : null}
          {stock ? <Badge label={stock} tone={out ? 'danger' : 'warning'} /> : <Badge label="In stock" tone="success" />}
        </View>
        <T weight="extrabold" size={19} style={{ lineHeight: 26 }} accessibilityRole="header">
          {item.title}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <T weight="extrabold" size={20} color={colors.navy} testID="product-price-shown">
            {money(price)}
          </T>
          {item.unit ? (
            <T size={13} color={colors.muted}>
              / {item.unit}
            </T>
          ) : null}
        </View>
        <ShopBadge shop={item.shop} />
        {item.city || item.distanceKm != null ? (
          <T size={12.5} color={colors.muted}>
            {[item.city, distanceText(item.distanceKm)].filter(Boolean).join(' · ')}
          </T>
        ) : null}
      </View>

      {discount && canBuy ? (
        <View style={styles.offer} testID="product-discount">
          <Ionicons name="pricetag" size={20} color={colors.goldDark} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="bold" size={13} color={colors.navy}>
              Save {money(pr.discountPaise)} on each with NIVASA
            </T>
            <T size={11.5} color={colors.muted}>
              You’d pay {money(pr.payableWithDiscountPaise)} instead of {money(price)}
            </T>
          </View>
        </View>
      ) : null}

      <Card>
        <T weight="bold" size={14} style={{ marginBottom: 4 }}>
          Delivery and pickup
        </T>
        {item.delivery ? <KeyValue label="Home delivery" value={item.deliveryChargePaise > 0 ? `${money(item.deliveryChargePaise)} per order` : 'Free'} /> : null}
        {item.pickup ? <KeyValue label="Pickup from the shop" value="Free" /> : null}
        <KeyValue label="Available" value={out ? 'Out of stock' : `${item.stock} in stock`} valueColor={out ? colors.danger : undefined} />
        <KeyValue label="Max per order" value={String(item.maxPerOrder || 1)} />
      </Card>

      {item.description ? (
        <Card>
          <T weight="bold" size={14} style={{ marginBottom: 6 }}>
            About this product
          </T>
          <T size={13.5} color={colors.textSoft} style={{ lineHeight: 21 }}>
            {item.description}
          </T>
        </Card>
      ) : null}

      {isVendor ? <Hint tone="amber">Vendor accounts can’t buy products. Use a member account to order.</Hint> : null}
      {!isVendor && out ? <Hint tone="amber" icon="alert-circle-outline">This product is out of stock right now. Check again later.</Hint> : null}

      {canBuy ? (
        <View style={{ gap: 10 }}>
          <Button title="Buy now" icon="bag-handle-outline" variant="gold" onPress={() => buy(false)} testID="product-buy" />
          {discount ? <Button title={`Buy with ${money(pr.discountPaise)} off`} icon="pricetag-outline" variant="brand" onPress={() => buy(true)} /> : null}
          <T size={11.5} color={colors.muted} style={{ lineHeight: 17 }}>
            Pay on delivery or online. You can follow every step of your order under My orders.
          </T>
        </View>
      ) : null}

      {!item.mine ? (
        reporting ? (
          <Card style={{ gap: 4 }}>
            <T weight="bold" size={14}>
              Why are you reporting this product?
            </T>
            {REASONS.map((r) => (
              <Pressable key={r} onPress={() => report(r)} accessibilityRole="button" style={styles.reason}>
                <T size={14}>{r}</T>
              </Pressable>
            ))}
            <Pressable onPress={() => setReporting(false)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
              <T weight="bold" size={14} color={colors.muted}>
                Cancel
              </T>
            </Pressable>
          </Card>
        ) : (
          <Button title="Report this product" icon="flag-outline" variant="ghost" onPress={() => setReporting(true)} />
        )
      ) : null}
    </>
  );
}

/** Product page for members: photos, member price per unit, shop, stock, delivery / pickup and Buy. */
export default function ProductScreen() {
  const { id } = useLocalSearchParams();
  const item = useApi(`/products/${id}`);
  return (
    <Screen header={<DetailHeader title="Product details" fallback="/market?tab=products" />} refreshing={item.refreshing} onRefresh={item.refresh}>
      <AsyncView state={item} skeleton={<LoadingList rows={2} card={200} />}>
        {(d) => <ProductDetail item={d} />}
      </AsyncView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  noPhoto: { borderRadius: 16, backgroundColor: colors.goldLight, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.inputBorder },
  dotOn: { width: 16, backgroundColor: colors.gold },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.goldLight, borderWidth: 1, borderColor: colors.gold, borderRadius: 14, padding: 12 },
  reason: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.divider },
});
