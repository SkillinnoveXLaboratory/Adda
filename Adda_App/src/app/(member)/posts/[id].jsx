import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PostCard } from '../../../components/PostCard';
import { AsyncView, DetailHeader, IconButton, LoadingList, Screen, SectionTitle, T, returnTo } from '../../../components/ui';
import { useToast } from '../../../context/toast';
import { useAction, useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { confirm } from '../../../lib/dialog';
import { timeAgo } from '../../../lib/format';
import { colors, fonts } from '../../../theme';

const REPORT_REASONS = ['Spam or advertising', 'Abusive or offensive', 'Misleading information', 'Other'];

export default function PostDetail() {
  const { id } = useLocalSearchParams();
  const toast = useToast();
  const post = useApi(`/resident/posts/${id}`);
  const [comment, setComment] = useState('');
  const [reporting, setReporting] = useState(null);

  const [send, sending] = useAction(async () => {
    if (!comment.trim()) return;
    try {
      const c = await api(`/resident/posts/${id}/comments`, { method: 'POST', body: { body: comment.trim() } });
      setComment('');
      post.setData((d) => ({ ...d, commentCount: d.commentCount + 1, comments: [...d.comments, c] }));
    } catch (err) {
      toast.error(err.message);
    }
  });

  const [report, reportBusy] = useAction(async (target, reason) => {
    try {
      const r = await api(`/resident/${target.type}s/${target.id}/report`, { method: 'POST', body: { reason } });
      toast.success(r.message || 'Reported to moderators');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReporting(null);
    }
  });

  const removePost = async () => {
    const ok = await confirm({ title: 'Delete post?', message: 'This removes your post for everyone.', confirmText: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await api(`/resident/posts/${id}`, { method: 'DELETE' });
      toast.success('Post deleted');
      returnTo('/community');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Screen
      header={
        <DetailHeader
          title="Discussion"
          fallback="/community"
          right={
            post.data ? (
              post.data.mine ? (
                <IconButton icon="trash-outline" label="Delete post" color={colors.danger} onPress={removePost} />
              ) : (
                <IconButton icon="flag-outline" label="Report post" color={colors.muted} onPress={() => setReporting({ type: 'post', id })} />
              )
            ) : null
          }
        />
      }
      refreshing={post.refreshing}
      onRefresh={post.refresh}
      footer={
        post.data ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 14, paddingLeft: 12, paddingRight: 6, paddingVertical: 6 }}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Write a comment"
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={2000}
              maxFontSizeMultiplier={1.3}
              accessibilityLabel="Comment"
              style={{ flex: 1, maxHeight: 110, fontFamily: fonts.medium, fontSize: 15, color: colors.text, paddingVertical: 8, outlineStyle: 'none' }}
            />
            <Pressable onPress={send} disabled={sending || !comment.trim()} accessibilityRole="button" accessibilityLabel="Send comment" style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: comment.trim() ? '#0b1a30' : '#cbd5e1', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="send" size={18} color={colors.white} />
            </Pressable>
          </View>
        ) : null
      }
    >
      <AsyncView state={post} skeleton={<LoadingList rows={2} card={150} />}>
        {(d) => (
          <>
            <PostCard post={d} compact={false} />
            {reporting ? (
              <View style={{ backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 }}>
                <T weight="bold" size={14}>
                  Why are you reporting this {reporting.type}?
                </T>
                {REPORT_REASONS.map((r) => (
                  <Pressable key={r} disabled={reportBusy} onPress={() => report(reporting, r)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider }} accessibilityRole="button">
                    <T size={14}>{r}</T>
                  </Pressable>
                ))}
                <Pressable onPress={() => setReporting(null)} style={{ paddingVertical: 8 }} accessibilityRole="button">
                  <T weight="bold" size={14} color={colors.muted}>
                    Cancel
                  </T>
                </Pressable>
              </View>
            ) : null}
            <SectionTitle title={`Comments (${d.comments.length})`} />
            {d.comments.length === 0 ? (
              <T size={13} color={colors.muted}>
                No comments yet — start the conversation.
              </T>
            ) : (
              d.comments.map((c) => (
                <View key={c._id} style={{ backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <T weight="bold" size={13}>
                      {c.mine ? 'You' : c.author?.name || 'Resident'}
                    </T>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <T size={11.5} color={colors.muted}>
                        {timeAgo(c.createdAt)}
                      </T>
                      {!c.mine ? <IconButton icon="flag-outline" label="Report comment" size={16} color="#94a3b8" onPress={() => setReporting({ type: 'comment', id: c._id })} style={{ minWidth: 32, minHeight: 32 }} /> : null}
                    </View>
                  </View>
                  <T size={14} color="#334155">
                    {c.body}
                  </T>
                </View>
              ))
            )}
          </>
        )}
      </AsyncView>
    </Screen>
  );
}
