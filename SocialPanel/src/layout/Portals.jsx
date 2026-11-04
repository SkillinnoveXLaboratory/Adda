import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ROLE_LABELS } from '../lib/roles.js';
import { Alert, EmptyState, Icon } from '../components/ui.jsx';
import { AppShell } from './AppShell.jsx';
import { SOCIETY_NAV } from './nav.js';

const CountsContext = createContext({ counts: {}, refreshCounts: () => {} });
/** Pages call refreshCounts() after actions that change sidebar badges (approvals etc.). */
export const useCounts = () => useContext(CountsContext);

function useCountsLoader(path, pick, key, enabled = true) {
  const [counts, setCounts] = useState({});
  const refreshCounts = useCallback(() => {
    if (!enabled) return;
    api
      .get(path)
      .then((res) => setCounts(pick(res)))
      .catch(() => {
        /* badges are a convenience; pages show their own errors */
      });
  }, [path, pick, enabled]);
  useEffect(() => {
    refreshCounts();
    const t = setInterval(() => document.visibilityState === 'visible' && refreshCounts(), 90_000);
    return () => clearInterval(t);
  }, [refreshCounts, key]);
  return { counts, refreshCounts };
}

const pickSociety = (o) => ({ ...o.counts, pendingComplaints: o.complaints?.pending || 0, societyStatus: o.society?.status });

export function RequireAuth({ children }) {
  const { isAuthenticated, endReason } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    const reason = endReason && endReason !== 'logout' ? `?reason=${endReason}` : '';
    return <Navigate to={`/login${reason}`} replace state={{ from: location.pathname }} />;
  }
  return children;
}

function PortalFooter({ label, sub }) {
  return (
    <div className="rounded-xl bg-azea-purpleLight px-3 py-2.5">
      <p className="truncate text-[11px] font-bold text-azea-purple">{label}</p>
      <p className="truncate text-[10px] text-azea-muted">{sub}</p>
    </div>
  );
}

export function SocietyPortal() {
  const { isSuperAdmin, staffRoles, role, society, societyId, can } = useAuth();
  const { counts, refreshCounts } = useCountsLoader("/society/overview", pickSociety, societyId, !isSuperAdmin && staffRoles.length > 0);
  const value = useMemo(() => ({ counts, refreshCounts }), [counts, refreshCounts]);
  const sections = useMemo(() => SOCIETY_NAV.map((s) => ({ ...s, items: s.items.filter((i) => !i.perm || can(i.perm)) })).filter((s) => s.items.length), [can]);
  // Platform owner sessions belong to the Master Admin panel.
  if (isSuperAdmin) return <Navigate to="/login" replace />;
  if (!staffRoles.length) return <Navigate to="/login" replace />;
  const suspended = (counts.societyStatus || society?.status) === 'suspended';
  return (
    <CountsContext.Provider value={value}>
      <AppShell
        key={societyId}
        sections={sections}
        badges={counts}
        sidebarFooter={<PortalFooter label={society?.name || 'Society'} sub={`${society?.code || ''} · ${ROLE_LABELS[role] || role}`} />}
        banner={
          suspended ? (
            <Alert tone="danger" title="This society is suspended" className="mb-5">
              You can view records, but changes are blocked until the platform administrator reactivates the society.
            </Alert>
          ) : null
        }
      />
    </CountsContext.Provider>
  );
}

/** Route-level permission gate inside the society portal. */
export function RequirePerm({ perm, children }) {
  const { can, role } = useAuth();
  if (!can(perm)) {
    return (
      <div className="card">
        <EmptyState icon="fa-solid fa-lock" title="Not available for your role" message={`Your role (${ROLE_LABELS[role] || role}) does not include access to this module. Ask your society admin if you need it.`} />
      </div>
    );
  }
  return children;
}

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="card w-full max-w-md">
        <EmptyState
          icon="fa-regular fa-compass"
          title="Page not found"
          message="The page you’re looking for doesn’t exist or was moved."
          action={
            <a href="/" className="inline-flex items-center gap-1.5 rounded-md bg-azea-purple px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-azea-purpleDark">
              <Icon name="fa-solid fa-house" /> Go home
            </a>
          }
        />
      </div>
    </div>
  );
}
