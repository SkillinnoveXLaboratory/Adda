import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { coordsText, currentPosition, placeName, round6, searchPlaces } from '../lib/location';
import { colors } from '../theme';
import { LocationMap } from './LocationMap';
import { T } from './Text';
import { Button } from './ui';

/**
 * Location picker (skills/location-maps): "Use my location" (expo-location, foreground only), address search through
 * the server's geocode proxy (debounced 400 ms, ≥ 3 characters), and a Leaflet map with a draggable pin (native app;
 * the web build shows search + coordinates only). Value: { lat, lng, label? } | null.
 * `map={false}` hides the map (near-me search only needs the point).
 */
export function LocationPicker({ value, onChange, label = 'Location', hint, map = true, clearable = true, testID = 'location-picker' }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState(null);
  const [locating, setLocating] = useState(false);
  const seq = useRef(0);

  // Debounced search; only the newest answer is used.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) return undefined;
    const id = ++seq.current;
    const t = setTimeout(() => {
      searchPlaces(term).then(
        (items) => {
          if (id !== seq.current) return;
          setResults(items);
          setMessage(items.length ? null : { tone: 'muted', text: 'No places found. Try a nearby landmark, area or PIN code.' });
          setSearching(false);
        },
        (err) => {
          if (id !== seq.current) return;
          setResults([]);
          setSearching(false);
          setMessage({ tone: 'warn', text: err.code === 'GEOCODER_UNAVAILABLE' ? `${err.message || 'Address search is unavailable right now.'} Use your location${map ? ' or the map' : ''} instead.` : err.message });
        },
      );
    }, 400);
    return () => clearTimeout(t);
  }, [q, map]);

  const pick = (item) => {
    seq.current += 1; // drop any search still running
    setResults([]);
    setQ('');
    setMessage(null);
    onChange({ lat: round6(item.lat), lng: round6(item.lng), label: item.label?.slice(0, 200) });
  };

  const useMine = async () => {
    setLocating(true);
    setMessage(null);
    try {
      const p = await currentPosition();
      onChange({ ...p, label: 'Current location' });
      const name = await placeName(p.lat, p.lng);
      if (name) onChange({ ...p, label: name.slice(0, 200) });
    } catch (err) {
      setMessage({ tone: 'warn', text: err.message });
    } finally {
      setLocating(false);
    }
  };

  // A pin moved on the map: keep the point now, then look up its address.
  const onPin = async (p) => {
    const point = { lat: round6(p.lat), lng: round6(p.lng) };
    onChange({ ...point, label: 'Pinned on the map' });
    const name = await placeName(point.lat, point.lng);
    if (name) onChange({ ...point, label: name.slice(0, 200) });
  };

  return (
    <View style={{ gap: 10 }} testID={testID}>
      {label ? (
        <T weight="bold" size={12.5} color={colors.text}>
          {label}
        </T>
      ) : null}
      {hint ? (
        <T size={12} color={colors.muted} style={{ lineHeight: 17, marginTop: -4 }}>
          {hint}
        </T>
      ) : null}

      <Button title={locating ? 'Finding you…' : 'Use my location'} icon="locate" variant="alt" loading={locating} onPress={useMine} accessibilityLabel="Use my current location" />

      <View style={styles.search}>
        <Ionicons name="search" size={17} color={colors.subtle} />
        <TextInput
          value={q}
          onChangeText={(v) => {
            setQ(v);
            setMessage(null);
            const long = v.trim().length >= 3;
            setSearching(long);
            if (!long) {
              seq.current += 1;
              setResults([]);
            }
          }}
          placeholder="Search address, area or landmark"
          placeholderTextColor={colors.subtle}
          maxLength={120}
          maxFontSizeMultiplier={1.3}
          returnKeyType="search"
          accessibilityLabel="Search address, area or landmark"
          testID={`${testID}-search`}
          style={styles.input}
        />
        {searching ? <ActivityIndicator size="small" color={colors.gold} /> : null}
      </View>

      {results.length ? (
        <View style={styles.results}>
          {results.map((r, i) => (
            <Pressable key={`${r.lat},${r.lng},${i}`} onPress={() => pick(r)} accessibilityRole="button" accessibilityLabel={`Use ${r.label}`} style={({ pressed }) => [styles.result, i > 0 && styles.resultLine, pressed && { backgroundColor: colors.goldLight }]}>
              <Ionicons name="location-outline" size={16} color={colors.goldDark} style={{ marginTop: 2 }} />
              <T size={12.5} color={colors.textSoft} numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>
                {r.label}
              </T>
            </Pressable>
          ))}
          <T size={10} color={colors.subtle} style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
            Address search © OpenStreetMap contributors
          </T>
        </View>
      ) : null}

      {message ? (
        <T size={12} color={message.tone === 'warn' ? colors.amber : colors.muted} style={{ lineHeight: 17 }} accessibilityRole="alert">
          {message.text}
        </T>
      ) : null}

      {map ? <LocationMap value={value} onPick={onPin} /> : null}

      {value ? (
        <View style={styles.chosen} testID={`${testID}-value`}>
          <Ionicons name="pin" size={18} color={colors.goldDark} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <T weight="bold" size={12.5} color={colors.navy} numberOfLines={2}>
              {value.label || 'Selected point'}
            </T>
            <T size={11} color={colors.muted}>
              {coordsText(value)}
            </T>
          </View>
          {clearable ? (
            <Pressable onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel="Clear location" hitSlop={6} style={styles.clear}>
              <T weight="bold" size={12} color={colors.danger}>
                Clear
              </T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, paddingHorizontal: 12, minHeight: 48 },
  input: { flex: 1, minWidth: 0, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13.5, color: colors.text, paddingVertical: 10 },
  results: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' },
  result: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
  resultLine: { borderTopWidth: 1, borderTopColor: colors.divider },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.goldLight, borderRadius: 12, padding: 10 },
  clear: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
});
