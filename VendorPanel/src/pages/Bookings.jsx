import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../lib/api.js';
import { useQuery, useTitle } from '../lib/hooks.js';
import { Alert, Card, EmptyState, ErrorState, PageHeader, Tabs } from '../components/ui.jsx';
import { BookingCard, BookingListSkeleton } from '../components/BookingCard.jsx';
import { SettlementSummary } from '../components/Pricing.jsx';
import { useCounts } from '../layout/counts.js';

const TABS = {
  open: { label: 'Open', load: () => api.get('/vendor/bookings', { status: 'open', limit: 50 }).then((r) => r.items), empty: ['No open bookings', 'Members book your approved services from Home Maintenance in the NIVASA app. New requests show up here.'] },
  completed: { label: 'Completed', load: () => api.get('/vendor/bookings', { status: 'completed', limit: 50 }).then((r) => r.items), empty: ['No completed jobs yet', 'Jobs you mark as done appear here, where you record the cash you received.'] },
  cancelled: {
    label: 'Cancelled',
    load: async () => {
      const [c, d] = await Promise.all([api.get('/vendor/bookings', { status: 'cancelled', limit: 50 }), api.get('/vendor/bookings', { status: 'declined', limit: 50 })]);
      return [...c.items, ...d.items].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    },
    empty: ['Nothing cancelled', 'Bookings you decline or that customers cancel appear here.'],
  },
};

/** Bookings of the vendor's services: accept / decline, mark the job done, record cash once, settlement per booking. */
export default function Bookings() {
  useTitle('Bookings');
  const [params, setParams] = useSearchParams();
  const tab = TABS[params.get('tab')] ? params.get('tab') : 'open';
  const { refreshCounts } = useCounts();
  const list = useQuery(() => TABS[tab].load(), [tab]);
  const dash = useQuery(() => api.get('/vendor/dashboard'));
  const d = dash.data;
  const changed = useCallback(() => {
    list.reload();
    dash.reload();
    refreshCounts();
  }, [list, dash, refreshCounts]);

  const counts = d ? { open: (d.bookings?.requested || 0) + (d.bookings?.accepted || 0), completed: d.bookings?.completed || 0, cancelled: (d.bookings?.cancelled || 0) + (d.bookings?.declined || 0) } : {};
  const tabs = Object.entries(TABS).map(([value, t]) => ({ value, label: t.label, count: counts[value] }));

  return (
    <div>
      <PageHeader title="Bookings" subtitle="Requests for your services. Accept, finish the job, then record the cash the customer paid you." />
      <Tabs tabs={tabs} value={tab} onChange={(v) => setParams(v === 'open' ? {} : { tab: v }, { replace: true })} className="mb-4" label="Booking status" />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {tab === 'completed' && (
            <Alert tone="purple" className="mb-4">
              After a job, use “Mark cash paid” when the customer pays you in person. It can be recorded once and can’t be changed later.
            </Alert>
          )}
          {list.loading && !list.data ? (
            <BookingListSkeleton rows={2} />
          ) : list.error && !list.data ? (
            <div className="card">
              <ErrorState error={list.error} onRetry={list.reload} />
            </div>
          ) : !list.data.length ? (
            <div className="card">
              <EmptyState icon="fa-regular fa-calendar" title={TABS[tab].empty[0]} message={TABS[tab].empty[1]} />
            </div>
          ) : (
            <div className={list.reloading ? 'space-y-4 opacity-70 transition-opacity' : 'space-y-4'} data-testid="booking-list">
              {list.data.map((b) => (
                <BookingCard key={b._id} booking={b} onChanged={changed} />
              ))}
            </div>
          )}
        </div>
        <Card title="Settlement with NIVASA" className="self-start">
          {d ? <SettlementSummary settlement={d.settlement} commissionPercent={d.commissionPercent} /> : dash.error ? <ErrorState error={dash.error} onRetry={dash.reload} compact /> : <div className="skeleton h-40 rounded-lg" />}
        </Card>
      </div>
    </div>
  );
}
