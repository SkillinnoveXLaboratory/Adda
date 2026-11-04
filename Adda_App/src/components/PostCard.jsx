import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useToast } from '../context/toast';
import { colors } from '../theme';
import { Avatar, Badge, T } from './ui';

/** Community post (prototype .post) with optimistic like toggle. */
export function PostCard({ post, onChanged, compact = true }) {
  const toast = useToast();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likes, setLikes] = useState(post.likeCount);
  const [busy, setBusy] = useState(false);

  const toggleLike = async () => {
    if (busy) return;
    setBusy(true);
    const prev = [liked, likes];
    setLiked(!liked);
    setLikes(likes + (liked ? -1 : 1));
    try {
      const r = await api(`/resident/posts/${post._id}/like`, { method: 'POST' });
      setLiked(r.likedByMe);
      setLikes(r.likeCount);
      onChanged?.();
    } catch (err) {
      setLiked(prev[0]);
      setLikes(prev[1]);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const open = compact ? () => router.push(`/posts/${post._id}`) : undefined;
  return (
    <View style={styles.post}>
      <Pressable onPress={open} disabled={!open} accessibilityRole={open ? 'button' : undefined} style={{ gap: 10 }}>
        <View style={styles.user}>
          <Avatar name={post.author?.name} size={38} />
          <View style={{ flex: 1 }}>
            <T weight="bold" size={14} numberOfLines={1}>
              {post.author?.name || 'Resident'}
            </T>
            <T size={11.5} color={colors.muted}>
              {post.official ? 'Society announcement' : 'Resident post'} · {timeAgo(post.createdAt)}
            </T>
          </View>
          {post.official ? <Badge label="Official" tone="info" /> : null}
        </View>
        <T size={14.5} color="#334155" style={{ lineHeight: 22 }} numberOfLines={compact ? 6 : undefined}>
          {post.body}
        </T>
        {post.media?.length ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {post.media.slice(0, compact ? 3 : 6).map((m) => (
              <Image key={m._id} source={{ uri: m.url }} style={{ flex: 1, aspectRatio: post.media.length === 1 ? 16 / 10 : 1, borderRadius: 12, backgroundColor: '#f1f5f9' }} />
            ))}
          </View>
        ) : null}
      </Pressable>
      <View style={styles.actions}>
        <Pressable onPress={toggleLike} style={styles.action} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} accessibilityState={{ selected: liked }} hitSlop={6}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? '#dc2626' : '#64748b'} />
          <T weight="semibold" size={13} color={liked ? '#dc2626' : '#64748b'}>
            {likes}
          </T>
        </Pressable>
        <Pressable onPress={() => router.push(`/posts/${post._id}`)} style={styles.action} accessibilityRole="button" accessibilityLabel="Comments" hitSlop={6}>
          <Ionicons name="chatbubble-outline" size={19} color="#64748b" />
          <T weight="semibold" size={13} color="#64748b">
            {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
          </T>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 14, gap: 12 },
  user: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row', gap: 22, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
});
