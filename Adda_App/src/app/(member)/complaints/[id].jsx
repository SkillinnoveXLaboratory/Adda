import { useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AsyncView, Badge, Button, Card, DetailHeader, Field, Hint, LoadingList, Screen, SectionTitle, T } from '../../../components/ui';
import { useToast } from '../../../context/toast';
import { useAction, useApi } from '../../../hooks/useApi';
import { api } from '../../../lib/api';
import { confirm } from '../../../lib/dialog';
import { formatDate, formatDateTime, titleCase } from '../../../lib/format';
import { colors } from '../../../theme';

const FLOW = ['pending', 'assigned', 'in_progress', 'resolved', 'closed'];

export default function ComplaintDetail() {
  const { id } = useLocalSearchParams();
  const toast = useToast();
  const c = useApi(`/resident/complaints/${id}`);
  const [note, setNote] = useState('');

  const [comment, commenting] = useAction(async () => {
    if (note.trim().length < 2) return toast.error('Write a short update first');
    try {
      await api(`/resident/complaints/${id}/comments`, { method: 'POST', body: { note: note.trim() } });
      setNote('');
      toast.success('Update sent to the society office');
      c.refresh();
    } catch (err) {
      toast.error(err.message);
    }
  });

  const [act, acting] = useAction(async (action) => {
    try {
      await api(`/resident/complaints/${id}/action`, { method: 'POST', body: { action } });
      toast.success(action === 'close' ? 'Complaint closed. Thank you!' : 'Complaint reopened');
      c.refresh();
    } catch (err) {
      toast.error(err.message);
    }
  });

  return (
    <Screen header={<DetailHeader title="Complaint details" fallback="/complaints" />} refreshing={c.refreshing} onRefresh={c.refresh}>
      <AsyncView state={c} skeleton={<LoadingList rows={3} card={120} />}>
        {(d) => {
          const current = FLOW.indexOf(d.status);
          const open = !['closed', 'rejected'].includes(d.status);
          return (
            <>
              <Card style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <T weight="bold" size={12} color={colors.muted}>
                    {d.ticketNumber} · {d.category?.name}
                  </T>
                  <Badge status={d.status} />
                </View>
                <T weight="extrabold" size={19}>
                  {d.title}
                </T>
                <T size={14} color="#64748b" style={{ lineHeight: 22 }}>
                  {d.description}
                </T>
                <T size={12} color={colors.muted}>
                  Raised {formatDate(d.createdAt)} · Priority {titleCase(d.priority)}
                </T>
                {d.currentAssignment ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f1f5f9', borderRadius: 10, padding: 10 }}>
                    <Ionicons name="person-circle-outline" size={20} color="#0b1a30" />
                    <T size={13} color="#0b1a30" style={{ flex: 1 }}>
                      Assigned to {d.currentAssignment.assigneeName} ({d.currentAssignment.assigneeType})
                    </T>
                  </View>
                ) : null}
              </Card>

              {d.media?.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {d.media.map((m) =>
                    m.mimeType === 'application/pdf' ? (
                      <Pressable key={m._id} onPress={() => Linking.openURL(m.url)} style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }} accessibilityRole="link" accessibilityLabel="Open PDF attachment">
                        <Ionicons name="document-text" size={30} color="#334155" />
                        <T size={11} color="#334155">
                          PDF
                        </T>
                      </Pressable>
                    ) : (
                      <Pressable key={m._id} onPress={() => Linking.openURL(m.url)} accessibilityRole="imagebutton" accessibilityLabel="Open photo">
                        <Image source={{ uri: m.url }} style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: '#f1f5f9' }} />
                      </Pressable>
                    ),
                  )}
                </View>
              ) : null}

              {d.status === 'rejected' ? (
                <Hint tone="coral" icon="close-circle-outline">
                  The society office rejected this complaint. See the notes below for the reason.
                </Hint>
              ) : (
                <>
                  <SectionTitle title="Status" />
                  <Card style={{ paddingVertical: 8 }}>
                    {FLOW.map((s, i) => {
                      const done = i <= current;
                      return (
                        <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46 }}>
                          <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: done ? colors.greenStrong : '#cbd5e1', backgroundColor: done ? colors.greenStrong : colors.white, alignItems: 'center', justifyContent: 'center' }}>
                            {i < current || (done && s === 'closed') ? <Ionicons name="checkmark" size={15} color={colors.white} /> : <T weight="bold" size={12} color={done ? colors.white : '#94a3b8'}>{i + 1}</T>}
                          </View>
                          <T weight="bold" size={14} color={done ? '#047857' : '#94a3b8'} style={{ flex: 1 }}>
                            {titleCase(s)}
                          </T>
                          {i === current ? (
                            <T size={11.5} color={colors.muted}>
                              Current
                            </T>
                          ) : null}
                        </View>
                      );
                    })}
                  </Card>
                </>
              )}

              {d.status === 'resolved' ? (
                <View style={{ gap: 10 }}>
                  <Hint tone="green" icon="checkmark-circle-outline">
                    The society marked this as resolved. Close it if the issue is fixed, or reopen it if it isn’t.
                  </Hint>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Button title="Close" icon="checkmark" onPress={() => act('close')} loading={acting} style={{ flex: 1 }} />
                    <Button
                      title="Reopen"
                      variant="alt"
                      icon="refresh"
                      onPress={async () => (await confirm({ title: 'Reopen complaint?', message: 'The society office will be notified that the issue is not fixed.', confirmText: 'Reopen' })) && act('reopen')}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ) : null}

              <SectionTitle title="Updates" />
              {d.timeline?.length ? (
                <View style={{ gap: 8 }}>
                  {[...d.timeline].reverse().map((t) => (
                    <View key={t._id} style={{ backgroundColor: t.byRole === 'resident' ? '#f1f5f9' : '#f1f5f9', borderRadius: 12, padding: 12, gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <T weight="bold" size={12.5} color={colors.textSoft}>
                          {t.byRole === 'resident' ? 'You' : t.byRole === 'staff' ? t.by?.name || 'Society office' : 'System'} · {titleCase(t.status)}
                        </T>
                        <T size={11.5} color={colors.muted}>
                          {formatDateTime(t.at)}
                        </T>
                      </View>
                      {t.note ? (
                        <T size={13.5} color="#334155">
                          {t.note}
                        </T>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {open ? (
                <View style={{ gap: 10 }}>
                  <Field label="Add an update" value={note} onChangeText={setNote} multiline maxLength={2000} placeholder="Share more details or reply to the office…" />
                  <Button title="Send update" icon="chatbubble-ellipses-outline" variant="alt" onPress={comment} loading={commenting} />
                </View>
              ) : null}
            </>
          );
        }}
      </AsyncView>
    </Screen>
  );
}
