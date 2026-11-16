import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { T } from './Text';

/**
 * Web build (QA / preview): the native map runs in a WebView, which the browser build does not have.
 * Show an honest placeholder; search and "Use my location" still set the point.
 */
export function LocationMap({ value, height = 120 }) {
  return (
    <View style={[styles.box, { minHeight: height }]} testID="location-map-fallback">
      <Ionicons name="map-outline" size={26} color={colors.muted} />
      <T size={12} color={colors.muted} style={{ textAlign: 'center', lineHeight: 17 }}>
        {value ? 'The map with a movable pin opens in the NIVASA app.' : 'Search for the address or use your location. In the app you can also drop a pin on the map.'}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14 },
});
