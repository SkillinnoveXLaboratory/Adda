import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ListingCard } from './ListingCard';
import { Chips, EmptyState, ErrorState, Field, IconButton, LoadingList, PillToggle, Screen, SearchBar, T } from './ui';
import { useApi } from '../hooks/useApi';
import { toPaise } from '../lib/format';
import { colors } from '../theme';

/** Prototype screen 5: Buy / Rent. Properties are listed by KYC-verified vendors (Vendor Panel website). */
const MODES = [
  { value: 'sale', label: 'Buy' },
  { value: 'rent', label: 'Rent' },
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
 * `header` is rendered above the list.
 */
export function PropertyBrowser({ header, showFilters, setShowFilters }) {
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
  const list = useApi('/properties', { query: { q: debounced, listingType: mode, propertyType, bedrooms, city: city.trim(), maxPrice: Number(maxPrice) > 0 ? toPaise(maxPrice) : '', limit: 50 } });
  const sponsored = list.data?.sponsoredCount || 0;

  return (
    <Screen header={header} refreshing={list.refreshing} onRefresh={list.refresh}>
      <PillToggle options={MODES} value={mode} onChange={setMode} />
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
          message="Try other filters. Verified vendors list new homes here regularly."
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: 10, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12 },
});
