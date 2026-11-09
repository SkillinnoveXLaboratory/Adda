import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, setSessionEndHandler } from './api.js';
import { session } from './session.js';

const AuthContext = createContext(null);

const fromResponse = (res) => ({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user, vendor: res.vendor || null });

/** Vendor sessions only (client `vendor`). Member accounts are refused by the server (403 NOT_VENDOR). */
export function AuthProvider({ children }) {
  const [state, setState] = useState(() => session.get());
  const [endReason, setEndReason] = useState(null);

  useEffect(() => session.subscribe((s) => setState(s)), []);
  useEffect(() => {
    setSessionEndHandler((reason) => setEndReason(reason));
    return () => setSessionEndHandler(null);
  }, []);

  /** Re-reads /me (name, KYC status). Pages call it after actions that change the profile. */
  const refreshProfile = useCallback(async () => {
    if (!session.get()?.accessToken) return null;
    const me = await api.get('/me');
    if (session.get()) session.patch({ user: me.user, vendor: me.vendor || null }, 'profile');
    return me;
  }, []);

  // On reload with a stored session, refresh the profile (KYC may have been reviewed meanwhile).
  useEffect(() => {
    refreshProfile().catch(() => {
      /* the api client already handled a dead session */
    });
  }, [refreshProfile]);

  const accept = useCallback((res) => {
    if (res?.user?.accountType && res.user.accountType !== 'vendor') throw new ApiError(403, 'NOT_VENDOR', 'This is a member account. Members use the NIVASA app.');
    session.set(fromResponse(res), 'login');
    setEndReason(null);
    return res;
  }, []);

  const login = useCallback(async (phone, password) => accept(await api.post('/auth/vendor/login', { phone, password }, { auth: false })), [accept]);

  const register = useCallback(async ({ phone, name, businessName, password }) => accept(await api.post('/auth/vendor/register', { phone, name, ...(businessName ? { businessName } : {}), password }, { auth: false })), [accept]);

  const logout = useCallback(async ({ everywhere = false } = {}) => {
    try {
      if (session.accessToken) await api.post(everywhere ? '/auth/logout-all' : '/auth/logout', {}, { retry: false });
    } catch (err) {
      if (everywhere) throw err;
      /* the local sign-out below is what matters */
    }
    session.clear('logout');
    setEndReason('logout');
  }, []);

  const value = useMemo(() => {
    const user = state?.user || null;
    const vendor = state?.vendor || null;
    return {
      isAuthenticated: Boolean(state?.accessToken && user),
      user,
      vendor,
      kycStatus: vendor?.kycStatus || 'not_submitted',
      verified: vendor?.kycStatus === 'approved',
      login,
      register,
      logout,
      refreshProfile,
      endReason,
      clearEndReason: () => setEndReason(null),
    };
  }, [state, login, register, logout, refreshProfile, endReason]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
