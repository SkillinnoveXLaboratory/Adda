import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Steps } from '../../components/AuthKit';
import { Avatar, Badge, Card, EmptyState, ErrorState, IconButton, ListRow, LoadingList, Screen, SearchBar, SectionTitle, T } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { api } from '../../lib/api';
import { confirm, notify } from '../../lib/dialog';
import { formatDate } from '../../lib/format';
import { colors } from '../../theme';

/** Society search: the resident finds their registered society and starts a membership request. */
export default function SocietySearch() {
  const { user, memberships, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [state, setState] = useState({ loading: true, items: [], error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const pending = memberships.find((m) => m.status === 'pending');
  const closed = memberships.filter((m) => ['rejected', 'suspended'].includes(m.status));

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await api('/public/societies', { auth: false, query: { q: q.trim() } });
        if (alive) setState({ loading: false, items: res.items || [], error: null });
      } catch (error) {
        if (alive) setState({ loading: false, items: [], error });
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, reloadKey]);

  const confirmSignOut = async () => {
    if (await confirm({ title: 'Sign out?', message: 'You can sign back in any time with your mobile number and password.', confirmText: 'Sign out', destructive: true })) signOut();
  };

  return (
    <Screen
      header={
        <View style={{ backgroundColor: colors.white, paddingTop: insets.top + 10, paddingHorizontal: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <StatusBar style="dark" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={user?.name} size={42} />
            <View style={{ flex: 1 }}>
              <T size={12} color={colors.muted}>
                Signed in as
              </T>
              <T weight="extrabold" size={16} numberOfLines={1}>
                {user?.name || 'Resident'}
              </T>
            </View>
            <IconButton icon="person-circle-outline" label="Edit profile" onPress={() => router.push('/edit-profile')} />
            <IconButton icon="log-out-outline" label="Sign out" color={colors.danger} onPress={confirmSignOut} />
          </View>
          <View style={{ marginTop: 16 }}>
            <Steps total={3} current={3} />
          </View>
        </View>
      }
    >
      {pending ? (
        <Card onPress={() => router.push('/membership')} accessibilityLabel="View membership request status" style={{ backgroundColor: '#f4ecd8', borderColor: '#e7cf7d' }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.amberBg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="hourglass-outline" size={22} color={colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="extrabold" size={15}>
                Request awaiting approval
              </T>
              <T size={12.5} color={colors.muted} numberOfLines={2}>
                {pending.society?.name} · {pending.building?.name} {pending.flat?.number} · sent {formatDate(pending.createdAt)}
              </T>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </View>
        </Card>
      ) : (
        <View style={{ gap: 4 }}>
          <T weight="extrabold" size={22}>
            Find your society
          </T>
          <T size={14} color={colors.muted}>
            Search by society name, area, city or society code. Your society office will verify and approve your request.
          </T>
        </View>
      )}

      {closed.map((m) => (
        <ListRow
          key={m._id}
          icon={m.status === 'rejected' ? 'close-circle-outline' : 'pause-circle-outline'}
          tone="coral"
          title={`${m.society?.name} · ${m.flat?.number || ''}`}
          subtitle={m.decisionReason ? `Reason: ${m.decisionReason}` : m.status === 'rejected' ? 'Your request was declined by the society.' : 'Your membership is suspended.'}
          right={<Badge status={m.status} />}
        />
      ))}

      <SearchBar value={q} onChangeText={setQ} placeholder="Search societies" />

      <SectionTitle title={q.trim() ? 'Results' : 'Registered societies'} />
      {state.loading ? (
        <LoadingList rows={3} card={72} />
      ) : state.error ? (
        <ErrorState error={state.error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : state.items.length === 0 ? (
        <EmptyState icon="business-outline" title={q.trim() ? 'No societies match' : 'No societies yet'} message={q.trim() ? 'Check the spelling or try the society code shared by your office.' : 'Your society needs to register on NIVASA before residents can join.'} />
      ) : (
        <View style={{ gap: 10 }}>
          {state.items.map((s) => (
            <ListRow
              key={s._id}
              icon="business-outline"
              title={s.name}
              subtitle={[s.area, s.city, s.pincode].filter(Boolean).join(', ')}
              meta={`Code ${s.code}`}
              onPress={() => (pending ? notify('Request already pending', 'Wait for your current request to be decided, or cancel it from the status screen first.') : router.push({ pathname: '/join', params: { societyId: s._id } }))}
            />
          ))}
        </View>
      )}

      <SectionTitle title="Explore while you wait" style={{ marginTop: 8 }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card onPress={() => router.push('/properties')} style={{ flex: 1, alignItems: 'center', gap: 8 }} accessibilityLabel="Property marketplace">
          <Ionicons name="business" size={24} color={colors.blue} />
          <T weight="bold" size={13} style={{ textAlign: 'center' }}>
            Properties
          </T>
        </Card>
        <Card onPress={() => router.push('/marketplace')} style={{ flex: 1, alignItems: 'center', gap: 8 }} accessibilityLabel="Local marketplace">
          <Ionicons name="bag-handle" size={24} color={colors.coral} />
          <T weight="bold" size={13} style={{ textAlign: 'center' }}>
            Buy & sell
          </T>
        </Card>
      </View>
    </Screen>
  );
}
