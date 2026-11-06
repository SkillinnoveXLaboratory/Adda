import { useState } from 'react';
import { Dimensions, Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CategoryIcon } from '../../../components/CategoryIcon';
import { AsyncView, Badge, Button, Card, DetailHeader, Hint, KeyValue, LoadingList, Screen, T, useGoBack } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useToast } from '../../../context/toast';
import { useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { confirm } from '../../../lib/dialog';
import { formatDate, OFFER_PRICE_TYPES, offerPrice } from '../../../lib/format';
import { colors } from '../../../theme';

const REASONS = ['Fraud or scam', 'Phone number does not work', 'Wrong or misleading information', 'Inappropriate content'];

function OfferDetail({ item, onChanged }) {
  const toast = useToast();
  const { isVendor } = useAuth();
  // Members book; vendors only manage their own listings.
  const canBook = !isVendor && item.moderationStatus === 'approved' && item.status === 'active';
  const back = useGoBack('/offers');
  const [reporting, setReporting] = useState(false);
  const width = Dimensions.get('window').width - 32;

  const call = () => Linking.openURL(`tel:+91${item.contactPhone}`).catch(() => toast.error('Calling is not available on this device'));
  const whatsapp = () => {
    const text = encodeURIComponent(`Hi, I found your service "${item.title}" on NIVASA. Are you available?`);
    Linking.openURL(`https://wa.me/91${item.contactPhone}?text=${text}`).catch(() => toast.error('Could not open WhatsApp'));
  };
  const report = async (reason) => {
    try {
      const r = await api(`/service-offers/${item._id}/report`, { method: 'POST', body: { reason } });
      toast.success(r.message || 'Reported');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReporting(false);
    }
  };
  const setStatus = async (status) => {
    try {
      await api(`/service-offers/${item._id}`, { method: 'PATCH', body: { status } });
      toast.success(status === 'paused' ? 'Service paused — hidden until you resume it' : 'Service is visible again');
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const remove = async () => {
    const ok = await confirm({ title: 'Delete this service?', message: 'It will be removed from Local Services.', confirmText: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await api(`/service-offers/${item._id}`, { method: 'DELETE' });
      toast.success('Service deleted');
      back();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      {item.photos?.length ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ borderRadius: 16 }}>
          {item.photos.map((p) => (
            <Image key={p._id} source={{ uri: p.url }} style={{ width, height: 200, borderRadius: 16, backgroundColor: '#f1f5f9' }} />
          ))}
        </ScrollView>
      ) : (
        <View style={{ height: 120, borderRadius: 16, backgroundColor: colors.goldLight, alignItems: 'center', justifyContent: 'center' }}>
          <CategoryIcon icon={item.category?.icon} name={item.category?.name} size={60} />
        </View>
      )}

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {item.sponsored ? <Badge label="Sponsored" tone="warning" /> : null}
          {item.category?.name ? <Badge label={item.category.name} tone="info" /> : null}
          {item.verifiedVendor ? <Badge label="Verified vendor" tone="success" /> : null}
          {item.visibility === 'society' ? <Badge label="My society only" tone="neutral" /> : null}
          {item.mine && item.moderationStatus !== 'approved' ? <Badge status={item.moderationStatus} label={item.moderationStatus === 'pending' ? 'In review' : undefined} /> : null}
          {item.mine && item.status === 'paused' ? <Badge label="Paused" tone="neutral" /> : null}
        </View>
        <T weight="extrabold" size={19} style={{ lineHeight: 26 }} accessibilityRole="header">
          {item.title}
        </T>
        <T weight="extrabold" size={17} color={colors.navy}>
          {offerPrice(item)}
        </T>
        <T size={12.5} color={colors.muted}>
          {[item.serviceArea, item.city].filter(Boolean).join(' · ')}
          {item.society?.name ? ` · ${item.society.name}` : ''}
        </T>
      </View>

      {item.mine && item.moderationStatus === 'pending' ? <Hint tone="amber" icon="hourglass-outline">Your service is being reviewed. Neighbours see it once it is approved.</Hint> : null}
      {item.mine && item.moderationStatus === 'rejected' ? <Hint tone="coral" icon="close-circle-outline">{`Not approved${item.moderationNote ? `: ${item.moderationNote}` : ''}. Edit it to resubmit.`}</Hint> : null}

      <Card>
        <KeyValue label="Provider" value={item.contactName || item.postedBy} />
        {item.experienceYears ? <KeyValue label="Experience" value={`${item.experienceYears} year${item.experienceYears === 1 ? '' : 's'}`} /> : null}
        {item.availabilityNote ? <KeyValue label="Available" value={item.availabilityNote} /> : null}
        <KeyValue label="Pricing" value={OFFER_PRICE_TYPES.find((p) => p.value === item.priceType)?.label} />
        <KeyValue label="Listed on" value={formatDate(item.createdAt)} />
      </Card>

      {item.description ? (
        <Card>
          <T weight="bold" size={14} style={{ marginBottom: 6 }}>
            About this service
          </T>
          <T size={13.5} color="#334155" style={{ lineHeight: 21 }}>
            {item.description}
          </T>
        </Card>
      ) : null}

      {item.mine ? (
        <View style={{ gap: 10 }}>
          {item.moderationStatus === 'approved' && item.status === 'active' ? (
            <Button title="Boost this service" icon="rocket-outline" variant="gold" onPress={() => router.push({ pathname: '/boost', params: { kind: 'service', id: item._id } })} />
          ) : null}
          <Button title="Edit service" icon="create-outline" onPress={() => router.push({ pathname: '/offers/edit', params: { id: item._id } })} />
          {item.status === 'active' ? <Button title="Pause (hide for now)" variant="alt" onPress={() => setStatus('paused')} /> : <Button title="Resume — show again" variant="alt" onPress={() => setStatus('active')} />}
          <Button title="Delete service" variant="danger" onPress={remove} />
        </View>
      ) : (
        <>
          {canBook ? <Button title="Book Now" icon="calendar-outline" variant="gold" onPress={() => router.push({ pathname: '/offers/book', params: { id: item._id } })} /> : null}
          <Card style={{ gap: 10 }}>
            <T weight="bold" size={14}>
              Contact {item.contactName || item.postedBy || 'the provider'}
            </T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Call" icon="call" onPress={call} style={{ flex: 1 }} />
              {item.whatsappAvailable ? <Button title="WhatsApp" icon="logo-whatsapp" variant="alt" onPress={whatsapp} style={{ flex: 1 }} /> : null}
            </View>
            <T size={11.5} color={colors.muted} style={{ lineHeight: 17 }}>
              {item.verifiedVendor
                ? 'This vendor’s identity (PAN and Aadhaar) was checked by NIVASA. Agree on the price before work starts and pay only after the job is done.'
                : 'Agree on the price before work starts and pay only after the job is done. NIVASA lists providers but does not employ or guarantee them.'}
            </T>
          </Card>
          {reporting ? (
            <Card style={{ gap: 4 }}>
              <T weight="bold" size={14}>
                Why are you reporting this service?
              </T>
              {REASONS.map((r) => (
                <Pressable key={r} onPress={() => report(r)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                  <T size={14}>{r}</T>
                </Pressable>
              ))}
              <Pressable onPress={() => setReporting(false)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                <T weight="bold" size={14} color={colors.muted}>
                  Cancel
                </T>
              </Pressable>
            </Card>
          ) : (
            <Button title="Report this service" icon="flag-outline" variant="ghost" onPress={() => setReporting(true)} />
          )}
        </>
      )}
    </>
  );
}

export default function OfferScreen() {
  const { id } = useLocalSearchParams();
  const item = useApi(`/service-offers/${id}`);
  return (
    <Screen header={<DetailHeader title="Service details" fallback="/offers" />} refreshing={item.refreshing} onRefresh={item.refresh}>
      <AsyncView state={item} skeleton={<LoadingList rows={2} card={180} />}>
        {(d) => <OfferDetail item={d} onChanged={item.refresh} />}
      </AsyncView>
    </Screen>
  );
}
