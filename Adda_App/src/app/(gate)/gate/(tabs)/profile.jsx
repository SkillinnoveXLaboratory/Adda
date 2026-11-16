import { StyleSheet, View } from 'react-native';
import { Avatar, Button, Card, Divider, KeyValue, Screen, SectionTitle, T } from '../../../../components/ui';
import { GateHeader, GateSocietyLogo, useGate } from '../../../../components/GateKit';
import { useAuth } from '../../../../context/auth';
import { useAction, useApi } from '../../../../hooks/useApi';
import { absoluteUrl } from '../../../../lib/api';
import { confirm } from '../../../../lib/dialog';
import { timeAgo } from '../../../../lib/format';
import { colors } from '../../../../theme';

const COUNTS = [
  ['expected', 'Expected'],
  ['approved', 'Approved'],
  ['inside', 'Inside'],
  ['exited', 'Left'],
];

/** Gate profile: the society this account guards (logo + name), the gateman, today's numbers, notes sent, sign out. */
export default function GateProfile() {
  const { society, user, me, reload } = useGate();
  const { signOut } = useAuth();
  const notes = useApi('/gate/notes', { query: { limit: 5 } });
  const t = me?.today || {};
  const [logout, busy] = useAction(async () => {
    const ok = await confirm({ title: 'Sign out?', message: 'You will need your email and password to sign in again.', confirmText: 'Sign out', destructive: true });
    if (ok) await signOut();
  });

  return (
    <Screen
      refreshing={notes.refreshing}
      onRefresh={() => {
        reload?.();
        notes.refresh();
      }}
      header={<GateHeader society={society} subtitle="Gate security profile" />}
    >
      <Card style={{ alignItems: 'center', gap: 8 }}>
        <GateSocietyLogo uri={absoluteUrl(society?.logoUrl)} size={72} />
        <T weight="extrabold" size={17} color={colors.navy} style={{ textAlign: 'center' }} numberOfLines={2}>
          {society?.name || 'Your society'}
        </T>
        <T size={12.5} color={colors.muted} numberOfLines={1}>
          {[society?.city, society?.code ? `Code ${society.code}` : null].filter(Boolean).join(' · ') || 'Gate security'}
        </T>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={user?.name || 'Gate'} size={46} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="bold" size={15} color={colors.navy} numberOfLines={1}>
              {user?.name || 'Gate staff'}
            </T>
            <T size={12.5} color={colors.muted} numberOfLines={1}>
              {user?.email || ''}
            </T>
          </View>
        </View>
        <Divider />
        <KeyValue label="Role" value="Gate security" />
      </Card>

      <SectionTitle title="Today at the gate" />
      <View style={styles.counts}>
        {COUNTS.map(([k, label]) => (
          <View key={k} style={styles.count}>
            <T weight="extrabold" size={20} color={colors.navy}>
              {me ? t[k] || 0 : '–'}
            </T>
            <T size={11} color={colors.muted} numberOfLines={1}>
              {label}
            </T>
          </View>
        ))}
      </View>

      <SectionTitle title="Notes you sent" />
      {notes.data?.items?.length ? (
        <Card style={{ gap: 10 }}>
          {notes.data.items.map((n, i) => (
            <View key={n._id} style={[{ gap: 2 }, i > 0 && styles.sep]}>
              <T weight="bold" size={12.5} color={colors.navy} numberOfLines={1}>
                To {n.member?.name || 'member'}
                {n.visitor ? ` · about ${n.visitor.name}` : ''}
              </T>
              <T size={12.5} color={colors.textSoft} numberOfLines={3}>
                {n.text}
              </T>
              <T size={11} color={colors.subtle}>
                {timeAgo(n.createdAt)} · {n.readAt ? 'Read' : 'Not read yet'}
              </T>
            </View>
          ))}
        </Card>
      ) : (
        <T size={13} color={colors.muted}>
          {notes.loading ? 'Loading…' : notes.error ? notes.error.message : 'No notes yet. Use “Note” on the Members tab to tell a member something.'}
        </T>
      )}

      <Button title="Sign out" icon="log-out-outline" variant="danger" onPress={logout} loading={busy} style={{ marginTop: 6 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  counts: { flexDirection: 'row', gap: 8 },
  count: { flex: 1, minWidth: 0, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' },
  sep: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 },
});
