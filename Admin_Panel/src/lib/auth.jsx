import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, setSessionEndHandler } from './api.js';
import { session } from './session.js';

const AuthContext = createContext(null);

/** Master Admin sign-in: email + password, platform owner (super_admin) only. */
export function AuthProvider({ children }) {
  const [state, setState] = useState(() => session.get());
  const [endReason, setEndReason] = useState(null);

  useEffect(() => session.subscribe((s) => setState(s)), []);
  useEffect(() => {
    setSessionEndHandler((reason) => setEndReason(reason));
    return () => setSessionEndHandler(null);
  }, []);

  // On reload with a stored session, refresh the profile.
  useEffect(() => {
    if (!session.get()?.accessToken) return;
    api
      .get('/me')
      .then((me) => session.get() && session.patch({ user: me.user }, 'profile'))
      .catch(() => {
        /* the api client already handled a dead session */
      });
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/admin/login', { email, password }, { auth: false });
    if (res?.user?.platformRole !== 'super_admin') {
      // A society admin's password worked, but this console is not for them: end that session at once.
      if (res?.accessToken) await api.post('/auth/logout', {}, { auth: false, headers: { Authorization: `Bearer ${res.accessToken}` } }).catch(() => {});
      throw new ApiError(403, 'NOT_OWNER', 'This console is only for the platform owner. Society admins sign in at the Society Admin panel.');
    }
    session.set({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user, scope: null }, 'login');
    setEndReason(null);
    return res;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (session.accessToken) await api.post('/auth/logout', {}, { retry: false });
    } catch {
      /* the local sign-out below is what matters */
    }
    session.clear('logout');
    setEndReason('logout');
  }, []);

  /** Society workspace: the reused society-admin screens act on this society (see scopePath in api.js). */
  const enterSociety = useCallback((society) => {
    session.patch({ scope: { _id: society._id, name: society.name, code: society.code, status: society.status, city: society.city } }, 'scope');
  }, []);
  const exitSociety = useCallback(() => session.patch({ scope: null }, 'scope'), []);

  const value = useMemo(() => {
    const user = state?.user || null;
    const scope = state?.scope || null;
    return {
      isAuthenticated: Boolean(state?.accessToken && user),
      user,
      isSuperAdmin: user?.platformRole === 'super_admin',
      // Shape expected by the reused society screens: the owner acts with full admin rights.
      society: scope,
      societyId: scope?._id || null,
      role: 'admin',
      staffRoles: [],
      can: () => true,
      login,
      logout,
      enterSociety,
      exitSociety,
      endReason,
      clearEndReason: () => setEndReason(null),
    };
  }, [state, login, logout, enterSociety, exitSociety, endReason]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
