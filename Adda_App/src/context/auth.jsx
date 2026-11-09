import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, session } from '../lib/api';
import { normalizePhone } from '../lib/validation';

const AuthContext = createContext(null);

/**
 * Session + profile state. status: 'booting' | 'signedOut' | 'signedIn' | 'offline'.
 * Members only: an approved membership unlocks the society area. Vendor accounts use the NIVASA Vendor Panel
 * website — the server refuses them here (VENDOR_USE_PANEL) and `vendorNotice` tells the person where to go.
 */
export function AuthProvider({ children, onSessionExpired }) {
  const [status, setStatus] = useState('booting');
  const [profile, setProfile] = useState(null);
  const [bootError, setBootError] = useState(null);
  const [vendorNotice, setVendorNotice] = useState(false);
  const expiredRef = useRef(onSessionExpired);
  useEffect(() => {
    expiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  const applyProfile = useCallback(async (p) => {
    setProfile(p);
    const approved = (p?.memberships || []).filter((m) => m.status === 'approved' && m.society?.status !== 'suspended');
    const keep = approved.find((m) => String(m.society?._id) === session.societyId);
    await session.setSociety(keep ? keep.society._id : approved[0]?.society?._id || null);
  }, []);

  const loadProfile = useCallback(async () => {
    const p = await api('/me');
    await applyProfile(p);
    return p;
  }, [applyProfile]);

  /** Works out the session state from storage + server. Returns the outcome instead of setting state. */
  const resolveSession = useCallback(async () => {
    try {
      const has = await session.load();
      if (!has) return { status: 'signedOut' };
      return { status: 'signedIn', profile: await api('/me') };
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'NETWORK' || err.code === 'TIMEOUT' || err.status >= 500)) {
        return { status: 'offline', error: err };
      }
      await session.clear();
      return { status: 'signedOut', vendor: err?.code === 'VENDOR_USE_PANEL' };
    }
  }, []);

  const applyOutcome = useCallback(
    async (o) => {
      if (o.profile) await applyProfile(o.profile);
      if (o.vendor) setVendorNotice(true);
      setBootError(o.error || null);
      setStatus(o.status);
    },
    [applyProfile],
  );

  const boot = useCallback(() => {
    setBootError(null);
    setStatus('booting');
    return resolveSession().then(applyOutcome);
  }, [resolveSession, applyOutcome]);

  useEffect(() => {
    let alive = true;
    session.onEnded((reason) => {
      setProfile(null);
      setStatus('signedOut');
      // An old vendor session from before vendors moved to the Vendor Panel: say where to go, not "session ended".
      if (reason === 'VENDOR_USE_PANEL') setVendorNotice(true);
      else expiredRef.current?.();
    });
    resolveSession().then((o) => alive && applyOutcome(o));
    return () => {
      alive = false;
    };
  }, [resolveSession, applyOutcome]);

  const finishSignIn = useCallback(
    async (result) => {
      await session.save(result);
      await applyProfile({ user: result.user, memberships: result.memberships, staffRoles: result.staffRoles, needsProfile: result.needsProfile });
      setVendorNotice(false);
      setStatus('signedIn');
    },
    [applyProfile],
  );

  /** Phone + password sign-in. Vendor accounts get 403 VENDOR_USE_PANEL (thrown; no session is created). */
  const signIn = useCallback(
    async (phone, password) => {
      const result = await api('/auth/resident/login', { method: 'POST', auth: false, body: { phone: normalizePhone(phone), password, deviceName: 'NIVASA app' } });
      await finishSignIn(result);
    },
    [finishSignIn],
  );

  /** Member sign-up (the app never sends an account type: vendors sign up on the Vendor Panel). */
  const register = useCallback(
    async ({ name, phone, password }) => {
      const result = await api('/auth/resident/register', { method: 'POST', auth: false, body: { name: name.trim(), phone: normalizePhone(phone), password, deviceName: 'NIVASA app' } });
      await finishSignIn(result);
    },
    [finishSignIn],
  );

  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // The local session is cleared regardless; the server session expires on its own.
    }
    await session.clear();
    setProfile(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo(() => {
    const memberships = profile?.memberships || [];
    const approved = memberships.filter((m) => m.status === 'approved' && m.society?.status !== 'suspended');
    const active = approved.find((m) => String(m.society?._id) === session.societyId) || approved[0] || null;
    return {
      status,
      bootError,
      retryBoot: boot,
      user: profile?.user || null,
      memberships,
      activeMembership: active,
      isMember: !!active,
      pendingMembership: memberships.find((m) => m.status === 'pending') || null,
      vendorNotice,
      dismissVendorNotice: () => setVendorNotice(false),
      signIn,
      register,
      signOut,
      refreshProfile: loadProfile,
      selectSociety: async (id) => {
        await session.setSociety(id);
        setProfile((p) => ({ ...p }));
      },
    };
  }, [status, bootError, boot, profile, vendorNotice, signIn, register, signOut, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
