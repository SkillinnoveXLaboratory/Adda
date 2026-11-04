import { View } from 'react-native';
import { router } from 'expo-router';
import { AsyncView, Badge, Button, Card, DetailHeader, IconCircle, Screen, T } from '../../components/ui';
import { useToast } from '../../context/toast';
import { useAction, useApi } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { confirm } from '../../lib/dialog';
import { formatDate, formatDateTime, titleCase } from '../../lib/format';
import { colors } from '../../theme';

export default function ServiceRequests() {
  const toast = useToast();
  const list = useApi('/resident/service-requests', { query: { limit: 50 } });

  const [cancel] = useAction(async (r) => {
    const ok = await confirm({ title: 'Cancel request?', message: `Your ${r.category?.name || 'service'} request will be withdrawn.`, confirmText: 'Cancel request', cancelText: 'Keep', destructive: true });
    if (!ok) return;
    try {
      await api(`/resident/service-requests/${r._id}/cancel`, { method: 'POST' });
      toast.success('Request cancelled');
      list.refresh();
    } catch (err) {
      toast.error(err.message);
    }
  });

  return (
    <Screen header={<DetailHeader title="My service requests" fallback="/services" />} refreshing={list.refreshing} onRefresh={list.refresh}>
      <AsyncView state={list} empty={{ when: (d) => !d.items.length, icon: 'construct-outline', title: 'No requests yet', message: 'Request a plumber, electrician and more from the Services tab.', action: 'Browse services', onAction: () => router.push('/services') }}>
        {(d) => (
          <View style={{ gap: 10 }}>
            {d.items.map((r) => (
              <Card key={r._id} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <IconCircle icon="construct-outline" />
                  <View style={{ flex: 1 }}>
                    <T weight="bold" size={15}>
                      {r.category?.name || 'Service'}
                    </T>
                    <T size={13} color={colors.muted} numberOfLines={3}>
                      {r.description}
                    </T>
                    <T size={12} color={colors.subtle} style={{ marginTop: 2 }}>
                      Requested {formatDate(r.createdAt)}
                      {r.preferredDate ? ` · prefers ${formatDate(r.preferredDate)}` : ''}
                      {r.preferredTime ? ` ${r.preferredTime}` : ''}
                    </T>
                    {r.scheduledFor ? (
                      <T weight="bold" size={12.5} color={colors.blue}>
                        Scheduled {formatDateTime(r.scheduledFor)}
                        {r.assigneeName ? ` · ${r.assigneeName}` : ''}
                      </T>
                    ) : null}
                    {r.timeline?.length > 1 && r.timeline[r.timeline.length - 1].note ? (
                      <T size={12.5} color="#334155" style={{ marginTop: 4 }}>
                        Office: {r.timeline[r.timeline.length - 1].note}
                      </T>
                    ) : null}
                  </View>
                  <Badge status={r.status} label={titleCase(r.status)} />
                </View>
                {['requested', 'accepted', 'scheduled'].includes(r.status) ? <Button title="Cancel request" small variant="danger" onPress={() => cancel(r)} /> : null}
              </Card>
            ))}
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}
