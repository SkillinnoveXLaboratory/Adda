import { Linking, Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AsyncView, Badge, DetailHeader, Divider, LoadingList, Screen, T } from '../../../components/ui';
import { useAuth } from '../../../context/auth';
import { useApi } from '../../../hooks/useApi';
import { formatDate, formatDateTime, titleCase } from '../../../lib/format';
import { colors } from '../../../theme';

export default function NoticeDetail() {
  const { id } = useLocalSearchParams();
  const { activeMembership } = useAuth();
  const n = useApi(`/resident/announcements/${id}`);
  return (
    <Screen header={<DetailHeader title="Notice" fallback="/notices" />}>
      <AsyncView state={n} skeleton={<LoadingList rows={1} card={240} />}>
        {(d) => (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Badge label={titleCase(d.category)} tone="neutral" />
              {d.important ? <Badge label="Important" tone="danger" /> : null}
            </View>
            <T weight="extrabold" size={24} style={{ lineHeight: 31 }}>
              {d.title}
            </T>
            <T size={13} color={colors.muted}>
              {formatDate(d.createdAt)} · {d.scope === 'platform' ? 'NIVASA' : activeMembership?.society?.name}
            </T>
            {d.eventDate ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 10 }}>
                <Ionicons name="calendar" size={18} color="#07162c" />
                <T weight="bold" size={13} color="#07162c">
                  {formatDateTime(d.eventDate)}
                </T>
              </View>
            ) : null}
            <Divider dashed />
            <T size={15} color="#334155" style={{ lineHeight: 25 }} selectable>
              {d.body}
            </T>
            {d.attachments?.length ? (
              <View style={{ gap: 8, marginTop: 8 }}>
                {d.attachments.map((a) => (
                  <Pressable key={a._id} onPress={() => Linking.openURL(a.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }} accessibilityRole="link">
                    <Ionicons name={a.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline'} size={20} color={colors.blue} />
                    <T weight="semibold" size={13} color={colors.blue} style={{ flex: 1 }} numberOfLines={1}>
                      {a.originalName || 'Attachment'}
                    </T>
                    <Ionicons name="open-outline" size={16} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#f1f5f9', borderRadius: 11, marginTop: 12 }}>
              <Ionicons name="information-circle-outline" size={18} color="#334155" />
              <T size={12.5} color="#334155" style={{ flex: 1 }}>
                This is an official notice from your society office.
              </T>
            </View>
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}
