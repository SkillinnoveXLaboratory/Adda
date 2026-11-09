import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { confirm, notify } from '../lib/dialog';
import { formatDate, formatDateTime } from '../lib/format';
import { useToast } from '../context/toast';
import { colors } from '../theme';
import { T } from './ui';

/** "in 2 days" / "in 5 hours" / "in 12 min" until `d`. */
function timeLeft(d) {
  const ms = new Date(d).getTime() - Date.now();
  if (!(ms > 0)) return 'soon';
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `in ${h} hour${h === 1 ? '' : 's'}`;
  const days = Math.floor(h / 24);
  return `in ${days} days`;
}

/** Share of the total with one decimal ("33.3%", "50%"); 0 votes → 0%. */
export function pollPercent(votes, total) {
  if (!total) return 0;
  return Math.round(((votes || 0) / total) * 1000) / 10;
}

/** Status line under the question: time left while open, the end date (India time) once ended. */
export function pollTiming(p) {
  if (p.open) return p.closesAt ? `Closes ${timeLeft(p.closesAt)} · ${formatDateTime(p.closesAt)}` : 'Open until the society ends it';
  if (p.closesAt && new Date(p.closesAt).getTime() <= Date.now()) return `Ended ${formatDate(p.closesAt)}`;
  return 'Ended by the society';
}

/**
 * One society vote: question, note, large option buttons (confirm first — a vote can't be changed),
 * then result bars once the member has voted or the vote has ended, and the society's published result.
 * Used by the Voting list/detail screens and pinned in Community.
 */
export function PollCard({ poll, onChanged, onOpen }) {
  const toast = useToast();
  const [data, setData] = useState(poll);
  const [sending, setSending] = useState(null);
  const busy = useRef(false);
  const voted = !!data.myVote;
  const showResults = voted || !data.open;
  const total = data.totalVotes || 0;
  const mine = data.options.find((o) => String(o._id) === String(data.myVote));
  const top = showResults ? Math.max(0, ...data.options.map((o) => o.votes || 0)) : 0;

  const refresh = async () => {
    try {
      const fresh = await api(`/resident/polls/${data._id}`);
      setData(fresh);
    } catch {
      // The list refresh below still runs.
    }
    onChanged?.();
  };

  const vote = async (option) => {
    if (busy.current || showResults) return;
    const ok = await confirm({ title: `Vote "${option.label}"?`, message: "You can't change your vote after it is recorded.", confirmText: 'Vote' });
    if (!ok || busy.current) return;
    busy.current = true;
    setSending(String(option._id));
    try {
      const r = await api(`/resident/polls/${data._id}/vote`, { method: 'POST', body: { optionId: String(option._id) } });
      setData((d) => ({ ...d, myVote: String(r.myVote), totalVotes: r.totalVotes, options: d.options.map((o) => ({ ...o, votes: r.options.find((x) => String(x._id) === String(o._id))?.votes ?? 0 })) }));
      // Updated in place (no list refresh) so the card doesn't jump while the member reads the result.
      toast.success('Your vote is recorded');
    } catch (err) {
      if (err.code === 'ALREADY_VOTED') {
        notify('Already voted', 'You had already voted on this — your first vote counts. Showing the latest results.');
        await refresh();
      } else if (err.code === 'POLL_ENDED') {
        notify('Voting has ended', 'The society ended this vote before your vote was sent. Showing the final results.');
        await refresh();
      } else if (err.code === 'NOT_FOUND') {
        notify('Vote not available', 'This vote was removed by the society.');
        onChanged?.();
      } else {
        toast.error(err.message);
      }
    } finally {
      busy.current = false;
      setSending(null);
    }
  };

  return (
    <View style={styles.card} testID={`poll-${data._id}`}>
      <View style={styles.headRow}>
        <View style={[styles.status, { backgroundColor: data.open ? colors.greenBg : colors.divider }]}>
          <T weight="extrabold" size={10.5} color={data.open ? colors.green : colors.chipText} style={{ lineHeight: 15 }}>
            {data.open ? 'OPEN' : 'ENDED'}
          </T>
        </View>
        <T size={11.5} color={colors.muted} numberOfLines={2} style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
          {pollTiming(data)}
        </T>
      </View>

      {onOpen ? (
        <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel={`Open vote: ${data.question}`} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T weight="bold" size={15.5} color={colors.navy} style={{ lineHeight: 21 }}>
            {data.question}
          </T>
        </Pressable>
      ) : (
        <T weight="bold" size={15.5} color={colors.navy} style={{ lineHeight: 21 }} accessibilityRole="header">
          {data.question}
        </T>
      )}
      {data.description ? (
        <T size={13} color={colors.textSoft} style={{ lineHeight: 19 }}>
          {data.description}
        </T>
      ) : null}

      {data.result ? (
        <View style={styles.result} testID="poll-result">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="ribbon" size={16} color={colors.goldDark} />
            <T weight="extrabold" size={11.5} color={colors.goldText} style={{ letterSpacing: 0.6 }}>
              RESULT
            </T>
            {data.resultPublishedAt ? (
              <T size={11} color={colors.goldText} style={{ marginLeft: 'auto' }}>
                {formatDate(data.resultPublishedAt)}
              </T>
            ) : null}
          </View>
          <T weight="semibold" size={13.5} color={colors.navy} style={{ lineHeight: 20 }}>
            {data.result}
          </T>
        </View>
      ) : null}

      {showResults ? (
        <View style={{ gap: 10, marginTop: 2 }}>
          {data.options.map((o) => {
            const isMine = String(o._id) === String(data.myVote);
            const pct = pollPercent(o.votes, total);
            const leading = !data.open && total > 0 && (o.votes || 0) === top;
            return (
              <View key={o._id} accessible accessibilityLabel={`${o.label}: ${o.votes || 0} votes, ${pct} percent${isMine ? ', your vote' : ''}`} style={{ gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {isMine ? <Ionicons name="checkmark-circle" size={16} color={colors.green} /> : null}
                  <T weight={isMine || leading ? 'bold' : 'semibold'} size={13.5} color={colors.text} numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>
                    {o.label}
                  </T>
                  <T weight="bold" size={12.5} color={colors.textSoft} style={{ flexShrink: 0 }}>
                    {o.votes || 0} vote{(o.votes || 0) === 1 ? '' : 's'} · {pct}%
                  </T>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${pct}%`, backgroundColor: isMine || leading ? colors.gold : colors.navySoft }]} />
                </View>
              </View>
            );
          })}
          <T size={12} color={colors.muted}>
            {total} vote{total === 1 ? '' : 's'} in total
          </T>
        </View>
      ) : (
        <View style={{ gap: 8, marginTop: 2 }}>
          {data.options.map((o) => {
            const isSending = sending === String(o._id);
            return (
              <Pressable
                key={o._id}
                onPress={() => vote(o)}
                disabled={!!sending}
                accessibilityRole="button"
                accessibilityLabel={`Vote ${o.label}`}
                accessibilityState={{ disabled: !!sending, busy: isSending }}
                testID={`vote-option-${o.label}`}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed, !!sending && !isSending && { opacity: 0.55 }]}
              >
                <T weight="bold" size={14} color={colors.navy} numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>
                  {o.label}
                </T>
                {isSending ? <ActivityIndicator size="small" color={colors.navy} /> : <Ionicons name="chevron-forward" size={18} color={colors.goldDark} />}
              </Pressable>
            );
          })}
          <T size={12} color={colors.muted}>
            Tap your answer to vote. Results show after you vote.
          </T>
        </View>
      )}

      {voted ? (
        <View style={styles.youVoted}>
          <Ionicons name="checkmark-done" size={16} color={colors.green} />
          <T weight="bold" size={12.5} color={colors.green} style={{ flex: 1 }}>
            You voted: {mine?.label || 'recorded'}
          </T>
        </View>
      ) : !data.open ? (
        <T size={12} color={colors.muted}>
          You didn’t vote on this one.
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  option: { minHeight: 50, borderWidth: 1.5, borderColor: colors.inputBorder, backgroundColor: colors.inputBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionPressed: { borderColor: colors.gold, backgroundColor: colors.goldLight, transform: [{ scale: 0.99 }] },
  track: { height: 10, borderRadius: 999, backgroundColor: colors.divider, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 999 },
  result: { backgroundColor: colors.goldLight, borderWidth: 1, borderColor: colors.gold, borderRadius: 12, padding: 12, gap: 6 },
  youVoted: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.greenBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
});
