import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, setPermissionDeniedHandler, setSessionEndHandler } from './api.js';
import { session } from './session.js';
import { canManageArea, canViewArea, isOwnerUser, isPlatformAdminUser, normalizePermissions } from './permissions.js';

const AuthContext = createContext(null);

/**
 * Master Admin sign-in: email + password, platform owner (super_admin) or sub-admin (sub_admin).
 * Sub-admins see only the areas the owner ticked (see lib/permissions.js); the server enforces every rule.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState(() => session.get());
  const [endReason, setEndReason] = useState(null);
  const lastRefresh = useRef(0);

  useEffect(() => session.subscribe((s) => setState(s)), []);
  useEffect(() => {
    setSessionEndHandler((reason) => setEndReason(reason));
    return () => setSessionEndHandler(null);
  }, []);

  /** Re-read the profile (permissions may have changed). A dead session is handled by the api client. */
  const refreshProfile = useCallback(() => {
    if (!session.get()?.accessToken) return Promise.resolve();
    lastRefresh.current = Date.now();
    return api
      .get('/me')
      .then((me) => session.get() && me?.user && session.patch({ user: me.user }, 'profile'))
      .catch(() => {
        /* the api client already handled a dead session */
      });
  }, []);

  // On reload with a stored session, refresh the profile.
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  // Changes the owner makes to a sub-admin apply without re-login: on window focus and after a 403 "no permission".
  useEffect(() => {
    const soon = () => Date.now() - lastRefresh.current > 3000 && refreshProfile();
    const onVisible = () => document.visibilityState === 'visible' && soon();
    window.addEventListener('focus', soon);
    document.addEventListener('visibilitychange', onVisible);
    setPermissionDeniedHandler(() => soon());
    return () => {
      window.removeEventListener('focus', soon);
      document.removeEventListener('visibilitychange', onVisible);
      setPermissionDeniedHandler(null);
    };
  }, [refreshProfile]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/admin/login', { email, password }, { auth: false });
    if (!isPlatformAdminUser(res?.user)) {
      // A society admin's password worked, but this console is not for them: end that session at once.
      if (res?.accessToken) await api.post('/auth/logout', {}, { auth: false, headers: { Authorization: `Bearer ${res.accessToken}` } }).catch(() => {});
      throw new ApiError(403, 'NOT_OWNER', 'This console is only for the platform owner. Society admins sign in at the Society Admin panel.');
    }
    session.set({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user, scope: null }, 'login');
    lastRefresh.current = Date.now();
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
    const isOwner = isOwnerUser(user);
    return {
      isAuthenticated: Boolean(state?.accessToken && user),
      user,
      /** Platform owner: every permission, plus the Sub-admins page. */
      isOwner,
      /** May use Master Admin at all (owner or sub-admin). RequireAuth and the login page use this. */
      isPlatformAdmin: isPlatformAdminUser(user),
      /** The sub-admin's permission keys (empty for the owner, who has everything). */
      permissions: isOwner ? [] : normalizePermissions(user?.platformPermissions),
      canView: (area) => canViewArea(user, area),
      canManage: (area) => canManageArea(user, area),
      refreshProfile,
      // Shape expected by the reused society screens. The workspace is reachable only with societies.manage,
      // so inside it the user acts with full society-admin rights (the server re-checks every call).
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
  }, [state, login, logout, enterSociety, exitSociety, endReason, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
