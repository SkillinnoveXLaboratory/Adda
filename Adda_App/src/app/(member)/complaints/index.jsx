import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, Card, Chips, DetailHeader, EmptyState, ErrorState, IconCircle, LoadingList, Screen, T } from '../../../components/ui';
import { useApi } from '../../../hooks/useApi';
import { formatDate } from '../../../lib/format';
import { colors } from '../../../theme';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export default function Complaints() {
  const [status, setStatus] = useState('');
  const list = useApi('/resident/complaints', { query: { status, limit: 50 } });

  return (
    <Screen
      header={<DetailHeader title="My complaints" fallback="/home" />}
      refreshing={list.refreshing}
      onRefresh={list.refresh}
      footer={<Button title="Raise complaint" icon="add" onPress={() => router.push('/complaints/new')} />}
    >
      <Chips options={FILTERS} value={status} onChange={setStatus} />
      {list.loading && !list.data ? (
        <LoadingList rows={4} card={92} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data.items.length ? (
        <EmptyState icon="construct-outline" title={status ? 'Nothing here' : 'No complaints yet'} message={status ? 'No complaints with this status.' : 'Report water, electricity, lift, security or any other issue — the society office will track it to resolution.'} />
      ) : (
        <View style={{ gap: 10 }}>
          {list.data.items.map((c) => (
            <Card key={c._id} onPress={() => router.push(`/complaints/${c._id}`)} accessibilityLabel={`${c.title}, ${c.status}`} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <IconCircle icon="construct-outline" tone="coral" />
                <View style={{ flex: 1 }}>
                  <T weight="bold" size={15} numberOfLines={2}>
                    {c.title}
                  </T>
                  <T size={12} color={colors.muted} style={{ marginTop: 2 }}>
                    {c.ticketNumber} · {c.category?.name}
                  </T>
                </View>
                <Badge status={c.status} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T size={12} color="#94a3b8">
                  Raised {formatDate(c.createdAt)}
                </T>
                {c.priority !== 'normal' ? (
                  <T weight="bold" size={12} color={c.priority === 'urgent' || c.priority === 'high' ? colors.danger : colors.muted}>
                    {c.priority.toUpperCase()}
                  </T>
                ) : null}
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
