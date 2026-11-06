import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../theme';
import { T } from './Text';
import { NIcon } from './NivasaIcons';

const TONES = { blue: colors.tileBlue, amber: colors.tileAmber, green: colors.tileGreen, purple: colors.tilePurple, rose: colors.tileRose, slate: colors.tileSlate, gold: [colors.goldLight, colors.goldDark] };

/**
 * Large module card (template home 2×2 grid). `nicon` = two-tone template icon (NivasaIcons); otherwise an Ionicon on a pastel tile.
 */
export function ModuleCard({ icon, nicon, label, caption, tone = 'blue', onPress, testID }) {
  const [bg, fg] = TONES[tone] || TONES.blue;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={caption ? `${label}, ${caption}` : label} testID={testID} style={({ pressed }) => [styles.module, pressed && styles.pressed]}>
      {nicon ? (
        <View style={styles.niconBox}>
          <NIcon name={nicon} size={40} />
        </View>
      ) : (
        <View style={[styles.moduleIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={21} color={fg} />
        </View>
      )}
      <T weight="bold" size={12} color={colors.navy} style={{ textAlign: 'center', lineHeight: 15 }} numberOfLines={2}>
        {label}
      </T>
      {caption ? (
        <T weight="medium" size={10} color="#94a3b8" style={{ textAlign: 'center' }} numberOfLines={1}>
          {caption}
        </T>
      ) : null}
    </Pressable>
  );
}

/** Compact tile (template 3×3 society / maintenance grid): icon over a short label. `nicon` as in ModuleCard. */
export function GridTile({ icon, nicon, label, tone = 'slate', onPress, badge, testID }) {
  const [bg, fg] = TONES[tone] || TONES.slate;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge}` : label} testID={testID} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      {nicon ? (
        <View style={styles.tileNicon}>
          <NIcon name={nicon} size={32} />
        </View>
      ) : (
        <View style={[styles.tileIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={19} color={fg} />
        </View>
      )}
      <View style={{ height: 28, justifyContent: 'center', alignSelf: 'stretch' }}>
        <T weight="bold" size={11} color={colors.navy} style={{ textAlign: 'center', lineHeight: 14 }} numberOfLines={2}>
          {label}
        </T>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <T weight="bold" size={9} color={colors.white} style={{ lineHeight: 12 }}>
            {badge}
          </T>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Wraps tiles in an even grid (`columns` per row, 10 px gaps). */
export function TileGrid({ columns = 3, children }) {
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={styles.grid}>
      {items.map((c, i) => (
        <View key={c.key ?? i} style={{ width: `${100 / columns}%`, padding: 5 }}>
          {c}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  module: { flex: 1, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center', gap: 4, minHeight: 118, justifyContent: 'center', ...shadow.card },
  niconBox: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tileNicon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  moduleIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  tile: { flex: 1, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 96, ...shadow.card },
  tileIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  pressed: { borderColor: colors.gold, transform: [{ scale: 0.98 }] },
});
