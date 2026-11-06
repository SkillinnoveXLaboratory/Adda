import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { KycStatusCard } from '../../../components/KycStatusCard';
import { NIcon } from '../../../components/NivasaIcons';
import { AsyncView, Badge, Button, Card, Hero, Hint, Screen, T } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useToast } from '../../../context/toast';
import { useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { confirm } from '../../../lib/dialog';
import { formatDate } from '../../../lib/format';
import { colors } from '../../../theme';

const STATUS = { pending: ['In review', 'warning'], active: ['Running · Sponsored', 'success'], expired: ['Finished', 'neutral'], rejected: ['Not approved', 'danger'], cancelled: ['Stopped', 'neutral'] };

/** The vendor's boosts: review status, where and how long they run; stop or withdraw them. */
export default function VendorAds() {
  const { vendor } = useAuth();
  const toast = useToast();
  const list = useApi('/vendor/ads', { query: { limit: 50 } });
  const verified = vendor?.kycStatus === 'approved';

  const stop = async (ad) => {
    const running = ad.status === 'active';
    const ok = await confirm({ title: running ? 'Stop this ad?' : 'Withdraw this request?', message: running ? 'Your post stops showing as sponsored right away.' : 'The admin will no longer review it.', confirmText: running ? 'Stop ad' : 'Withdraw', destructive: true });
    if (!ok) return;
    try {
      await api(`/vendor/ads/${ad._id}/cancel`, { method: 'POST' });
      toast.success(running ? 'Ad stopped' : 'Request withdrawn');
      list.refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Screen
      header={<Hero title="Boost" subtitle="Show your posts at the top, marked Sponsored" />}
      refreshing={list.refreshing}
      onRefresh={list.refresh}
      footer={<Button title={verified ? 'Boost a post' : 'Complete KYC to boost'} icon={verified ? 'rocket-outline' : 'shield-checkmark-outline'} onPress={() => router.push(verified ? '/boost' : '/kyc')} />}
    >
      {!verified ? <KycStatusCard status={vendor?.kycStatus} note={vendor?.kycNote} /> : null}
      <Hint icon="rocket-outline">Choose a post, a city and how many days. After NIVASA approves it, your post shows first in its category for people in that city, marked Sponsored.</Hint>
      <AsyncView state={list} empty={{ when: (d) => !d.items.length, icon: 'rocket-outline', title: 'No boosts yet', message: 'Boost an approved property or service to reach more people.' }}>
        {(d) => (
          <View style={{ gap: 12 }}>
            {d.items.map((ad) => {
              const [label, tone] = STATUS[ad.status] || [ad.status, 'neutral'];
              return (
                <Card key={ad._id} style={{ gap: 10 }}>
                  <View style={styles.row}>
                    {ad.listing?.photo?.url ? (
                      <Image source={{ uri: ad.listing.photo.url }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.noThumb]}>
                        <NIcon name={ad.kind === 'property' ? 'properties' : 'maintenance'} size={30} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Badge label={label} tone={tone} style={{ alignSelf: 'flex-start' }} />
                      <T weight="bold" size={13.5} color={colors.navy} numberOfLines={2}>
                        {ad.listingTitle}
                      </T>
                      <View style={styles.meta}>
                        <Ionicons name="location-outline" size={13} color="#94a3b8" />
                        <T size={11.5} color={colors.muted} numberOfLines={1} style={{ flex: 1 }}>
                          {[ad.area, ad.city].filter(Boolean).join(', ')} · {ad.days} day{ad.days === 1 ? '' : 's'} · {ad.kind === 'property' ? 'Property' : 'Service'}
                        </T>
                      </View>
                    </View>
                  </View>
                  {ad.startsAt ? (
                    <T size={11.5} color={colors.muted}>
                      {ad.status === 'active' ? `Running until ${formatDate(ad.endsAt)}` : `Ran ${formatDate(ad.startsAt)} – ${formatDate(ad.endsAt)}`}
                    </T>
                  ) : (
                    <T size={11.5} color={colors.muted}>
                      Requested {formatDate(ad.createdAt)}
                    </T>
                  )}
                  {ad.reviewNote ? <Hint tone={ad.status === 'rejected' ? 'coral' : 'blue'}>{ad.reviewNote}</Hint> : null}
                  {['pending', 'active'].includes(ad.status) ? <Button small variant="danger" title={ad.status === 'active' ? 'Stop ad' : 'Withdraw request'} onPress={() => stop(ad)} /> : null}
                </Card>
              );
            })}
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 72, height: 64, borderRadius: 12, backgroundColor: '#f1f5f9' },
  noThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldLight },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
