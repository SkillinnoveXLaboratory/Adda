import { View } from 'react-native';
import { router } from 'expo-router';
import { AsyncView, Badge, Card, DetailHeader, IconCircle, Screen, T } from '../../../components/ui';
import { useApi } from '../../../hooks/useApi';
import { formatDate, titleCase } from '../../../lib/format';
import { colors } from '../../../theme';

export default function Notices() {
  const list = useApi('/resident/announcements', { query: { limit: 50 } });
  return (
    <Screen header={<DetailHeader title="Society notices" fallback="/home" />} refreshing={list.refreshing} onRefresh={list.refresh}>
      <AsyncView state={list} empty={{ when: (d) => !d.items.length, icon: 'megaphone-outline', title: 'No notices yet', message: 'Announcements from your society office will appear here.' }}>
        {(d) => (
          <View style={{ gap: 10 }}>
            {d.items.map((n) => (
              <Card key={n._id} onPress={() => router.push(`/notices/${n._id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }} accessibilityLabel={n.title}>
                <IconCircle icon={n.important ? 'alert-circle-outline' : 'notifications-outline'} tone={n.important ? 'coral' : 'blue'} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    <Badge label={titleCase(n.category)} tone="neutral" />
                    {n.important ? <Badge label="Important" tone="danger" /> : null}
                    {n.scope === 'platform' ? <Badge label="NIVASA" tone="info" /> : null}
                  </View>
                  <T weight="bold" size={15}>
                    {n.title}
                  </T>
                  <T size={13} color={colors.muted} numberOfLines={2}>
                    {n.body}
                  </T>
                  <T size={12} color={colors.subtle}>
                    {formatDate(n.createdAt)}
                    {n.createdBy?.name ? ` · ${n.createdBy.name}` : ''}
                  </T>
                </View>
              </Card>
            ))}
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}
