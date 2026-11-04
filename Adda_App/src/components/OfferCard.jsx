import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offerPrice } from '../lib/format';
import { colors, shadow } from '../theme';
import { Badge, T } from './ui';

/** Category name → Ionicon, same mapping idea as the Services tab. */
export const SERVICE_ICONS = {
  Plumber: 'water-outline',
  Plumbing: 'water-outline',
  Electrician: 'flash-outline',
  Electrical: 'flash-outline',
  Carpenter: 'hammer-outline',
  Carpentry: 'hammer-outline',
  Housekeeping: 'sparkles-outline',
  Cleaning: 'sparkles-outline',
  'Pest Control': 'bug-outline',
  'Appliance Repair': 'snow-outline',
  Painting: 'color-palette-outline',
  Gardening: 'leaf-outline',
};

/** A provider's service in a list (prototype "Popular Services" card): text left, photo / icon right. */
export function OfferCard({ item, onPress, showModeration }) {
  const photo = item.photos?.[0]?.url;
  const where = [item.serviceArea, item.city].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}, ${offerPrice(item)}`} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {item.category?.name ? <Badge label={item.category.name} tone="info" /> : null}
          {item.visibility === 'society' ? <Badge label="My society" tone="neutral" /> : null}
          {showModeration && item.moderationStatus !== 'approved' ? <Badge status={item.moderationStatus} label={item.moderationStatus === 'pending' ? 'In review' : undefined} /> : null}
          {showModeration && item.status === 'paused' ? <Badge label="Paused" tone="neutral" /> : null}
        </View>
        <T weight="bold" size={13.5} numberOfLines={2}>
          {item.title}
        </T>
        <T weight="extrabold" size={13} color={colors.navy}>
          {offerPrice(item)}
        </T>
        <T size={11} color={colors.muted} numberOfLines={1}>
          {[item.contactName || item.postedBy, item.experienceYears ? `${item.experienceYears} yrs exp.` : null].filter(Boolean).join(' · ')}
        </T>
        {where ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="location-outline" size={12} color="#94a3b8" />
            <T size={11} color="#94a3b8" numberOfLines={1} style={{ flex: 1 }}>
              {where}
            </T>
          </View>
        ) : null}
      </View>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.noThumb]}>
          <Ionicons name={SERVICE_ICONS[item.category?.name] || 'construct-outline'} size={26} color={colors.goldDark} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9', padding: 12, ...shadow.card },
  pressed: { borderColor: colors.gold, opacity: 0.95 },
  thumb: { width: 68, height: 68, borderRadius: 12, backgroundColor: '#f1f5f9' },
  noThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldLight },
});
