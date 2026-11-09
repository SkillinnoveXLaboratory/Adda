import { useState } from 'react';
import { Dimensions, Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { confirm } from '../lib/dialog';
import { formatDate, money, titleCase } from '../lib/format';
import { useToast } from '../context/toast';
import { colors } from '../theme';
import { Badge, Button, Card, Hint, KeyValue, T, useGoBack } from './ui';

const REASONS = ['Fraud or scam', 'Wrong information', 'Already sold / rented', 'Inappropriate content'];

/** Shared detail view for property and marketplace listings. */
export function ListingDetailView({ item, kind, onChanged }) {
  const toast = useToast();
  const [reporting, setReporting] = useState(false);
  const width = Dimensions.get('window').width - 32;
  const base = kind === 'property' ? '/properties' : '/marketplace';
  const back = useGoBack(base);
  const price = kind === 'property' && item.listingType === 'rent' ? `${money(item.pricePaise)} / month` : money(item.pricePaise);

  const call = () => Linking.openURL(`tel:+91${item.contactPhone}`).catch(() => toast.error('Calling is not available on this device'));
  const whatsapp = () => {
    const text = encodeURIComponent(`Hi, I'm interested in your listing "${item.title}" on NIVASA.`);
    Linking.openURL(`https://wa.me/91${item.contactPhone}?text=${text}`).catch(() => toast.error('Could not open WhatsApp'));
  };

  const report = async (reason) => {
    try {
      const r = await api(`${base}/${item._id}/report`, { method: 'POST', body: { reason } });
      toast.success(r.message || 'Reported');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReporting(false);
    }
  };

  const setAvailability = async (value) => {
    try {
      await api(`${base}/${item._id}`, { method: 'PATCH', body: kind === 'property' ? { availability: value } : { status: value } });
      toast.success('Listing updated');
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Delete listing?', message: 'It will be removed from the marketplace.', confirmText: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await api(`${base}/${item._id}`, { method: 'DELETE' });
      toast.success('Listing deleted');
      back();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      {item.photos?.length ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ borderRadius: 18 }}>
          {item.photos.map((p) => (
            <Image key={p._id} source={{ uri: p.url }} style={{ width, height: 220, borderRadius: 18, backgroundColor: '#f1f5f9' }} />
          ))}
        </ScrollView>
      ) : (
        <View style={{ height: 160, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={kind === 'property' ? 'business-outline' : 'cube-outline'} size={56} color="#94a3b8" />
        </View>
      )}
      {item.photos?.length > 1 ? (
        <T size={12} color={colors.muted} style={{ textAlign: 'center', marginTop: -6 }}>
          Swipe for {item.photos.length} photos
        </T>
      ) : null}

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {item.sponsored ? <Badge label="Sponsored" tone="warning" /> : null}
          <Badge label={kind === 'property' ? (item.listingType === 'rent' ? 'For rent' : 'For sale') : item.category?.name} tone="info" />
          {item.verifiedVendor ? <Badge label="Verified vendor" tone="success" /> : null}
          {item.mine && item.moderationStatus !== 'approved' ? <Badge status={item.moderationStatus} label={item.moderationStatus === 'pending' ? 'In review' : undefined} /> : null}
          {kind === 'property' && item.availability !== 'available' ? <Badge status={item.availability} /> : null}
          {kind === 'marketplace' && item.status !== 'active' ? <Badge status={item.status} /> : null}
        </View>
        <T weight="extrabold" size={22} style={{ lineHeight: 29 }}>
          {item.title}
        </T>
        <T weight="extrabold" size={20} color="#b38a2e">
          {price}
          {kind === 'marketplace' && item.negotiable ? (
            <T size={13} color={colors.muted}>
              {'  '}Negotiable
            </T>
          ) : null}
        </T>
        <T size={13} color={colors.muted}>
          {[item.locality, item.city].filter(Boolean).join(', ')}
          {item.society?.name ? ` · ${item.society.name}` : ''}
        </T>
      </View>

      {item.mine && item.moderationStatus === 'pending' ? <Hint tone="amber" icon="hourglass-outline">Your listing is being reviewed by moderators. It becomes visible to others once approved.</Hint> : null}
      {item.mine && item.moderationStatus === 'rejected' ? <Hint tone="coral" icon="close-circle-outline">{`Not approved${item.moderationNote ? `: ${item.moderationNote}` : ''}.${kind === 'marketplace' ? ' Edit it to resubmit.' : ''}`}</Hint> : null}

      <Card>
        {kind === 'property' ? (
          <>
            <KeyValue label="Type" value={titleCase(item.propertyType)} />
            {item.bedrooms !== undefined && item.bedrooms !== null ? <KeyValue label="Bedrooms" value={String(item.bedrooms)} /> : null}
            {item.bathrooms !== undefined && item.bathrooms !== null ? <KeyValue label="Bathrooms" value={String(item.bathrooms)} /> : null}
            {item.areaSqft ? <KeyValue label="Area" value={`${item.areaSqft} sq ft`} /> : null}
            {item.furnishing ? <KeyValue label="Furnishing" value={titleCase(item.furnishing)} /> : null}
            {item.amenities?.length ? <KeyValue label="Amenities" value={item.amenities.join(', ')} /> : null}
          </>
        ) : (
          <>
            <KeyValue label="Condition" value={titleCase(item.condition)} />
            <KeyValue label="Category" value={item.category?.name} />
          </>
        )}
        <KeyValue label="Listed on" value={formatDate(item.createdAt)} />
      </Card>

      {item.description ? (
        <Card>
          <T weight="bold" size={14} style={{ marginBottom: 6 }}>
            Description
          </T>
          <T size={14} color="#334155" style={{ lineHeight: 22 }}>
            {item.description}
          </T>
        </Card>
      ) : null}

      {item.mine ? (
        <View style={{ gap: 10 }}>
          {/* Members edit their marketplace items; property listings are managed by vendors on the Vendor Panel. */}
          {kind === 'marketplace' ? <Button title="Edit listing" icon="create-outline" onPress={() => router.push({ pathname: '/marketplace/edit', params: { id: item._id } })} /> : null}
          {kind === 'property' ? (
            item.availability === 'available' ? (
              <Button title={item.listingType === 'rent' ? 'Mark as rented' : 'Mark as sold'} variant="alt" onPress={() => setAvailability(item.listingType === 'rent' ? 'rented' : 'sold')} />
            ) : (
              <Button title="Mark as available again" variant="alt" onPress={() => setAvailability('available')} />
            )
          ) : item.status === 'active' ? (
            <Button title="Mark as sold" variant="alt" onPress={() => setAvailability('sold')} />
          ) : (
            <Button title="Mark as available again" variant="alt" onPress={() => setAvailability('active')} />
          )}
          <Button title="Delete listing" variant="danger" onPress={remove} />
        </View>
      ) : (
        <>
          <Card style={{ gap: 10 }}>
            <T weight="bold" size={14}>
              Contact {item.contactName || item.postedBy || 'the owner'}
            </T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Call" icon="call" onPress={call} style={{ flex: 1 }} />
              {item.whatsappAvailable ? <Button title="WhatsApp" icon="logo-whatsapp" variant="alt" onPress={whatsapp} style={{ flex: 1 }} /> : null}
            </View>
            <T size={12} color={colors.muted}>
              Never pay advances before visiting. NIVASA does not handle property sale agreements or payments.
            </T>
          </Card>
          {reporting ? (
            <Card style={{ gap: 4 }}>
              <T weight="bold" size={14}>
                Why are you reporting this listing?
              </T>
              {REASONS.map((r) => (
                <Pressable key={r} onPress={() => report(r)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider }} accessibilityRole="button">
                  <T size={14}>{r}</T>
                </Pressable>
              ))}
              <Pressable onPress={() => setReporting(false)} style={{ paddingVertical: 8 }} accessibilityRole="button">
                <T weight="bold" size={14} color={colors.muted}>
                  Cancel
                </T>
              </Pressable>
            </Card>
          ) : (
            <Button title="Report this listing" icon="flag-outline" variant="ghost" onPress={() => setReporting(true)} />
          )}
        </>
      )}
    </>
  );
}
