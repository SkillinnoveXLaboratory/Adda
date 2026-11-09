import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Button, EmptyState, Icon } from '../components/ui.jsx';
import { AppShell } from './AppShell.jsx';
import { PLATFORM_NAV, SOCIETY_NAV, visibleSections } from './nav.js';

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
const pickPlatform = (o) => ({ ...o.counts });

export function RequireAuth({ children }) {
  const { isAuthenticated, isPlatformAdmin, endReason } = useAuth();
  const location = useLocation();
  if (!isAuthenticated || !isPlatformAdmin) {
    const reason = endReason && endReason !== 'logout' ? `?reason=${endReason}` : '';
    return <Navigate to={`/login${reason}`} replace state={{ from: location.pathname }} />;
  }
  return children;
}

function PortalFooter({ label, sub, icon = 'fa-solid fa-crown' }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-sidebar-active px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/20 text-blue-300">
        <Icon name={icon} className="text-xs" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-bold text-white">{label}</span>
        <span className="block truncate text-[10px] text-sidebar-text">{sub}</span>
      </span>
    </div>
  );
}

export function PlatformPortal() {
  const { exitSociety, isOwner, canView, permissions } = useAuth();
  // Sub-admins see only the pages the owner ticked (recomputed when /me brings a new permission list).
  const permKey = permissions.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sections = useMemo(() => visibleSections(PLATFORM_NAV, canView), [isOwner, permKey]);
  const { counts, refreshCounts } = useCountsLoader('/platform/overview', pickPlatform, 'platform');
  // Back on the Master side: the society workspace (and its /society → /platform/... routing) ends here.
  useEffect(() => {
    exitSociety();
  }, [exitSociety]);
  const value = useMemo(() => ({ counts, refreshCounts }), [counts, refreshCounts]);
  return (
    <CountsContext.Provider value={value}>
      <AppShell
        sections={sections}
        badges={counts}
        sidebarFooter={isOwner ? <PortalFooter label="Platform owner" sub="Master control" /> : <PortalFooter label="Sub-admin" sub="Access set by the platform owner" icon="fa-solid fa-user-gear" />}
      />
    </CountsContext.Provider>
  );
}

/**
 * Society workspace: the owner uses the society-admin screens for ONE society (chosen on its detail page).
 * API calls are re-routed to /platform/societies/:sid/manage/* and every change asks for a reason.
 */
export function SocietyWorkspace() {
  const { society, exitSociety, canManage, isOwner } = useAuth();
  // Acting inside a society needs "Societies · manage" (the server re-checks every call).
  const allowed = canManage('societies');
  const leaving = useRef(false);
  const navigate = useNavigate();
  const { counts, refreshCounts } = useCountsLoader('/society/overview', pickSociety, society?._id, Boolean(society) && allowed);
  const value = useMemo(() => ({ counts, refreshCounts }), [counts, refreshCounts]);
  if (!allowed) return <Navigate to="/admin/societies" replace />
  // While leaving, render nothing (the navigation below is a transition; don't redirect over it).
  if (!society) return leaving.current ? null : <Navigate to="/admin/societies" replace />;
  const suspended = (counts.societyStatus || society.status) === 'suspended';
  const leave = () => {
    leaving.current = true;
    const id = society._id;
    exitSociety();
    navigate(`/admin/societies/${id}`);
  };
  return (
    <CountsContext.Provider value={value}>
      <AppShell
        key={society._id}
        sections={[{ title: 'Master', items: [{ to: '/admin', label: 'Back to Master', icon: 'fa-solid fa-arrow-left', end: true }] }, ...SOCIETY_NAV]}
        badges={counts}
        sidebarFooter={<PortalFooter label={society.name} sub={`${society.code || ''} · managed by ${isOwner ? 'owner' : 'sub-admin'}`} icon="fa-regular fa-building" />}
        banner={
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900 sm:flex-row sm:items-center" data-testid="workspace-banner" role="status">
            <Icon name="fa-solid fa-user-shield" className="hidden text-base text-brand sm:block" />
            <div className="min-w-0 flex-1 leading-relaxed">
              <p className="font-semibold">
                Managing {society.name} <span className="font-normal text-blue-700">({society.code})</span> as {isOwner ? 'platform owner' : 'sub-admin'}
              </p>
              <p className="text-blue-800/80">
                Same rules as the society admin. Every change asks for a reason and is written to the audit log. Phone numbers and emails are masked — reveal them from a member’s profile.
                {suspended && <b className="text-rose-600"> This society is suspended.</b>}
              </p>
            </div>
            <Button variant="outline" size="sm" icon="fa-solid fa-right-from-bracket" onClick={leave} data-testid="exit-workspace">
              Exit workspace
            </Button>
          </div>
        }
      />
    </CountsContext.Provider>
  );
}

/** "No access" card for a page this user may not open (the server would refuse its calls anyway). */
export function NoAccess({ owner = false }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" data-testid="no-access">
      <div className="card w-full max-w-md">
        <EmptyState
          icon="fa-solid fa-lock"
          title="No access"
          message={owner ? 'Only the platform owner can open this page.' : 'You don’t have permission to open this page. Ask the platform owner if you need it.'}
          action={
            <Link to="/admin" className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">
              <Icon name="fa-solid fa-house" /> Back to your pages
            </Link>
          }
        />
      </div>
    </div>
  );
}

/** Platform route guard: the page renders only when the user may view `area` ('owner' = platform owner only). */
export function RequireArea({ area, children }) {
  const { canView } = useAuth();
  if (!canView(area)) return <NoAccess owner={area === 'owner'} />;
  return children;
}

/** Route-level gate kept for the reused society screens; the owner always has full rights. */
export function RequirePerm({ children }) {
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
            <a href="/admin" className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">
              <Icon name="fa-solid fa-house" /> Go to dashboard
            </a>
          }
        />
      </div>
    </div>
  );
}
