import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, setSessionEndHandler } from './api.js';
import { session } from './session.js';
import { can as roleCan } from './roles.js';

const AuthContext = createContext(null);

/**
 * The society to act in. Only stored (and therefore sent as X-Society-Id) when the user staffs more than one
 * society; with a single society the server resolves it on its own.
 */
export function resolveSocietyId(staffRoles = [], preferred) {
  const ids = staffRoles.map((s) => s.society?._id).filter(Boolean);
  if (ids.length < 2) return null;
  if (preferred && ids.includes(preferred)) return preferred;
  return ids[0];
}

export function homePathFor(_user, staffRoles = []) {
  if (staffRoles.length) return '/society';
  return '/login';
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(() => session.get());
  const [endReason, setEndReason] = useState(null);

  useEffect(() => session.subscribe((s) => setState(s)), []);
  useEffect(() => {
    setSessionEndHandler((reason) => setEndReason(reason));
    return () => setSessionEndHandler(null);
  }, []);

  // On reload with a stored session, refresh the profile (roles may have changed).
  useEffect(() => {
    if (!session.get()?.accessToken) return;
    api
      .get('/me')
      .then((me) => {
        if (!session.get()) return;
        const societyId = resolveSocietyId(me.staffRoles, session.societyId);
        session.patch({ user: me.user, staffRoles: me.staffRoles, memberships: me.memberships, societyId }, 'profile');
      })
      .catch(() => {
        /* api client already handled session end */
      });
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/admin/login', { email, password }, { auth: false });
    // The platform owner works in the Master Admin panel: end the session the server just opened and say where to go.
    if (res?.user?.platformRole === 'super_admin' || res?.user?.platformRole === 'sub_admin') {
      await api.post('/auth/logout', {}, { auth: false, headers: { Authorization: `Bearer ${res.accessToken}` } }).catch(() => {});
      throw new ApiError(403, 'USE_MASTER_PANEL', 'Platform owner and sub-admin accounts sign in at the Master Admin panel, not here.');
    }
    const societyId = resolveSocietyId(res.staffRoles);
    session.set({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user, staffRoles: res.staffRoles || [], memberships: res.memberships || [], societyId }, 'login');
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

  const switchSociety = useCallback((societyId) => {
    session.patch({ societyId }, 'society');
  }, []);

  const value = useMemo(() => {
    const user = state?.user || null;
    const staffRoles = state?.staffRoles || [];
    const societyId = state?.societyId || staffRoles[0]?.society?._id || null;
    const activeStaff = staffRoles.find((s) => s.society?._id === societyId) || null;
    const role = activeStaff?.role || null;
    return {
      isAuthenticated: Boolean(state?.accessToken && user),
      user,
      staffRoles,
      societyId,
      society: activeStaff?.society || null,
      role,
      isSuperAdmin: user?.platformRole === 'super_admin',
      can: (perm) => roleCan(role, perm),
      login,
      logout,
      switchSociety,
      endReason,
      clearEndReason: () => setEndReason(null),
    };
  }, [state, login, logout, switchSociety, endReason]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
