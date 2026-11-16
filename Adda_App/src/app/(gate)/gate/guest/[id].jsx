import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Button, Card, DetailHeader, ErrorState, KeyValue, LoadingList, Screen, SectionTitle } from '../../../../components/ui';
import { dayName, expectedWindow, formatPhone } from '../../../../components/GateKit';
import { GateNoteSheet } from '../../../../components/GateNoteSheet';
import { VisitorCard } from '../../../../components/VisitorCard';
import { useApi } from '../../../../hooks/useApi';
import { formatDateTime } from '../../../../lib/format';

/** One guest for the gate: status buttons, full timeline, call, and a note to the host. */
export default function GateGuest() {
  const { id } = useLocalSearchParams();
  const g = useApi(`/gate/visitors/${id}`);
  const [noteOpen, setNoteOpen] = useState(false);
  const v = g.data;

  return (
    <Screen refreshing={g.refreshing} onRefresh={g.refresh} header={<DetailHeader title={v?.name || 'Guest'} fallback="/gate" />}>
      {g.loading && !v ? (
        <LoadingList rows={2} card={160} />
      ) : g.error && !v ? (
        <ErrorState error={g.error} onRetry={g.reload} />
      ) : (
        <>
          <VisitorCard key={v.status} visitor={v} mode="gate" showDate onChanged={(u) => (u ? g.setData(u) : g.reload())} />
          <SectionTitle title="Details" />
          <Card>
            <KeyValue label="Phone" value={formatPhone(v.phone)} />
            <KeyValue label="Flat" value={[v.flat?.number, v.building?.name].filter(Boolean).join(' · ') || '—'} />
            <KeyValue label="Host" value={v.host?.name || 'Whole flat'} />
            {v.host?.phone ? <KeyValue label="Host phone" value={formatPhone(v.host.phone)} /> : null}
            <KeyValue label="Expected" value={[dayName(v.expectedDate), expectedWindow(v)].filter(Boolean).join(', ')} />
            {v.approvedAt ? <KeyValue label="Approved" value={formatDateTime(v.approvedAt)} /> : null}
            {v.entryAt ? <KeyValue label="Entered" value={formatDateTime(v.entryAt)} /> : null}
            {v.exitAt ? <KeyValue label="Left" value={formatDateTime(v.exitAt)} /> : null}
            {v.cancelledAt ? <KeyValue label="Cancelled" value={formatDateTime(v.cancelledAt)} /> : null}
            <KeyValue label="Added by" value={v.createdByRole === 'gateman' ? 'Gate (walk-in)' : 'Member'} />
          </Card>
          {v.host?._id ? <Button title={`Send a note to ${v.host.name || 'the host'}`} icon="chatbubble-ellipses-outline" variant="outline" onPress={() => setNoteOpen(true)} /> : null}
          <GateNoteSheet member={noteOpen && v.host ? { ...v.host, flat: v.flat } : null} visitor={v} onClose={() => setNoteOpen(false)} />
        </>
      )}
    </Screen>
  );
}
