import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { AttachmentPicker } from '../../../components/AttachmentPicker';
import { Avatar, Button, Card, DetailHeader, Screen, T, returnTo } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useToast } from '../../../context/toast';
import { useAction } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { colors, fonts } from '../../../theme';

export default function NewPost() {
  const { user, activeMembership } = useAuth();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [media, setMedia] = useState([]);
  const [publish, busy] = useAction(async () => {
    if (body.trim().length < 2) return toast.error('Write something to post');
    try {
      await api('/resident/posts', { method: 'POST', body: { body: body.trim(), media: media.map((m) => m._id) } });
      toast.success('Your post has been published');
      returnTo('/community');
    } catch (err) {
      toast.error(err.message);
    }
  });

  return (
    <Screen header={<DetailHeader title="Create post" fallback="/community" />} footer={<Button title="Publish post" icon="send" onPress={publish} loading={busy} disabled={!body.trim()} />}>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar name={user?.name} size={40} />
          <View>
            <T weight="bold" size={14}>
              {user?.name}
            </T>
            <T size={12} color={colors.muted}>
              Posting to {activeMembership?.society?.name}
            </T>
          </View>
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="What's on your mind?"
          placeholderTextColor="#94a3b8"
          multiline
          autoFocus
          maxLength={4000}
          textAlignVertical="top"
          maxFontSizeMultiplier={1.3}
          accessibilityLabel="Post text"
          style={{ minHeight: 160, fontFamily: fonts.medium, fontSize: 16, color: colors.text, outlineStyle: 'none' }}
        />
        <T size={12} color={colors.muted} style={{ textAlign: 'right' }}>
          {body.length}/4000
        </T>
      </Card>
      <AttachmentPicker value={media} onChange={setMedia} purpose="post" max={4} label="Add images" />
      <T size={12} color={colors.muted}>
        Posts are visible to approved members of your society. Be kind — moderators may hide posts that break community rules.
      </T>
    </Screen>
  );
}
