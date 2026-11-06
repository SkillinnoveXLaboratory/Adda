import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { money, titleCase } from '../lib/format';
import { colors, shadow } from '../theme';
import { Badge, T } from './ui';

function ModerationBadges({ item }) {
  return (
    <>
      {item.moderationStatus && item.moderationStatus !== 'approved' ? <Badge status={item.moderationStatus} label={item.moderationStatus === 'pending' ? 'In review' : undefined} /> : null}
      {item.availability && item.availability !== 'available' ? <Badge status={item.availability} /> : null}
      {item.status && item.status !== 'active' ? <Badge status={item.status} /> : null}
    </>
  );
}

function Spec({ icon, label }) {
  return (
    <View style={styles.spec}>
      <Ionicons name={icon} size={13} color="#64748b" />
      <T size={11} color="#64748b" numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}

/** Property: photo card (prototype screen 5). Marketplace: compact row. */
export function ListingCard({ item, kind, onPress, showModeration }) {
  const photo = item.photos?.[0]?.url;
  const rent = kind === 'property' && item.listingType === 'rent';
  const price = rent ? `${money(item.pricePaise)} / mo` : money(item.pricePaise);
  const where = [item.locality, item.city].filter(Boolean).join(', ') || item.society?.name;

  if (kind === 'property') {
    const title = [item.bedrooms ? `${item.bedrooms} BHK` : null, titleCase(item.propertyType || '')].filter(Boolean).join(' ') || item.title;
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}, ${price}`} style={({ pressed }) => [styles.pcard, pressed && styles.pressed]}>
        <View style={styles.pimgWrap}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.pimg} resizeMode="cover" />
          ) : (
            <View style={[styles.pimg, styles.noPhoto]}>
              <Ionicons name="business-outline" size={34} color="#94a3b8" />
              <T size={11} color="#94a3b8">
                No photo yet
              </T>
            </View>
          )}
          <View style={[styles.tag, styles.tagTopRight, { backgroundColor: rent ? '#059669' : '#2563eb' }]}>
            <T weight="bold" size={9.5} color={colors.white} style={{ lineHeight: 13 }}>
              {rent ? 'For Rent' : 'For Sale'}
            </T>
          </View>
          {item.sponsored ? (
            <View style={[styles.tag, styles.sponsored]}>
              <T weight="bold" size={9.5} color={colors.navy} style={{ lineHeight: 13 }}>
                Sponsored
              </T>
            </View>
          ) : null}
          {item.verifiedVendor ? (
            <View style={[styles.tag, styles.verified]} accessibilityLabel="Verified vendor">
              <Ionicons name="shield-checkmark" size={11} color={colors.white} />
              <T weight="bold" size={9.5} color={colors.white} style={{ lineHeight: 13 }}>
                Verified
              </T>
            </View>
          ) : null}
        </View>
        <View style={{ padding: 12, gap: 4 }}>
          {showModeration ? (
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <ModerationBadges item={item} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T weight="bold" size={13.5} numberOfLines={1}>
                {title}
              </T>
              {title !== item.title ? (
                <T size={11.5} color={colors.muted} numberOfLines={1}>
                  {item.title}
                </T>
              ) : null}
            </View>
            <T weight="extrabold" size={13.5} color={colors.navy} style={{ flexShrink: 0 }}>
              {price}
            </T>
          </View>
          {where ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={12} color="#94a3b8" />
              <T size={11} color="#94a3b8" numberOfLines={1} style={{ flex: 1 }}>
                {where}
              </T>
            </View>
          ) : null}
          <View style={styles.specs}>
            {item.bedrooms ? <Spec icon="bed-outline" label={`${item.bedrooms} Beds`} /> : null}
            {item.bathrooms ? <Spec icon="water-outline" label={`${item.bathrooms} Baths`} /> : null}
            {item.areaSqft ? <Spec icon="resize-outline" label={`${Number(item.areaSqft).toLocaleString('en-IN')} sq ft`} /> : null}
            {!item.bedrooms && !item.bathrooms && !item.areaSqft ? <Spec icon="home-outline" label={titleCase(item.propertyType || 'Property')} /> : null}
          </View>
        </View>
      </Pressable>
    );
  }

  const tag = item.category?.name || 'Item';
  const sub = [titleCase(item.condition || ''), item.negotiable ? 'Negotiable' : null].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.title}, ${price}`} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.img} />
      ) : (
        <View style={[styles.img, styles.noPhoto]}>
          <Ionicons name="cube-outline" size={28} color="#94a3b8" />
        </View>
      )}
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Badge label={tag} tone="info" />
          {showModeration ? <ModerationBadges item={item} /> : null}
        </View>
        <T weight="bold" size={13.5} numberOfLines={2}>
          {item.title}
        </T>
        <T weight="extrabold" size={13.5} color={colors.navy}>
          {price}
        </T>
        {sub ? (
          <T size={11.5} color={colors.muted} numberOfLines={1}>
            {sub}
          </T>
        ) : null}
        {where ? (
          <T size={11} color="#94a3b8" numberOfLines={1}>
            {where}
          </T>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={17} color="#94a3b8" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pcard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden', ...shadow.card },
  pimgWrap: { height: 132, backgroundColor: '#e2e8f0' },
  pimg: { width: '100%', height: '100%' },
  noPhoto: { alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#f1f5f9' },
  // Each tag owns one corner (setting an offset to undefined does not clear it in a style array).
  tag: { position: 'absolute', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tagTopRight: { top: 8, right: 8 },
  sponsored: { top: 8, left: 8, backgroundColor: colors.gold },
  verified: { bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(7,22,44,0.85)' },
  specs: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8, marginTop: 4 },
  spec: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 16, padding: 10, ...shadow.card },
  img: { width: 88, height: 84, borderRadius: 12, backgroundColor: '#f1f5f9' },
  pressed: { borderColor: colors.gold, opacity: 0.95 },
});
