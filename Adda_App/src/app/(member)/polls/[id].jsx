import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AsyncView, Button, DetailHeader, LoadingList, Screen } from '../../../components/ui';
import { PollCard } from '../../../components/PollCard';
import { useApi } from '../../../hooks/useApi';

/** One society vote — opened from a "Poll" notification or the Voting list. */
export default function PollDetail() {
  const { id } = useLocalSearchParams();
  const poll = useApi(`/resident/polls/${id}`);
  return (
    <Screen refreshing={poll.refreshing} onRefresh={poll.refresh} header={<DetailHeader title="Vote" fallback="/polls" />}>
      <AsyncView state={poll} skeleton={<LoadingList rows={1} card={260} />}>
        {(p) => (
          <View style={{ gap: 14 }}>
            <PollCard key={`${p._id}-${p.open}-${p.myVote}-${p.totalVotes}-${p.result || ''}`} poll={p} onChanged={poll.refresh} />
            <Button title="All society votes" icon="list" variant="alt" onPress={() => router.navigate('/polls')} />
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}
