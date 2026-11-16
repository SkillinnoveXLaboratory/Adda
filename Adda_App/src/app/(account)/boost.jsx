import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { NIcon } from '../../components/NivasaIcons';
import { Button, Card, DetailHeader, EmptyState, Field, Hint, LoadingList, Screen, SectionTitle, T } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useToast } from '../../context/toast';
import { useAction, useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { money, offerPrice } from '../../lib/format';
import { colors, shadow } from '../../theme';

// Fallback only; the admin sets the choices in Master Admin → Settings (served in /public/config).
const DEFAULT_DAYS = [3, 7, 15, 30];
const live = (kind, l) => l.moderationStatus === 'approved' && (kind === 'property' ? l.availability === 'available' : l.status === 'active');

/** Boost a post (like an Instagram promotion): pick the post, a location and how many days; NIVASA reviews it. */
export default function Boost() {
  const params = useLocalSearchParams();
  const { vendor, isVendor } = useAuth();
  const toast = useToast();
  const props = useApi(isVendor ? '/properties/mine' : null, { query: { limit: 50 } });
  const offers = useApi(isVendor ? '/service-offers/mine' : null, { query: { limit: 50 } });
  const options = useMemo(
    () => [
      ...(props.data?.items || []).filter((l) => live('property', l)).map((l) => ({ kind: 'property', item: l })),
      ...(offers.data?.items || []).filter((l) => live('service', l)).map((l) => ({ kind: 'service', item: l })),
    ],
    [props.data, offers.data],
  );
  const [picked, setPicked] = useState(null);
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const config = useApi('/public/config', { refetchOnFocus: false });
  const dayOptions = config.data?.ads?.dayOptions?.length ? config.data.ads.dayOptions : DEFAULT_DAYS;
  const [pickedDays, setDays] = useState(null);
  const days = pickedDays && dayOptions.includes(pickedDays) ? pickedDays : dayOptions.includes(7) ? 7 : dayOptions[0];
  const [error, setError] = useState(null);

  // Preselect the post passed in (?kind=&id=) once listings load.
  useEffect(() => {
    if (picked || !params.id) return;
    const found = options.find((o) => String(o.item._id) === String(params.id));
    if (found) choose(found);
  }, [options, params.id, picked]);

  function choose(o) {
    setPicked(o);
    setCity(o.item.city || '');
  }

  const [submit, busy] = useAction(async () => {
    if (!picked) return setError('Choose a post to boost');
    if (city.trim().length < 2) return setError('Enter the city where the ad should show');
    setError(null);
    try {
      await api('/vendor/ads', { method: 'POST', body: { kind: picked.kind, listingId: picked.item._id, city: city.trim(), ...(area.trim() && { area: area.trim() }), days } });
      toast.success('Boost submitted for review');
      router.replace('/ads');
    } catch (err) {
      toast.error(err.message);
    }
  });

  if (!isVendor || vendor?.kycStatus !== 'approved') {
    return (
      <Screen header={<DetailHeader title="Boost a post" fallback="/ads" />}>
        <EmptyState icon="shield-checkmark-outline" title="Verified vendors only" message="Complete your KYC and get it approved to boost your posts." action={isVendor ? 'Go to KYC' : undefined} onAction={isVendor ? () => router.push('/kyc') : undefined} />
      </Screen>
    );
  }

  const loading = (props.loading && !props.data) || (offers.loading && !offers.data);
  return (
    <Screen header={<DetailHeader title="Boost a post" fallback="/ads" />} footer={picked ? <Button title="Submit for review" icon="rocket-outline" onPress={submit} loading={busy} /> : undefined}>
      <SectionTitle title="1. Choose a post" />
      {loading ? (
        <LoadingList rows={2} card={76} />
      ) : !options.length ? (
        <EmptyState icon="pricetags-outline" title="Nothing to boost yet" message="Only approved, live posts can be boosted. Add a property or service and wait for approval." action="My listings" onAction={() => router.push('/vendor-listings')} />
      ) : (
        <View style={{ gap: 8 }}>
          {options.map((o) => {
            const on = picked?.item._id === o.item._id;
            const photo = o.item.photos?.[0]?.url;
            return (
              <Pressable key={o.item._id} onPress={() => choose(o)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.option, on && styles.optionOn]}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.noThumb]}>
                    <NIcon name={o.kind === 'property' ? 'properties' : 'maintenance'} size={28} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T weight="bold" size={13} color={colors.navy} numberOfLines={2}>
                    {o.item.title}
                  </T>
                  <T size={11.5} color={colors.muted} numberOfLines={1}>
                    {o.kind === 'property' ? `Property · ${money(o.item.pricePaise)}` : `Service · ${offerPrice(o.item)}`} · {o.item.city}
                  </T>
                </View>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.navy : '#cbd5e1'} />
              </Pressable>
            );
          })}
        </View>
      )}

      {picked ? (
        <>
          <SectionTitle title="2. Where should it show?" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="City" value={city} onChangeText={setCity} maxLength={80} placeholder="e.g. Pune" style={{ flex: 1 }} />
            <Field label="Area (optional)" value={area} onChangeText={setArea} maxLength={120} placeholder="e.g. Baner" style={{ flex: 1 }} />
          </View>

          <SectionTitle title="3. For how many days?" />
          <View style={styles.days}>
            {dayOptions.map((d) => {
              const on = d === days;
              return (
                <Pressable key={d} onPress={() => setDays(d)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${d} days`} style={[styles.day, on && styles.dayOn]}>
                  <T weight="extrabold" size={18} color={on ? colors.gold : colors.navy}>
                    {d}
                  </T>
                  <T weight="semibold" size={11} color={on ? '#e2e8f0' : colors.muted}>
                    days
                  </T>
                </Pressable>
              );
            })}
          </View>

          <Card style={{ gap: 6 }}>
            <T weight="bold" size={13.5} color={colors.navy}>
              Summary
            </T>
            <T size={12.5} color="#334155" style={{ lineHeight: 19 }}>
              “{picked.item.title}” will show first in {picked.kind === 'property' ? 'property' : 'service'} results for people in {city.trim() || 'your city'}
              {area.trim() ? ` (${area.trim()})` : ''}, marked Sponsored, for {days} days from the day NIVASA approves it.
            </T>
          </Card>
          {error ? <Hint tone="coral">{error}</Hint> : null}
          <Hint icon="information-circle-outline">There is no charge for boosting right now. Each boost is reviewed by NIVASA before it goes live.</Hint>
        </>
      ) : error ? (
        <Hint tone="coral">{error}</Hint>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, padding: 10, ...shadow.card },
  optionOn: { borderColor: colors.navy },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#f1f5f9' },
  noThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldLight },
  days: { flexDirection: 'row', gap: 10 },
  day: { flex: 1, minHeight: 64, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: colors.navy, borderColor: colors.navy },
});
