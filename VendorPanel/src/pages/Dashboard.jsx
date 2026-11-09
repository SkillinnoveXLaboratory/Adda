import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useQuery, useTitle } from '../lib/hooks.js';
import { money } from '../lib/format.js';
import { Badge, Card, cx, EmptyState, ErrorState, Icon, PageSkeleton } from '../components/ui.jsx';
import { BookingCard, BookingListSkeleton } from '../components/BookingCard.jsx';
import { KycStatusCard } from '../components/KycStatusCard.jsx';
import { SettlementSummary } from '../components/Pricing.jsx';
import { useCounts } from '../layout/counts.js';

const sum = (o = {}) => Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0);
const greeting = () => {
  const h = Number(new Date(Date.now() + 330 * 60000).toISOString().slice(11, 13));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** Vendor home: KYC status, business numbers, settlement with NIVASA, quick actions and the latest open bookings. */
export default function Dashboard() {
  useTitle('Dashboard');
  const { user, refreshProfile } = useAuth();
  const { refreshCounts } = useCounts();
  const navigate = useNavigate();
  const dash = useQuery(() => api.get('/vendor/dashboard'));
  const open = useQuery(() => api.get('/vendor/bookings', { status: 'open', limit: 4 }));
  const d = dash.data;
  const verified = d?.kycStatus === 'approved';

  const refresh = useCallback(() => {
    dash.reload();
    open.reload();
    refreshCounts();
    refreshProfile().catch(() => {});
  }, [dash, open, refreshCounts, refreshProfile]);
  const needKyc = (path, reason) => () => (verified ? navigate(path) : navigate('/kyc', { state: { reason } }));

  if (dash.loading && !d) return <PageSkeleton cards={4} rows={3} />;
  if (dash.error && !d)
    return (
      <div className="card">
        <ErrorState error={dash.error} onRetry={dash.reload} />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="bg-brand-panel relative overflow-hidden rounded-2xl p-5 text-white shadow-sm sm:p-6">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-violet-200">{greeting()},</p>
            <h1 className="break-words text-xl font-bold tracking-tight sm:text-2xl" data-testid="dashboard-name">
              {d.businessName || user?.name}
            </h1>
            <div className="mt-2">
              <Badge tone={verified ? 'success' : d.kycStatus === 'rejected' ? 'danger' : 'warning'}>{verified ? 'Verified vendor' : d.kycStatus === 'pending' ? 'KYC under review' : d.kycStatus === 'rejected' ? 'KYC needs changes' : 'KYC needed'}</Badge>
            </div>
          </div>
          <button type="button" onClick={verified ? () => navigate('/boosts/new') : () => navigate('/kyc')} className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-lg bg-white px-5 text-sm font-semibold text-azea-purpleDark shadow-sm hover:bg-violet-50 sm:self-center">
            <Icon name={verified ? 'fa-solid fa-rocket' : 'fa-solid fa-shield-halved'} />
            {verified ? 'Boost a post' : 'Complete KYC'}
          </button>
        </div>
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full border-[30px] border-white/5" aria-hidden="true" />
      </div>

      {!verified && <KycStatusCard status={d.kycStatus} note={d.kycNote} />}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon="fa-solid fa-screwdriver-wrench" value={sum(d.services)} label="Services" note={d.services?.pending ? `${d.services.pending} in review` : null} to="/services" testId="stat-services" />
        <Stat icon="fa-solid fa-building" value={sum(d.properties)} label="Properties" note={d.properties?.pending ? `${d.properties.pending} in review` : null} to="/properties" testId="stat-properties" />
        <Stat icon="fa-regular fa-calendar-check" value={(d.bookings?.requested || 0) + (d.bookings?.accepted || 0)} label="Open bookings" note={d.bookings?.requested ? `${d.bookings.requested} new` : null} to="/bookings" testId="stat-bookings" />
        <Stat icon="fa-solid fa-indian-rupee-sign" value={money(d.cashCollectedPaise || 0)} label="Cash recorded" note={`${d.paidBookings || 0} paid job${d.paidBookings === 1 ? '' : 's'}`} to="/earnings" testId="stat-cash" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card
          title="Settlement with NIVASA"
          className="lg:col-span-3"
          actions={
            <Link to="/earnings" className="inline-flex min-h-[40px] items-center gap-1.5 text-xs font-semibold text-azea-purple hover:underline" data-testid="dashboard-earnings-link">
              View earnings <Icon name="fa-solid fa-arrow-right" className="text-[10px]" />
            </Link>
          }
        >
          <SettlementSummary settlement={d.settlement} commissionPercent={d.commissionPercent} />
        </Card>
        <Card title="Quick actions" className="lg:col-span-2">
          <div className="grid gap-2">
            <QuickAction icon="fa-solid fa-screwdriver-wrench" label="Add a service" onClick={needKyc('/services/new', 'service')} testId="quick-add-service" locked={!verified} />
            <QuickAction icon="fa-solid fa-building" label="List a property" onClick={needKyc('/properties/new', 'property')} testId="quick-add-property" locked={!verified} />
            <QuickAction icon="fa-solid fa-rocket" label="Boost a post" note={d.ads?.active ? `${d.ads.active} running` : d.ads?.pending ? `${d.ads.pending} in review` : null} onClick={needKyc('/boosts/new', 'boost')} testId="quick-boost" locked={!verified} />
          </div>
          {!verified && <p className="mt-3 text-[11px] leading-relaxed text-azea-muted">Listing and boosting open up once NIVASA approves your KYC.</p>}
        </Card>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="card-title">New & upcoming bookings</h2>
          <Link to="/bookings" className="inline-flex min-h-[40px] items-center text-xs font-semibold text-azea-purple hover:underline">
            View all
          </Link>
        </div>
        {open.loading && !open.data ? (
          <BookingListSkeleton rows={2} />
        ) : open.error && !open.data ? (
          <div className="card">
            <ErrorState error={open.error} onRetry={open.reload} compact />
          </div>
        ) : !open.data?.items?.length ? (
          <div className="card">
            <EmptyState compact icon="fa-regular fa-calendar" title="No open bookings" message="Members book your approved services from Home Maintenance in the NIVASA app. New requests show up here." />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {open.data.items.map((b) => (
              <BookingCard key={b._id} booking={b} onChanged={refresh} compact />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, value, label, note, to, testId }) {
  return (
    <Link to={to} className="card group flex min-w-0 flex-col gap-1 p-4 transition-colors hover:border-violet-200" data-testid={testId}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-azea-purpleLight text-azea-purple">
        <Icon name={icon} className="text-sm" />
      </span>
      <span className="mt-1 truncate text-lg font-bold text-gray-800 sm:text-xl">{value}</span>
      <span className="truncate text-xs font-semibold text-gray-600">{label}</span>
      <span className={cx('truncate text-[11px]', note ? 'text-amber-700' : 'text-transparent')}>{note || '—'}</span>
    </Link>
  );
}

function QuickAction({ icon, label, note, onClick, testId, locked }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className="flex min-h-[48px] w-full items-center gap-3 rounded-lg border border-gray-100 px-3 text-left transition-colors hover:border-violet-200 hover:bg-azea-purpleLight/40">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-azea-purpleLight text-azea-purple">
        <Icon name={icon} className="text-xs" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-gray-700">{label}</span>
        {note && <span className="block text-[11px] text-azea-muted">{note}</span>}
      </span>
      <Icon name={locked ? 'fa-solid fa-lock' : 'fa-solid fa-chevron-right'} className="text-[10px] text-gray-400" />
    </button>
  );
}
