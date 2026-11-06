import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CategoryIcon } from './CategoryIcon';
import { offerPrice } from '../lib/format';
import { colors, shadow } from '../theme';
import { Badge, T } from './ui';

/** A provider's service in a list (prototype "Popular Services" card): text left, photo / icon right. */
export function OfferCard({ item, onPress, showModeration }) {
  const photo = item.photos?.[0]?.url;
  const where = [item.serviceArea, item.city].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}, ${offerPrice(item)}`} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {item.sponsored ? <Badge label="Sponsored" tone="warning" /> : null}
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
          <CategoryIcon icon={item.category?.icon} name={item.category?.name} size={34} />
        </View>
      )}
    </Pressable>
  );
}

/** Template "Popular Services" card: navy icon box, title, price, gold Book Now pill, photo on the right. */
export function PopularServiceCard({ item, onPress, onBook }) {
  const photo = item.photos?.[0]?.url;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}, ${offerPrice(item)}`} style={({ pressed }) => [styles.popular, pressed && styles.pressed]}>
      <View style={styles.popularIcon}>
        <CategoryIcon icon={item.category?.icon} name={item.category?.name} size={28} color={colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {item.sponsored ? <Badge label="Sponsored" tone="warning" style={{ alignSelf: 'flex-start' }} /> : null}
        <T weight="extrabold" size={12.5} color={colors.navy} numberOfLines={2} style={{ lineHeight: 16 }}>
          {item.title}
        </T>
        <T weight="semibold" size={11} color="#94a3b8" numberOfLines={1}>
          {offerPrice(item)}
        </T>
        {onBook ? (
          <Pressable onPress={onBook} accessibilityRole="button" accessibilityLabel={`Book ${item.title}`} hitSlop={6} style={({ pressed }) => [styles.bookBtn, pressed && { backgroundColor: colors.goldDark }]}>
            <T weight="bold" size={11} color={colors.navy}>
              Book Now
            </T>
          </Pressable>
        ) : null}
      </View>
      {photo ? <Image source={{ uri: photo }} style={styles.popularPhoto} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  popular: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, ...shadow.card },
  popularIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  popularPhoto: { width: 96, height: 80, borderRadius: 12, backgroundColor: '#f1f5f9' },
  bookBtn: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: colors.gold, borderRadius: 999, paddingHorizontal: 16, minHeight: 32, justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9', padding: 12, ...shadow.card },
  pressed: { borderColor: colors.gold, opacity: 0.95 },
  thumb: { width: 68, height: 68, borderRadius: 12, backgroundColor: '#f1f5f9' },
  noThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldLight },
});
