import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PollCard } from '../../components/PollCard';
import { PostCard } from '../../components/PostCard';
import { Avatar, BellButton, DetailHeader, EmptyState, ErrorState, LoadingList, SectionTitle, T } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { api } from '../../lib/api';
import { colors } from '../../theme';

const PAGE = 15;

/** Society feed with infinite scroll. Polls are pinned on top. */
export default function Community() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState({ posts: [], polls: [], page: 0, pages: 1, loading: true, error: null, more: false, refreshing: false });
  const pageRef = useRef(0);

  const load = useCallback(async (mode = 'reset') => {
    setState((s) => ({ ...s, ...(mode === 'reset' && !s.posts.length ? { loading: true } : {}), ...(mode === 'refresh' ? { refreshing: true } : {}), ...(mode === 'more' ? { more: true } : {}), error: null }));
    try {
      const page = mode === 'more' ? pageRef.current + 1 : 1;
      const [feed, polls] = await Promise.all([api('/resident/posts', { query: { page, limit: PAGE } }), page === 1 ? api('/resident/polls') : Promise.resolve(null)]);
      setState((s) => ({
        ...s,
        posts: page === 1 ? feed.items : [...s.posts, ...feed.items.filter((p) => !s.posts.some((x) => x._id === p._id))],
        polls: polls ? polls.items.filter((p) => p.open).slice(0, 3) : s.polls,
        page: (pageRef.current = feed.page),
        pages: feed.pages,
        loading: false,
        refreshing: false,
        more: false,
      }));
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false, refreshing: false, more: false }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load('reset');
    }, [load]),
  );

  const header = (
    <View style={{ gap: 14, paddingBottom: 4 }}>
      <Pressable onPress={() => router.push('/posts/new')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 18, padding: 12 }} accessibilityRole="button" accessibilityLabel="Start a conversation">
        <Avatar name={user?.name} size={38} />
        <T size={14} color="#64748b" style={{ flex: 1 }}>
          Start a conversation…
        </T>
        <Ionicons name="image-outline" size={21} color="#64748b" />
      </Pressable>
      {state.polls.length ? <SectionTitle title="Open votes" action="See all" onAction={() => router.push('/polls')} style={{ marginBottom: -8 }} /> : null}
      {state.polls.map((p) => (
        <PollCard key={`${p._id}-${p.totalVotes}-${p.myVote}`} poll={p} onOpen={() => router.push(`/polls/${p._id}`)} />
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <DetailHeader title="Community" fallback="/manage" right={<BellButton onPress={() => router.push('/notifications')} />} />
      {state.loading && !state.posts.length ? (
        <View style={{ padding: 16 }}>
          <LoadingList rows={3} card={150} />
        </View>
      ) : state.error && !state.posts.length ? (
        <ErrorState error={state.error} onRetry={() => load('reset')} />
      ) : (
        <FlatList
          data={state.posts}
          keyExtractor={(p) => p._id}
          renderItem={({ item }) => <PostCard key={`${item._id}-${item.likeCount}-${item.likedByMe}`} post={item} />}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListHeaderComponent={header}
          ListHeaderComponentStyle={{ marginBottom: 12 }}
          ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title="No posts yet" message="Be the first to say hello to your neighbours." action="Write a post" onAction={() => router.push('/posts/new')} />}
          ListFooterComponent={state.more ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.blue} /> : null}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!state.more && !state.loading && state.page < state.pages) load('more');
          }}
          refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => load('refresh')} colors={[colors.gold]} tintColor={colors.navy} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
