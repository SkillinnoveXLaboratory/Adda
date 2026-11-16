import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Avatar, Button, Card, DetailHeader, ErrorState, ListRow, LoadingList, Screen, SectionTitle, T } from '../../../../components/ui';
import { GateCallButton, VisitorStatusBadge, dayName, formatPhone } from '../../../../components/GateKit';
import { GateNoteSheet } from '../../../../components/GateNoteSheet';
import { useApi } from '../../../../hooks/useApi';
import { timeAgo, titleCase } from '../../../../lib/format';
import { colors } from '../../../../theme';

/** One member for the gate: phone (call), flats, recent guests of those flats, and the notes the gate sent them. */
export default function GateMember() {
  const { id } = useLocalSearchParams();
  const d = useApi(`/gate/members/${id}`);
  const [noteOpen, setNoteOpen] = useState(false);
  const m = d.data?.member;

  return (
    <Screen refreshing={d.refreshing} onRefresh={d.refresh} header={<DetailHeader title={m?.name || 'Member'} fallback="/gate/members" />}>
      {d.loading && !d.data ? (
        <LoadingList rows={3} card={90} />
      ) : d.error && !d.data ? (
        <ErrorState error={d.error} onRetry={d.reload} />
      ) : (
        <>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={m.name || 'M'} size={52} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T weight="extrabold" size={16} color={colors.navy} numberOfLines={2}>
                  {m.name || 'Member'}
                </T>
                <T size={13} color={colors.textSoft} selectable numberOfLines={1}>
                  {m.phone ? formatPhone(m.phone) : 'No phone number'}
                </T>
              </View>
              <GateCallButton phone={m.phone} name={m.name} />
            </View>
            <Button title="Send note" icon="chatbubble-ellipses-outline" onPress={() => setNoteOpen(true)} />
          </Card>

          <SectionTitle title={d.data.flats.length > 1 ? 'Flats' : 'Flat'} />
          {d.data.flats.map((f) => (
            <ListRow
              key={f.membershipId}
              icon="business-outline"
              tone="gold"
              title={`Flat ${f.flat?.number || '—'}`}
              subtitle={[f.building?.name, f.flat?.floor != null ? `Floor ${f.flat.floor}` : null, titleCase(f.residentType || '')].filter(Boolean).join(' · ')}
            />
          ))}

          <SectionTitle title="Recent guests" />
          {d.data.recentVisitors.length ? (
            d.data.recentVisitors.map((v) => (
              <ListRow
                key={v._id}
                icon="person-outline"
                tone="navy"
                title={v.name}
                subtitle={[dayName(v.expectedDate), v.flat?.number ? `Flat ${v.flat.number}` : null, v.purpose].filter(Boolean).join(' · ')}
                right={<VisitorStatusBadge status={v.status} />}
                onPress={() => router.push(`/gate/guest/${v._id}`)}
              />
            ))
          ) : (
            <T size={13} color={colors.muted}>
              No guests for this flat yet.
            </T>
          )}

          <SectionTitle title="Notes from the gate" />
          {d.data.notes.length ? (
            <Card style={{ gap: 10 }}>
              {d.data.notes.map((n, i) => (
                <View key={n._id} style={[{ gap: 2 }, i > 0 && styles.sep]}>
                  <T size={13} color={colors.text}>
                    {n.text}
                  </T>
                  <T size={11} color={colors.subtle}>
                    {[timeAgo(n.createdAt), n.visitor ? `about ${n.visitor.name}` : null, n.readAt ? 'Read' : 'Not read yet'].filter(Boolean).join(' · ')}
                  </T>
                </View>
              ))}
            </Card>
          ) : (
            <T size={13} color={colors.muted}>
              No notes sent to this member yet.
            </T>
          )}
          <GateNoteSheet member={noteOpen ? { ...m, flat: d.data.flats[0]?.flat } : null} onClose={() => setNoteOpen(false)} onSent={() => d.refresh()} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sep: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 },
});
