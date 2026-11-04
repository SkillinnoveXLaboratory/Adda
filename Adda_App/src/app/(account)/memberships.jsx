import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, DetailHeader, EmptyState, Hint, Screen, T } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { formatDate, titleCase } from '../../lib/format';
import { colors } from '../../theme';

/** All of the user's society memberships; the active one drives the resident area. */
export default function Memberships() {
  const { memberships, activeMembership, selectSociety } = useAuth();
  const approved = memberships.filter((m) => m.status === 'approved');
  return (
    <Screen header={<DetailHeader title="Societies & memberships" fallback="/" />}>
      {memberships.length === 0 ? <EmptyState icon="business-outline" title="No memberships" message="Join your society to unlock bills, complaints and more." /> : null}
      {memberships.map((m) => {
        const active = activeMembership?._id === m._id;
        return (
          <Card key={m._id} onPress={m.status === 'approved' && !active ? () => selectSociety(m.society._id).then(() => router.replace('/home')) : undefined} style={[{ gap: 6 }, active && { borderColor: colors.blue, borderWidth: 1.5 }]} accessibilityLabel={m.society?.name}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="business" size={20} color={active ? colors.blue : '#94a3b8'} />
              <T weight="bold" size={15} style={{ flex: 1 }} numberOfLines={1}>
                {m.society?.name}
              </T>
              <Badge status={m.status} />
            </View>
            <T size={13} color={colors.muted}>
              {m.building?.name} · Flat {m.flat?.number} · {titleCase(m.residentType)}
            </T>
            <T size={12} color={colors.subtle}>
              Requested {formatDate(m.createdAt)}
              {m.decisionReason ? ` · ${m.decisionReason}` : ''}
            </T>
            {active ? (
              <T weight="bold" size={12} color={colors.blue}>
                Currently viewing
              </T>
            ) : m.status === 'approved' ? (
              <T weight="bold" size={12} color={colors.link}>
                Tap to switch to this society
              </T>
            ) : null}
          </Card>
        );
      })}
      {approved.length > 1 ? <Hint>You belong to more than one society. Tap a society above to switch the app to it.</Hint> : null}
    </Screen>
  );
}
