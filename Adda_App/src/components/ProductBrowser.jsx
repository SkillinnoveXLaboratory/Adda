import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CategoryIcon } from './CategoryIcon';
import { NearMeBox, useNearMe } from './NearMe';
import { distanceText, ShopBadge } from './OfferCard';
import { Badge, Button, Chips, EmptyState, ErrorState, Screen, SearchBar, Skeleton, T } from './ui';
import { useApi } from '../hooks/useApi';
import { money } from '../lib/format';
import { colors, shadow } from '../theme';

/** Few enough left to say so on the card / product page. */
export const LOW_STOCK = 10;

/** "Out of stock" / "Only 3 left" / null. */
export function stockText(p) {
  if (!p.inStock || !(p.stock > 0)) return 'Out of stock';
  if (p.stock <= LOW_STOCK) return `Only ${p.stock} left`;
  return null;
}

/** A product in the members' grid: photo, title, unit, member price, discount hint, shop, stock. Never vendor price. */
export function ProductCard({ item, onPress }) {
  const photo = item.photos?.[0]?.url;
  const pr = item.pricing || {};
  const stock = stockText(item);
  const out = !item.inStock || !(item.stock > 0);
  const price = pr.memberPricePaise ?? item.pricePaise;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}, ${money(price)}${item.unit ? ` per ${item.unit}` : ''}${stock ? `, ${stock}` : ''}`} style={({ pressed }) => [styles.card, pressed && styles.pressed]} testID="product-card">
      <View style={styles.photoBox}>
        {photo ? (
          <Image source={{ uri: photo }} style={[styles.photo, out && { opacity: 0.55 }]} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.photo, styles.noPhoto]}>
            <CategoryIcon icon={item.category?.icon} name={item.category?.name} size={40} />
          </View>
        )}
        {stock ? <Badge tone={out ? 'danger' : 'warning'} label={stock} style={styles.stockBadge} /> : null}
      </View>
      <View style={{ padding: 10, gap: 3, flex: 1 }}>
        <T weight="bold" size={13} color={colors.navy} numberOfLines={2} style={{ lineHeight: 17 }}>
          {item.title}
        </T>
        {item.unit ? (
          <T size={11} color={colors.muted} numberOfLines={1}>
            {item.unit}
          </T>
        ) : null}
        <T weight="extrabold" size={14} color={colors.navy} testID="product-price">
          {money(price)}
        </T>
        {pr.discountAvailable && pr.discountPaise > 0 ? (
          <View style={styles.saveRow}>
            <Ionicons name="pricetag" size={11} color={colors.green} />
            <T weight="bold" size={10.5} color={colors.green} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
              Save {money(pr.discountPaise)} with NIVASA
            </T>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <ShopBadge shop={item.shop} size={18} />
        {item.distanceKm != null ? (
          <T weight="bold" size={10.5} color={colors.goldText} testID="product-distance">
            {distanceText(item.distanceKm)}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

const pairs = (items) => items.reduce((rows, it, i) => (i % 2 ? rows[rows.length - 1].push(it) : rows.push([it]), rows), []);

function GridSkeleton() {
  return (
    <View style={{ gap: 10 }} accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      {[0, 1].map((r) => (
        <View key={r} style={styles.row}>
          <Skeleton height={230} radius={16} style={{ flex: 1 }} />
          <Skeleton height={230} radius={16} style={{ flex: 1 }} />
        </View>
      ))}
    </View>
  );
}

/**
 * Marketplace → Products (members): search, admin-managed product categories ("All" first), in-stock filter and
 * Near me (shop location) → 2-column grid. Tapping a product opens its page with Buy.
 */
export function ProductBrowser({ header, top }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [inStock, setInStock] = useState(false);
  const nm = useNearMe(false);
  const { near, radius, bigger } = nm;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const cats = useApi('/products/categories', { refetchOnFocus: false });
  const list = useApi(nm.waiting ? null : '/products', { query: { q: debounced, categoryId, inStock: inStock ? 'true' : undefined, limit: 50, ...nm.query } });
  const filtered = !!(debounced || categoryId || inStock);

  return (
    <Screen header={header} refreshing={list.refreshing} onRefresh={list.refresh}>
      {top}
      <SearchBar value={q} onChangeText={setQ} placeholder="Search groceries, home needs, gifts…" />
      {cats.data?.items?.length ? <Chips options={[{ value: '', label: 'All' }, ...cats.data.items.map((c) => ({ value: c._id, label: c.name }))]} value={categoryId} onChange={setCategoryId} /> : null}
      <Chips options={[{ value: false, label: 'All products' }, { value: true, label: 'In stock only' }]} value={inStock} onChange={setInStock} />

      <NearMeBox nm={nm} offText="Show shops closest to you first" />

      {nm.waiting ? null : list.loading && !list.data ? (
        <GridSkeleton />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data.items.length ? (
        near ? (
          <EmptyState
            icon="navigate-outline"
            title={`No products within ${radius} km — try a bigger radius`}
            message="Only shops that added their location show up in Near me."
            action={bigger ? `Search within ${bigger} km` : undefined}
            onAction={bigger ? () => nm.pickRadius(bigger) : undefined}
          />
        ) : filtered ? (
          <EmptyState icon="search-outline" title="No matching products" message="Try another word or category, or include items that are out of stock." action="Clear filters" onAction={() => (setQ(''), setCategoryId(''), setInStock(false))} />
        ) : (
          <EmptyState icon="cube-outline" title="No products yet" message="Verified shops will appear here once their products are approved." />
        )
      ) : (
        <View style={{ gap: 10 }}>
          <T size={12} color={colors.muted} testID="product-count">
            {list.data.total ?? list.data.items.length} product{(list.data.total ?? list.data.items.length) === 1 ? '' : 's'}
            {near ? ` within ${radius} km · nearest first` : ''}
          </T>
          {pairs(list.data.items).map((row) => (
            <View key={row[0]._id} style={styles.row}>
              {row.map((p) => (
                <ProductCard key={p._id} item={p} onPress={() => router.push(`/market/product/${p._id}`)} />
              ))}
              {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </View>
      )}
      {near && nm.where && list.data?.items?.length && bigger ? <Button title={`Search wider (${bigger} km)`} variant="alt" icon="expand-outline" onPress={() => nm.pickRadius(bigger)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  card: { flex: 1, minWidth: 0, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.card },
  pressed: { borderColor: colors.gold, opacity: 0.95 },
  photoBox: { position: 'relative' },
  photo: { width: '100%', height: 120, backgroundColor: colors.divider },
  noPhoto: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldLight },
  stockBadge: { position: 'absolute', left: 8, top: 8 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
