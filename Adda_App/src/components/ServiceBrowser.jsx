import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LocationPicker } from './LocationPicker';
import { OfferCard } from './OfferCard';
import { Button, Chips, EmptyState, ErrorState, LoadingList, Screen, SearchBar, T } from './ui';
import { useApi } from '../hooks/useApi';
import { currentPosition, placeName } from '../lib/location';
import { colors } from '../theme';

/** Quick radius picks (skills/location-maps); "Custom" takes any whole number 1–100. */
export const RADIUS_PICKS = [2, 5, 10, 25, 50];
const nextRadius = (r) => RADIUS_PICKS.find((x) => x > r) || (r < 100 ? 100 : null);

/**
 * Vendor services for members: search, category chips and "Near me" (the member's GPS position, or a place they
 * search for — the server does not share a society's location with members) + radius → nearest first with
 * "x.x km away". `top` renders above the search (e.g. the Marketplace Services / Properties switch).
 */
export function ServiceBrowser({ header, top, initialQ = '', initialCategory = '', initialNear = false }) {
  const [q, setQ] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ.trim());
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [near, setNear] = useState(initialNear);
  const [radius, setRadius] = useState(10);
  const [custom, setCustom] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customError, setCustomError] = useState(null);
  const [where, setWhere] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const locate = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const p = await currentPosition();
      setWhere({ ...p, label: 'Your current location' });
      setPicking(false);
      const name = await placeName(p.lat, p.lng);
      if (name) setWhere({ ...p, label: name });
    } catch (err) {
      setLocError(err.message);
      setPicking(true);
    } finally {
      setLocating(false);
    }
  };

  // Turning "Near me" on for the first time asks for the device position.
  const toggleNear = () => {
    const on = !near;
    setNear(on);
    if (on && !where && !locating) locate();
  };

  const applyCustom = (text) => {
    setCustomText(text);
    const n = Number(text);
    if (!text) return setCustomError(null);
    if (!Number.isInteger(n) || n < 1 || n > 100) return setCustomError('Enter whole kilometres from 1 to 100');
    setCustomError(null);
    setRadius(n);
  };

  const cats = useApi('/service-offers/categories', { refetchOnFocus: false });
  const nearQuery = near && where ? { lat: where.lat, lng: where.lng, radiusKm: radius, sort: 'nearest' } : {};
  const list = useApi(near && !where ? null : '/service-offers', { query: { q: debounced, categoryId, limit: 50, ...nearQuery } });
  const sponsored = near ? 0 : list.data?.sponsoredCount || 0;
  const bigger = nextRadius(radius);

  return (
    <Screen header={header} refreshing={list.refreshing} onRefresh={list.refresh}>
      {top}
      <SearchBar value={q} onChangeText={setQ} placeholder="Search plumber, electrician, cleaning…" />
      {cats.data?.items?.length ? <Chips options={[{ value: '', label: 'All' }, ...cats.data.items.map((c) => ({ value: c._id, label: c.name }))]} value={categoryId} onChange={setCategoryId} /> : null}

      <View style={[styles.nearBox, near && styles.nearBoxOn]} testID="near-me">
        <Pressable onPress={toggleNear} accessibilityRole="switch" accessibilityState={{ checked: near }} accessibilityLabel="Near me" style={styles.nearHead} testID="near-me-toggle">
          <View style={[styles.nearIcon, near && { backgroundColor: colors.navy }]}>
            <Ionicons name="navigate" size={16} color={near ? colors.gold : colors.goldDark} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="bold" size={13.5} color={colors.navy}>
              Near me
            </T>
            <T size={11.5} color={colors.muted} numberOfLines={1}>
              {near ? (where ? `Within ${radius} km of ${where.label || 'the chosen place'}` : locating ? 'Finding your location…' : 'Choose a location') : 'Show services closest to you first'}
            </T>
          </View>
          <View style={[styles.switch, near && styles.switchOn]}>
            <View style={[styles.knob, near && styles.knobOn]} />
          </View>
        </Pressable>

        {near ? (
          <View style={{ gap: 10 }}>
            <View style={styles.chips} accessibilityLabel="Distance">
              {RADIUS_PICKS.map((r) => {
                const on = !custom && r === radius;
                return (
                  <Pressable key={r} onPress={() => (setCustom(false), setCustomError(null), setRadius(r))} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${r} kilometres`} style={[styles.chip, on && styles.chipOn]} testID={`radius-${r}`}>
                    <T weight="bold" size={12.5} color={on ? colors.white : colors.chipText}>
                      {r} km
                    </T>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => setCustom(true)} accessibilityRole="button" accessibilityState={{ selected: custom }} accessibilityLabel="Custom distance" style={[styles.chip, custom && styles.chipOn]} testID="radius-custom">
                <T weight="bold" size={12.5} color={custom ? colors.white : colors.chipText}>
                  Custom
                </T>
              </Pressable>
            </View>
            {custom ? (
              <View style={{ gap: 4 }}>
                <View style={[styles.customRow, customError && { borderColor: colors.danger }]}>
                  <TextInput
                    value={customText}
                    onChangeText={(v) => applyCustom(v.replace(/[^\d]/g, '').slice(0, 3))}
                    keyboardType="number-pad"
                    placeholder="1–100"
                    placeholderTextColor={colors.subtle}
                    maxLength={3}
                    maxFontSizeMultiplier={1.3}
                    accessibilityLabel="Distance in kilometres, 1 to 100"
                    testID="radius-custom-input"
                    style={styles.customInput}
                  />
                  <T weight="semibold" size={13} color={colors.muted}>
                    km
                  </T>
                </View>
                {customError ? (
                  <T size={11.5} color={colors.danger}>
                    {customError}
                  </T>
                ) : null}
              </View>
            ) : null}

            {where && !picking ? (
              <View style={styles.whereRow}>
                <Ionicons name="pin" size={15} color={colors.goldDark} />
                <T size={12} color={colors.textSoft} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                  {where.label || 'Chosen place'}
                </T>
                <Pressable onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel="Change location" hitSlop={6} style={styles.change}>
                  <T weight="bold" size={12} color={colors.link}>
                    Change
                  </T>
                </Pressable>
              </View>
            ) : null}
            {locError && picking ? (
              <T size={12} color={colors.amber} style={{ lineHeight: 17 }}>
                {locError}
              </T>
            ) : null}
            {picking || (!where && !locating) ? (
              <LocationPicker
                label={null}
                map={false}
                clearable={false}
                value={null}
                testID="near-location"
                onChange={(loc) => {
                  if (!loc) return;
                  setWhere(loc);
                  setPicking(false);
                  setLocError(null);
                }}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {near && !where ? null : list.loading && !list.data ? (
        <LoadingList rows={4} card={96} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data.items.length ? (
        near ? (
          <EmptyState
            icon="navigate-outline"
            title={`No services within ${radius} km — try a bigger radius`}
            message="Only vendors who added their shop location show up in Near me."
            action={bigger ? `Search within ${bigger} km` : undefined}
            onAction={bigger ? () => (setCustom(false), setRadius(bigger)) : undefined}
          />
        ) : (
          <EmptyState icon="construct-outline" title={debounced || categoryId ? 'No matching services' : 'No services listed yet'} message="Verified vendors will appear here once their services are approved." />
        )
      ) : (
        <View style={{ gap: 10 }}>
          <T size={12} color={colors.muted} testID="service-count">
            {list.data.total + sponsored} service{list.data.total + sponsored === 1 ? '' : 's'}
            {near ? ` within ${radius} km · nearest first` : sponsored ? ` · ${sponsored} sponsored` : ''}
          </T>
          {list.data.items.map((o) => (
            <OfferCard key={o._id} item={o} onPress={() => router.push(`/offers/${o._id}`)} />
          ))}
        </View>
      )}
      {near && where && list.data?.items?.length && bigger ? <Button title={`Search wider (${bigger} km)`} variant="alt" icon="expand-outline" onPress={() => (setCustom(false), setRadius(bigger))} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nearBox: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  nearBoxOn: { borderColor: colors.gold },
  nearHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  nearIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.goldLight, alignItems: 'center', justifyContent: 'center' },
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#cbd5e1', padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: colors.gold },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white },
  knobOn: { alignSelf: 'flex-end', backgroundColor: colors.navy },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 36, borderRadius: 999, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.navy },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, alignSelf: 'flex-start', minWidth: 140 },
  customInput: { flex: 1, minWidth: 0, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: colors.text, paddingVertical: 8 },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.goldLight, borderRadius: 10, paddingLeft: 10 },
  change: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
});
