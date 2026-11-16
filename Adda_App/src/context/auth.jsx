import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, session } from '../lib/api';
import { normalizePhone } from '../lib/validation';

const AuthContext = createContext(null);

/**
 * Session + profile state. status: 'booting' | 'signedOut' | 'signedIn' | 'offline'.
 * Three kinds of sign-in share this app:
 *  - members (accountType member): an approved membership unlocks the society area;
 *  - vendors (accountType vendor): the vendor area only, never a society;
 *  - gate staff (`role: 'gate'`, POST /auth/gate/login): only the (gate) screens — the server refuses gate sessions
 *    everywhere else (403 GATE_ACCOUNT), so their profile comes from GET /gate/me instead of /me.
 */
export function AuthProvider({ children, onSessionExpired }) {
  const [status, setStatus] = useState('booting');
  const [profile, setProfile] = useState(null);
  const [bootError, setBootError] = useState(null);
  const expiredRef = useRef(onSessionExpired);
  useEffect(() => {
    expiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  const applyProfile = useCallback(async (p) => {
    setProfile(p);
    if (p?.role === 'gate') return session.setSociety(null);
    const approved = (p?.memberships || []).filter((m) => m.status === 'approved' && m.society?.status !== 'suspended');
    const keep = approved.find((m) => String(m.society?._id) === session.societyId);
    await session.setSociety(keep ? keep.society._id : approved[0]?.society?._id || null);
  }, []);

  /** A gate session's profile: GET /gate/me → { user, gate }. */
  const fetchGateProfile = useCallback(async () => {
    const r = await api('/gate/me');
    return { role: 'gate', user: r.user, gate: r.gate, memberships: [] };
  }, []);

  const loadProfile = useCallback(async () => {
    const p = session.role === 'gate' ? await fetchGateProfile() : await api('/me');
    await applyProfile(p);
    return p;
  }, [applyProfile, fetchGateProfile]);

  /** Works out the session state from storage + server. Returns the outcome instead of setting state. */
  const resolveSession = useCallback(async () => {
    try {
      const has = await session.load();
      if (!has) return { status: 'signedOut' };
      return { status: 'signedIn', profile: session.role === 'gate' ? await fetchGateProfile() : await api('/me') };
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'NETWORK' || err.code === 'TIMEOUT' || err.status >= 500)) {
        return { status: 'offline', error: err };
      }
      await session.clear();
      return { status: 'signedOut' };
    }
  }, [fetchGateProfile]);

  const applyOutcome = useCallback(
    async (o) => {
      if (o.profile) await applyProfile(o.profile);
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
    session.onEnded(() => {
      setProfile(null);
      setStatus('signedOut');
      expiredRef.current?.();
    });
    resolveSession().then((o) => alive && applyOutcome(o));
    return () => {
      alive = false;
    };
  }, [resolveSession, applyOutcome]);

  const finishSignIn = useCallback(
    async (result) => {
      await session.save(result);
      await session.setRole(null);
      await applyProfile({ user: result.user, vendor: result.vendor, memberships: result.memberships, staffRoles: result.staffRoles, needsProfile: result.needsProfile });
      setStatus('signedIn');
    },
    [applyProfile],
  );

  /**
   * Phone + password sign-in with the Member / Vendor switch. The server refuses a mismatch with
   * 403 ACCOUNT_TYPE_MISMATCH (no session is created); `err.accountType` then holds the other type.
   */
  const signIn = useCallback(
    async (phone, password, accountType) => {
      try {
        const result = await api('/auth/resident/login', { method: 'POST', auth: false, body: { phone: normalizePhone(phone), password, deviceName: 'NIVASA app', ...(accountType && { accountType }) } });
        await finishSignIn(result);
      } catch (err) {
        if (err?.code === 'ACCOUNT_TYPE_MISMATCH') err.accountType = accountType === 'vendor' ? 'member' : 'vendor';
        throw err;
      }
    },
    [finishSignIn],
  );

  /** Sign-up. Vendors may also send their shop name and shop location ({lat,lng,label?}). */
  const register = useCallback(
    async ({ name, phone, password, accountType = 'member', shopName, location }) => {
      const vendor = accountType === 'vendor';
      const body = {
        name: name.trim(),
        phone: normalizePhone(phone),
        password,
        accountType,
        deviceName: 'NIVASA app',
        ...(vendor && shopName?.trim() && { shopName: shopName.trim() }),
        ...(vendor && location && { location }),
      };
      const result = await api('/auth/resident/register', { method: 'POST', auth: false, body });
      await finishSignIn(result);
    },
    [finishSignIn],
  );

  /** Gate staff sign-in (email + password). The session only reaches the (gate) screens. */
  const gateLogin = useCallback(
    async (email, password) => {
      const result = await api('/auth/gate/login', { method: 'POST', auth: false, body: { email: email.trim().toLowerCase(), password, deviceName: 'NIVASA app (gate)' } });
      await session.save(result);
      await session.setRole('gate');
      await applyProfile({ role: 'gate', user: result.user, gate: result.gate, memberships: [] });
      setStatus('signedIn');
    },
    [applyProfile],
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
    const isGate = profile?.role === 'gate';
    const memberships = isGate ? [] : profile?.memberships || [];
    const approved = memberships.filter((m) => m.status === 'approved' && m.society?.status !== 'suspended');
    const isVendor = !isGate && profile?.user?.accountType === 'vendor';
    const active = isVendor || isGate ? null : approved.find((m) => String(m.society?._id) === session.societyId) || approved[0] || null;
    return {
      status,
      bootError,
      retryBoot: boot,
      role: isGate ? 'gate' : isVendor ? 'vendor' : 'member',
      isGate,
      gate: isGate ? profile?.gate || null : null,
      user: profile?.user || null,
      memberships,
      activeMembership: active,
      isMember: !!active,
      isVendor,
      accountType: isGate ? null : profile?.user?.accountType || 'member',
      vendor: isVendor ? profile?.vendor || null : null,
      pendingMembership: memberships.find((m) => m.status === 'pending') || null,
      signIn,
      register,
      gateLogin,
      signOut,
      refreshProfile: loadProfile,
      selectSociety: async (id) => {
        await session.setSociety(id);
        setProfile((p) => ({ ...p }));
      },
    };
  }, [status, bootError, boot, profile, signIn, register, gateLogin, signOut, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
