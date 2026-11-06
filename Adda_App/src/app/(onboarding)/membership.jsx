import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, DetailHeader, EmptyState, Hint, KeyValue, Screen, T } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useToast } from '../../context/toast';
import { useAction } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { confirm } from '../../lib/dialog';
import { formatDate, titleCase } from '../../lib/format';
import { colors } from '../../theme';

const STEPS = ['Request sent', 'Society reviewing', 'Approved'];

/** Live status of the resident's membership request. Approval unlocks the app automatically. */
export default function MembershipStatus() {
  const { memberships, refreshProfile } = useAuth();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const m = memberships.find((x) => x.status === 'pending') || memberships[0];

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [refreshProfile, toast]);

  // Poll while pending so approval shows up without manual refresh.
  useEffect(() => {
    if (m?.status !== 'pending') return undefined;
    const id = setInterval(() => refreshProfile().catch(() => {}), 20000);
    return () => clearInterval(id);
  }, [m?.status, refreshProfile]);

  const [cancel, cancelling] = useAction(async () => {
    try {
      await api(`/memberships/${m._id}/cancel`, { method: 'POST' });
      await refreshProfile();
      toast.success('Request cancelled');
      router.replace('/society');
    } catch (err) {
      toast.error(err.message);
    }
  });

  if (!m) {
    return (
      <Screen header={<DetailHeader title="Membership" fallback="/society" />}>
        <EmptyState icon="people-outline" title="No requests yet" message="Find your society and request to join." action="Find my society" onAction={() => router.replace('/society')} />
      </Screen>
    );
  }

  const stage = m.status === 'pending' ? 1 : m.status === 'approved' ? 2 : 1;
  const rejected = ['rejected', 'suspended', 'cancelled'].includes(m.status);

  return (
    <Screen header={<DetailHeader title="Membership status" fallback="/society" />} refreshing={refreshing} onRefresh={refresh}>
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 10 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: rejected ? colors.dangerBg : '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={rejected ? 'close-circle-outline' : 'time-outline'} size={40} color={rejected ? colors.danger : '#07162c'} />
        </View>
        <T weight="extrabold" size={22} style={{ textAlign: 'center' }}>
          {rejected ? `Request ${m.status}` : 'Membership pending'}
        </T>
        <T size={14} color={colors.muted} style={{ textAlign: 'center', maxWidth: 320 }}>
          {rejected
            ? m.decisionReason || 'The society did not approve this request.'
            : `Your request has been sent to ${m.society?.name}. You'll be notified once the society office approves it.`}
        </T>
      </View>

      {!rejected ? (
        <Card>
          {STEPS.map((label, i) => {
            const done = i < stage;
            const current = i === stage;
            return (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50 }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: done ? colors.greenStrong : '#cbd5e1', backgroundColor: done ? colors.greenStrong : colors.white, alignItems: 'center', justifyContent: 'center' }}>
                    {done ? <Ionicons name="checkmark" size={15} color={colors.white} /> : <T weight="bold" size={12} color={current ? colors.blue : '#94a3b8'}>{i + 1}</T>}
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <T weight="bold" size={14} color={done ? '#047857' : current ? colors.text : '#94a3b8'}>
                    {label}
                  </T>
                  {current ? (
                    <T size={12} color={colors.muted}>
                      In progress — usually within a day
                    </T>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}

      <Card>
        <KeyValue label="Society" value={m.society?.name} />
        <KeyValue label="Building" value={m.building?.name} />
        <KeyValue label="Flat" value={m.flat?.number} />
        <KeyValue label="Resident type" value={titleCase(m.residentType)} />
        <KeyValue label="Requested on" value={formatDate(m.createdAt)} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 }}>
          <T size={13} color="#64748b">
            Status
          </T>
          <Badge status={m.status} />
        </View>
      </Card>

      {m.status === 'pending' ? (
        <>
          <Button title="Check status" icon="refresh" variant="alt" onPress={refresh} loading={refreshing} />
          <Button
            title="Cancel request"
            variant="danger"
            loading={cancelling}
            onPress={async () => (await confirm({ title: 'Cancel request?', message: 'You can send a new request afterwards.', confirmText: 'Cancel request', cancelText: 'Keep request', destructive: true })) && cancel()}
          />
          <Hint>Pull down or tap “Check status” to refresh. This screen also checks automatically every 20 seconds.</Hint>
        </>
      ) : (
        <Button title="Send a new request" icon="search" onPress={() => router.replace('/society')} />
      )}
    </Screen>
  );
}
