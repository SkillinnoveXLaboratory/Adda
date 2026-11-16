import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, DetailHeader, EmptyState, ErrorState, Hint, LoadingList, PillToggle, Screen, T } from '../../../components/ui';
import { VisitorCard } from '../../../components/VisitorCard';
import { useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { formatDateTime, timeAgo } from '../../../lib/format';
import { colors, shadow } from '../../../theme';

/**
 * Member "Guests": guests of the member's own flat (upcoming / past, cancel while expected or approved), "Add guest",
 * and Notes from the gate (unread badge; opening the Notes tab marks them read).
 */
export default function Guests() {
  const params = useLocalSearchParams();
  const [tab, setTab] = useState(params.tab === 'notes' ? 'notes' : params.tab === 'past' ? 'past' : 'upcoming');
  const list = useApi(tab === 'notes' ? null : '/resident/visitors', { query: { scope: tab, limit: 50 } });
  const notes = useApi('/resident/gate-notes', { query: { limit: 50 } });
  const unread = notes.data?.unread ?? list.data?.unreadNotes ?? 0;

  // Opening the Notes tab marks the unread notes as read; they stay highlighted as "New" until the next visit.
  const [fresh, setFresh] = useState(() => new Set());
  const marking = useRef(false);
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  });
  const unreadIds = (notes.data?.items || [])
    .filter((n) => !n.readAt)
    .map((n) => n._id)
    .join(',');
  useEffect(() => {
    if (tab !== 'notes' || !unreadIds || marking.current) return;
    marking.current = true;
    const ids = unreadIds.split(',');
    setFresh((s) => new Set([...s, ...ids]));
    Promise.all(ids.map((nid) => api(`/resident/gate-notes/${nid}/read`, { method: 'POST' }).catch(() => null)))
      .then((res) => {
        const now = new Date().toISOString();
        notesRef.current.setData((d) =>
          d ? { ...d, unread: Math.max(0, (d.unread || 0) - res.filter(Boolean).length), items: d.items.map((n) => (ids.includes(n._id) ? { ...n, readAt: n.readAt || now } : n)) } : d,
        );
      })
      .finally(() => {
        marking.current = false;
      });
  }, [tab, unreadIds]);

  const options = [
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'past', label: 'Past' },
    { value: 'notes', label: unread ? `Notes (${unread})` : 'Notes' },
  ];
  const items = list.data?.items || [];

  let content;
  if (tab === 'notes') {
    const ns = notes.data?.items || [];
    content =
      notes.loading && !notes.data ? (
        <LoadingList rows={3} card={84} />
      ) : notes.error && !notes.data ? (
        <ErrorState error={notes.error} onRetry={notes.reload} />
      ) : !ns.length ? (
        <EmptyState icon="chatbubbles-outline" title="No notes from the gate" message="When gate security needs to tell you something — a parcel, a guest — it shows up here." />
      ) : (
        <View style={{ gap: 10 }} testID="gate-notes">
          {ns.map((n) => {
            const isNew = fresh.has(n._id) || !n.readAt;
            return (
              <View key={n._id} style={[styles.note, isNew && styles.noteNew]}>
                <View style={styles.noteIcon}>
                  <Ionicons name="shield-checkmark" size={18} color={colors.gold} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T weight="bold" size={13} color={colors.navy} numberOfLines={1} style={{ flex: 1 }}>
                      {n.from?.name || 'Gate security'}
                      {n.visitor ? ` · about ${n.visitor.name}` : ''}
                    </T>
                    {isNew ? <Badge label="New" tone="warning" /> : null}
                  </View>
                  <T size={13.5} color={colors.text} selectable>
                    {n.text}
                  </T>
                  <T size={11} color={colors.subtle}>
                    {timeAgo(n.createdAt)} · {formatDateTime(n.createdAt)}
                  </T>
                </View>
              </View>
            );
          })}
        </View>
      );
  } else if (list.loading && !list.data) content = <LoadingList rows={3} card={150} />;
  else if (list.error && !list.data) content = <ErrorState error={list.error} onRetry={list.reload} />;
  else if (!items.length) {
    content =
      tab === 'upcoming' ? (
        <EmptyState
          icon="people-outline"
          title="No guests expected"
          message="Tell gate security who is coming so they are let in without a wait."
          action="Add guest"
          onAction={() => router.push('/guests/new')}
        />
      ) : (
        <EmptyState icon="time-outline" title="No past guests" message="Guests who came, left or were cancelled show here." />
      );
  } else {
    content = (
      <View style={{ gap: 12 }}>
        {items.map((v) => (
          <VisitorCard key={`${v._id}-${v.status}`} visitor={v} mode="member" onChanged={() => list.refresh()} />
        ))}
      </View>
    );
  }

  return (
    <Screen
      refreshing={tab === 'notes' ? notes.refreshing : list.refreshing}
      onRefresh={() => {
        notes.refresh();
        if (tab !== 'notes') list.refresh();
      }}
      header={<DetailHeader title="Guests" fallback="/manage" />}
      footer={tab === 'notes' ? null : <Button title="Add guest" icon="person-add" onPress={() => router.push('/guests/new')} />}
    >
      <PillToggle options={options} value={tab} onChange={setTab} />
      {tab === 'upcoming' && items.length ? <Hint icon="shield-checkmark-outline">Gate security sees these guests and lets them in. You get a notification when they arrive.</Hint> : null}
      {content}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', gap: 10, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, ...shadow.card },
  noteNew: { borderColor: colors.gold, backgroundColor: '#fffbeb' },
  noteIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
});
