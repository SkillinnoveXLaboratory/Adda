import { useEffect, useMemo } from 'react';
import { Stack } from 'expo-router';
import { GateProvider } from '../../components/GateKit';
import { useAuth } from '../../context/auth';
import { useApi } from '../../hooks/useApi';
import { colors } from '../../theme';

/**
 * Gate security area (gateman session, skills/gate-security). URLs live under /gate:
 * /gate (guests), /gate/add, /gate/members, /gate/profile, /gate/guest/:id, /gate/member/:id.
 * The society comes from the gateman's own staff record (GET /gate/me), never from anything the app sends.
 */
export default function GateLayout() {
  const auth = useAuth();
  const me = useApi('/gate/me');
  const { signOut } = auth;
  const code = me.error?.code;
  // A disabled gate account or a suspended society can't use the gate screens: end the session.
  useEffect(() => {
    if (code === 'NOT_GATEMAN' || code === 'SOCIETY_SUSPENDED' || code === 'GATE_ACCOUNT') signOut?.();
  }, [code, signOut]);

  const value = useMemo(
    () => ({ me: me.data, society: me.data?.gate?.society || auth.gate?.society || null, user: me.data?.user || auth.user || null, reload: me.refresh }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me.data, auth.gate, auth.user],
  );

  return (
    <GateProvider value={value}>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }} />
    </GateProvider>
  );
}
