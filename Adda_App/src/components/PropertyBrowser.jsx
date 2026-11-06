import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ListingCard } from './ListingCard';
import { Button, Chips, EmptyState, ErrorState, Field, IconButton, LoadingList, PillToggle, Screen, SearchBar, T } from './ui';
import { useAuth } from '../context/auth';
import { useApi } from '../hooks/useApi';
import { toPaise } from '../lib/format';
import { colors, shadow } from '../theme';

/** Prototype screen 5: Buy / Rent / Sell. Buy = sale listings, Rent = rent listings, Sell = list your own. */
const MODES = [
  { value: 'sale', label: 'Buy' },
  { value: 'rent', label: 'Rent' },
  { value: 'sell', label: 'Sell' },
];
const KINDS = [
  { value: '', label: 'Any type' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'plot', label: 'Plot' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'room', label: 'Room' },
];
const BEDS = [
  { value: '', label: 'Any BHK' },
  { value: '1', label: '1+ BHK' },
  { value: '2', label: '2+ BHK' },
  { value: '3', label: '3+ BHK' },
];

/** Filter toggle for the header's right slot. */
export function FilterButton({ onPress, active }) {
  return <IconButton icon={active ? 'options' : 'options-outline'} label="Filters" color={active ? colors.gold : colors.white} onPress={onPress} />;
}

/**
 * Property marketplace used by the Properties tab and /properties.
 * `header` is rendered above the list; `inTab` keeps actions inline (the tab bar already owns the bottom inset).
 */
export function PropertyBrowser({ header, inTab = false, showFilters, setShowFilters }) {
  const [mode, setMode] = useState('sale');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [city, setCity] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  const { isVendor } = useAuth();
  // Only verified vendors list properties; members browse (Buy / Rent).
  const modes = isVendor ? MODES : MODES.filter((m) => m.value !== 'sell');
  const browsing = mode !== 'sell';
  const list = useApi('/properties', { query: { q: debounced, listingType: browsing ? mode : '', propertyType, bedrooms, city: city.trim(), maxPrice: Number(maxPrice) > 0 ? toPaise(maxPrice) : '', limit: 50 } });
  const sponsored = list.data?.sponsoredCount || 0;

  const actions = isVendor ? (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Button title="My listings" variant="alt" onPress={() => router.push({ pathname: '/vendor-listings', params: { tab: 'property' } })} style={{ flex: 1 }} />
      <Button title="List property" icon="add" onPress={() => router.push('/properties/edit')} style={{ flex: 1.3 }} />
    </View>
  ) : null;

  return (
    <Screen header={header} refreshing={list.refreshing} onRefresh={list.refresh} footer={inTab || !browsing || !actions ? undefined : actions}>
      <PillToggle options={modes} value={mode} onChange={setMode} />

      {browsing ? (
        <>
          <SearchBar value={q} onChangeText={setQ} placeholder="Search by location, project or property..." />
          {showFilters ? (
            <View style={styles.filters}>
              <Chips options={KINDS} value={propertyType} onChange={setPropertyType} />
              <Chips options={BEDS} value={bedrooms} onChange={setBedrooms} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="City" value={city} onChangeText={setCity} placeholder="Any" style={{ flex: 1 }} />
                <Field label="Max price (₹)" value={maxPrice} onChangeText={(v) => setMaxPrice(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder="Any" style={{ flex: 1 }} />
              </View>
              <Pressable onPress={() => setShowFilters(false)} accessibilityRole="button" style={{ alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}>
                <T weight="bold" size={12} color={colors.link}>
                  Done
                </T>
              </Pressable>
            </View>
          ) : null}
          {list.loading && !list.data ? (
            <LoadingList rows={3} card={210} />
          ) : list.error && !list.data ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : !list.data.items.length ? (
            <EmptyState
              icon="business-outline"
              title={mode === 'rent' ? 'No homes for rent yet' : 'No homes for sale yet'}
              message={isVendor ? 'Try other filters, or list a property.' : 'Try other filters. Verified vendors list new homes here regularly.'}
              action={isVendor ? 'List a property' : undefined}
              onAction={isVendor ? () => router.push('/properties/edit') : undefined}
            />
          ) : (
            <View style={{ gap: 12 }}>
              <T size={12} color={colors.muted}>
                {list.data.total + sponsored} listing{list.data.total + sponsored === 1 ? '' : 's'}
                {sponsored ? ` · ${sponsored} sponsored` : ''}
              </T>
              {list.data.items.map((p) => (
                <ListingCard key={p._id} item={p} kind="property" onPress={() => router.push(`/properties/${p._id}`)} />
              ))}
            </View>
          )}
          {inTab ? actions : null}
        </>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={[styles.sell, shadow.card]}>
            <View style={styles.sellIcon}>
              <Ionicons name="home-outline" size={24} color={colors.goldDark} />
            </View>
            <T weight="extrabold" size={16} style={{ textAlign: 'center' }}>
              Sell or rent out your property
            </T>
            <T size={12.5} color={colors.muted} style={{ textAlign: 'center', lineHeight: 18 }}>
              Add photos, price and contact details. Your listing appears here once it’s approved.
            </T>
            <Button title="List your property" icon="add" onPress={() => router.push('/properties/edit')} style={{ alignSelf: 'stretch', marginTop: 4 }} />
            <Button title="Manage my listings" variant="alt" onPress={() => router.push({ pathname: '/vendor-listings', params: { tab: 'property' } })} style={{ alignSelf: 'stretch' }} />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: 10, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12 },
  sell: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9', padding: 18, alignItems: 'center', gap: 8 },
  sellIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.goldLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
