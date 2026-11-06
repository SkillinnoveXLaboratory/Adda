import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useToast } from '../context/toast';
import { colors } from '../theme';
import { T } from './ui';

/** Community poll (prototype .poll). Results are shown after voting or when the poll is closed. */
export function PollCard({ poll, onVoted }) {
  const toast = useToast();
  const [data, setData] = useState(poll);
  const [voting, setVoting] = useState(null);
  const showResults = !!data.myVote || !data.open;
  const max = Math.max(1, ...data.options.map((o) => o.votes || 0));

  const vote = async (optionId) => {
    if (voting || showResults) return;
    setVoting(optionId);
    try {
      const r = await api(`/resident/polls/${data._id}/vote`, { method: 'POST', body: { optionId } });
      setData((d) => ({ ...d, myVote: r.myVote, totalVotes: r.totalVotes, options: r.options }));
      toast.success('Vote recorded');
      onVoted?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setVoting(null);
    }
  };

  return (
    <View style={styles.poll}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T weight="extrabold" size={11.5} color="#07162c" style={{ letterSpacing: 0.5 }}>
          COMMUNITY POLL
        </T>
        <T size={11.5} color={colors.muted}>
          {data.open ? (data.closesAt ? `Closes ${formatDate(data.closesAt)}` : 'Open') : 'Closed'}
        </T>
      </View>
      <T weight="bold" size={15} style={{ marginTop: 6, marginBottom: 8 }}>
        {data.question}
      </T>
      {data.options.map((o) => {
        const mine = data.myVote === String(o._id);
        const pct = showResults && data.totalVotes ? Math.round(((o.votes || 0) / data.totalVotes) * 100) : 0;
        return (
          <Pressable
            key={o._id}
            onPress={() => vote(o._id)}
            disabled={showResults || !!voting}
            accessibilityRole="button"
            accessibilityLabel={`${o.label}${showResults ? `, ${o.votes} votes` : ''}`}
            accessibilityState={{ selected: mine, disabled: showResults }}
            style={[styles.option, mine && { borderColor: colors.blue }]}
          >
            {showResults ? <View style={[styles.bar, { width: `${((o.votes || 0) / max) * 100}%` }, mine && { backgroundColor: '#e2e8f0' }]} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              {mine ? <Ionicons name="checkmark-circle" size={16} color={colors.blue} /> : null}
              <T weight="semibold" size={13.5} numberOfLines={1} style={{ flex: 1 }}>
                {o.label}
              </T>
            </View>
            {voting === o._id ? (
              <ActivityIndicator size="small" color={colors.blue} />
            ) : showResults ? (
              <T weight="bold" size={12.5} color={colors.textSoft}>
                {pct}% · {o.votes}
              </T>
            ) : null}
          </Pressable>
        );
      })}
      <T size={12} color={colors.muted} style={{ marginTop: 4 }}>
        {showResults ? `${data.totalVotes} vote${data.totalVotes === 1 ? '' : 's'}${data.myVote ? ' · You voted' : ''}` : 'Tap an option to vote. Results appear after you vote.'}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  poll: { backgroundColor: '#f1f5f9', borderRadius: 16, padding: 14 },
  option: { minHeight: 44, marginVertical: 4, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: colors.white, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#e2e8f0' },
});
