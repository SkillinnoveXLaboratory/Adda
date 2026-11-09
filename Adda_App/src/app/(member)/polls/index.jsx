import { View } from 'react-native';
import { router } from 'expo-router';
import { BellButton, DetailHeader, EmptyState, ErrorState, LoadingList, Screen, SectionTitle } from '../../../components/ui';
import { PollCard } from '../../../components/PollCard';
import { useApi } from '../../../hooks/useApi';

const pollKey = (p) => `${p._id}-${p.open}-${p.myVote}-${p.totalVotes}-${p.result || ''}`;

/** Society votes for members: open votes first (not yet answered, then newest), then ended ones. */
export default function Polls() {
  const list = useApi('/resident/polls');
  const items = list.data?.items || [];
  // Votes still waiting for this member's answer come first.
  const open = items.filter((p) => p.open).sort((a, b) => Number(!!a.myVote) - Number(!!b.myVote));
  const ended = items.filter((p) => !p.open);
  const silent = () => list.refresh();

  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh} header={<DetailHeader title="Voting" fallback="/manage" right={<BellButton onPress={() => router.push('/notifications')} />} />}>
      {list.loading && !list.data ? (
        <LoadingList rows={2} card={220} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !items.length ? (
        <EmptyState icon="checkbox-outline" title="No votes yet" message="When your society asks residents to vote on something, it shows up here and you get a notification." />
      ) : (
        <View style={{ gap: 12 }}>
          <SectionTitle title={open.length ? `Open now (${open.length})` : 'Open now'} />
          {open.length ? (
            open.map((p) => <PollCard key={pollKey(p)} poll={p} onChanged={silent} onOpen={() => router.push(`/polls/${p._id}`)} />)
          ) : (
            <EmptyState icon="checkmark-done-outline" title="Nothing to vote on" message="There are no open votes right now. Ended votes and their results are below." />
          )}
          {ended.length ? (
            <>
              <SectionTitle title="Ended" style={{ marginTop: 6 }} />
              {ended.map((p) => (
                <PollCard key={pollKey(p)} poll={p} onChanged={silent} onOpen={() => router.push(`/polls/${p._id}`)} />
              ))}
            </>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
