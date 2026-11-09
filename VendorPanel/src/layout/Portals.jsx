import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Badge, EmptyState, Icon } from '../components/ui.jsx';
import { AppShell } from './AppShell.jsx';
import { VENDOR_NAV } from './nav.js';
import { CountsContext } from './counts.js';

export { useCounts } from './counts.js';

export function RequireAuth({ children }) {
  const { isAuthenticated, endReason } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    const reason = endReason && endReason !== 'logout' ? `?reason=${endReason}` : '';
    return <Navigate to={`/login${reason}`} replace state={{ from: location.pathname }} />;
  }
  return children;
}

const KYC_FOOTER = { approved: ['success', 'Verified vendor'], pending: ['warning', 'KYC under review'], rejected: ['danger', 'KYC needs changes'], not_submitted: ['warning', 'KYC not submitted'] };

/** Signed-in area: loads the dashboard counts for sidebar badges and keeps the KYC status in the session fresh. */
export function VendorPortal() {
  const { user, vendor, kycStatus, refreshProfile } = useAuth();
  const [counts, setCounts] = useState({});
  const refreshCounts = useCallback(() => {
    Promise.all([api.get('/vendor/dashboard'), api.get('/notifications', { limit: 1 })])
      .then(([d, n]) => {
        setCounts({ newBookings: d.bookings?.requested || 0, kycTodo: d.kycStatus === 'approved' || d.kycStatus === 'pending' ? 0 : 1, unread: n.unread || 0 });
        if (d.kycStatus && d.kycStatus !== vendor?.kycStatus) refreshProfile().catch(() => {});
      })
      .catch(() => {
        /* badges are a convenience; pages show their own errors */
      });
  }, [vendor?.kycStatus, refreshProfile]);
  useEffect(() => {
    refreshCounts();
    const t = setInterval(() => document.visibilityState === 'visible' && refreshCounts(), 90_000);
    return () => clearInterval(t);
  }, [refreshCounts]);
  const value = useMemo(() => ({ counts, refreshCounts }), [counts, refreshCounts]);
  const [tone, label] = KYC_FOOTER[kycStatus] || KYC_FOOTER.not_submitted;
  return (
    <CountsContext.Provider value={value}>
      <AppShell
        sections={VENDOR_NAV}
        badges={counts}
        sidebarFooter={
          <div className="rounded-xl bg-white/10 px-3 py-2.5">
            <p className="truncate text-[11px] font-bold text-white">{vendor?.businessName || user?.name}</p>
            <Badge tone={tone} className="mt-1">
              {label}
            </Badge>
          </div>
        }
      />
    </CountsContext.Provider>
  );
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
            <a href="/" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-azea-purple px-4 text-xs font-semibold text-white hover:bg-azea-purpleDark">
              <Icon name="fa-solid fa-house" /> Go home
            </a>
          }
        />
      </div>
    </div>
  );
}
