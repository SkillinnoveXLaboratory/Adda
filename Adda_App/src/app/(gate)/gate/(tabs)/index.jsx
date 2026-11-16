import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Chips, EmptyState, ErrorState, Hint, IconButton, LoadingList, PillToggle, Screen, SearchBar, SectionTitle, T } from '../../../../components/ui';
import { GateHeader, dayName, useDebounced, useGate } from '../../../../components/GateKit';
import { VisitorCard } from '../../../../components/VisitorCard';
import { useApi } from '../../../../hooks/useApi';
import { api } from '../../../../lib/api';
import { istDay } from '../../../../lib/format';
import { colors } from '../../../../theme';

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'expected', label: 'Expected' },
  { value: 'approved', label: 'Approved' },
  { value: 'inside', label: 'Inside' },
  { value: 'exited', label: 'Left' },
  { value: 'rejected', label: 'Not allowed' },
  { value: 'cancelled', label: 'Cancelled' },
];
const OPEN = new Set(['expected', 'approved', 'inside']);
const LIMIT = 100;
const POLL_MS = 30_000;

/** Gate home: today's guests (any day via the date arrows), upcoming, inside now, and all of a day by status. */
export default function GateGuests() {
  const { society, me } = useGate();
  const [tab, setTab] = useState('today');
  const [day, setDay] = useState(() => istDay(0));
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());

  const query = tab === 'upcoming' ? { status: 'upcoming' } : tab === 'inside' ? { status: 'inside' } : { date: day, ...(tab === 'all' ? { status } : null) };
  const list = useApi('/gate/visitors', { query: { ...query, q, limit: LIMIT } });
  // useApi's setData is a new function each render: keep the latest in a ref so the timer isn't reset every render.
  const setDataRef = useRef(list.setData);
  useEffect(() => {
    setDataRef.current = list.setData;
  });
  const key = JSON.stringify({ ...query, q });
  const refetch = useCallback(() => {
    api('/gate/visitors', { query: { ...JSON.parse(key), limit: LIMIT } })
      .then((d) => setDataRef.current(d))
      .catch(() => {});
  }, [key]);

  // Gate lists change all the time (members add guests, other gates act): refresh quietly every 30 s.
  useEffect(() => {
    const t = setInterval(refetch, POLL_MS);
    return () => clearInterval(t);
  }, [refetch]);

  const onChanged = useCallback(
    (updated) => {
      if (updated) setDataRef.current((d) => (d ? { ...d, items: d.items.map((x) => (x._id === updated._id ? updated : x)) } : d));
      refetch();
    },
    [refetch],
  );

  const items = list.data?.items || [];
  const total = list.data?.total || 0;
  const t = me?.today || {};
  const options = [
    { value: 'today', label: 'Today' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'inside', label: t.inside ? `Inside ${t.inside}` : 'Inside' },
    { value: 'all', label: 'All' },
  ];

  const card = (v) => (
    <VisitorCard key={`${v._id}-${v.status}`} visitor={v} mode="gate" showDate={tab !== 'today' && tab !== 'all'} onChanged={onChanged} onOpen={() => router.push(`/gate/guest/${v._id}`)} />
  );

  let content;
  if (list.loading && !list.data) content = <LoadingList rows={3} card={170} />;
  else if (list.error && !list.data) content = <ErrorState error={list.error} onRetry={list.reload} />;
  else if (!items.length) {
    content = q ? (
      <EmptyState icon="search-outline" title="No guests match" message={`Nothing for “${q}”. Search by guest name, phone or flat number.`} />
    ) : (
      <EmptyState
        icon="people-outline"
        title={tab === 'inside' ? 'Nobody inside' : tab === 'upcoming' ? 'No upcoming guests' : `No guests ${day === istDay(0) ? 'today' : `on ${dayName(day)}`}`}
        message={tab === 'inside' ? 'Guests show here after you mark them as entered.' : 'Guests that members add, and walk-ins you add, show up here.'}
        action="Add a walk-in guest"
        onAction={() => router.navigate('/gate/add')}
      />
    );
  } else if (tab === 'today') {
    const open = items.filter((v) => OPEN.has(v.status));
    const done = items.filter((v) => !OPEN.has(v.status));
    content = (
      <View style={{ gap: 12 }}>
        <SectionTitle title={`To handle (${open.length})`} />
        {open.length ? open.map(card) : <T color={colors.muted}>Everyone for this day has been handled.</T>}
        {done.length ? <SectionTitle title={`Done (${done.length})`} style={{ marginTop: 6 }} /> : null}
        {done.map(card)}
      </View>
    );
  } else content = <View style={{ gap: 12 }}>{items.map(card)}</View>;

  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh} header={<GateHeader society={society} subtitle={`Gate security · ${dayName(istDay(0))}`} />}>
      <PillToggle options={options} value={tab} onChange={setTab} />
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, phone or flat" />
      {tab === 'today' || tab === 'all' ? <DayPicker day={day} onChange={setDay} /> : null}
      {tab === 'all' ? <Chips options={STATUS_FILTERS} value={status} onChange={setStatus} /> : null}
      {content}
      {total > items.length ? (
        <Hint>
          Showing {items.length} of {total}. Search to find a guest.
        </Hint>
      ) : null}
    </Screen>
  );
}

/** ‹ Today, Sat 14 Nov › — steps one day at a time (30 days back … 30 ahead); tap the label to go back to today. */
function DayPicker({ day, onChange }) {
  const today = istDay(0);
  const shift = (n) => {
    const [y, m, d] = day.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    if (next >= istDay(-30) && next <= istDay(30)) onChange(next);
  };
  return (
    <View style={styles.day}>
      <IconButton icon="chevron-back" label="Previous day" onPress={() => shift(-1)} />
      <Pressable onPress={() => onChange(today)} accessibilityRole="button" accessibilityLabel={`Showing ${dayName(day)}. Go to today`} style={styles.dayLabel}>
        <T weight="bold" size={14} color={colors.navy} numberOfLines={1}>
          {dayName(day)}
          {day === today ? '' : ' · back to today'}
        </T>
      </Pressable>
      <IconButton icon="chevron-forward" label="Next day" onPress={() => shift(1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  day: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, minHeight: 46 },
  dayLabel: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
