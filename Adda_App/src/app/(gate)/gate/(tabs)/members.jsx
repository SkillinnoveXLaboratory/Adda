import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, Button, EmptyState, ErrorState, Hint, LoadingList, Screen, SearchBar, T } from '../../../../components/ui';
import { GateCallButton, GateHeader, formatPhone, useDebounced, useGate } from '../../../../components/GateKit';
import { GateNoteSheet } from '../../../../components/GateNoteSheet';
import { useApi } from '../../../../hooks/useApi';
import { titleCase } from '../../../../lib/format';
import { colors, shadow } from '../../../../theme';

const LIMIT = 100;

/** Members directory for the gate: approved members of this society with full phone numbers (call) and "Send note". */
export default function GateMembers() {
  const { society } = useGate();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const list = useApi('/gate/members', { query: { q, limit: LIMIT } });
  const [noteFor, setNoteFor] = useState(null);
  const items = list.data?.items || [];

  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh} header={<GateHeader society={society} subtitle="Members · call or send a note" />}>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, flat or phone" />
      {list.loading && !list.data ? (
        <LoadingList rows={5} card={76} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !items.length ? (
        <EmptyState
          icon="people-outline"
          title={q ? 'No member matches' : 'No members yet'}
          message={q ? `Nothing for “${q}”. Try the flat number, e.g. A-101.` : 'Members show here once the society approves them.'}
        />
      ) : (
        <View style={{ gap: 10 }}>
          {items.map((m) => (
            <View key={`${m.membershipId}`} style={styles.row}>
              <Pressable
                onPress={() => router.push(`/gate/member/${m._id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${m.name || 'Member'}, flat ${m.flat?.number || ''}`}
                style={({ pressed }) => [styles.main, pressed && { opacity: 0.8 }]}
              >
                <Avatar name={m.name || 'M'} size={42} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T weight="bold" size={14} color={colors.navy} numberOfLines={1}>
                    {m.name || 'Member'}
                  </T>
                  <T size={12} color={colors.textSoft} numberOfLines={1}>
                    {[m.flat?.number ? `Flat ${m.flat.number}` : null, m.building?.name, titleCase(m.residentType || '')].filter(Boolean).join(' · ')}
                  </T>
                  <T size={12} color={colors.muted} numberOfLines={1}>
                    {m.phone ? formatPhone(m.phone) : 'No phone number'}
                  </T>
                </View>
              </Pressable>
              <View style={styles.side}>
                <GateCallButton phone={m.phone} name={m.name} />
                <Button
                  title="Note"
                  icon="chatbubble-ellipses-outline"
                  variant="outline"
                  small
                  onPress={() => setNoteFor(m)}
                  accessibilityLabel={`Send note to ${m.name || 'member'}`}
                  style={styles.note}
                />
              </View>
            </View>
          ))}
          {(list.data?.total || 0) > items.length ? (
            <Hint>
              Showing {items.length} of {list.data.total}. Search to find a member.
            </Hint>
          ) : null}
        </View>
      )}
      <GateNoteSheet member={noteFor} onClose={() => setNoteFor(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 10, ...shadow.card },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  note: { minHeight: 44, paddingHorizontal: 10 },
});
