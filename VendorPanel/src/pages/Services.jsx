import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAction, useQuery, useTitle } from '../lib/hooks.js';
import { formatDate, offerPrice } from '../lib/format.js';
import { Badge, Button, EmptyState, ErrorState, Icon, PageHeader, PageSkeleton, Tabs } from '../components/ui.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import { KycStatusCard } from '../components/KycStatusCard.jsx';
import { ListingCard, listingTabs } from '../components/Listing.jsx';
import { useToast } from '../components/Toast.jsx';
import { useCounts } from '../layout/counts.js';

const live = (s) => s.moderationStatus === 'approved' && s.status === 'active';

/** The vendor's services (max 10 live): review status, price, commission rate, pause / resume, delete, boost. */
export default function Services() {
  useTitle('Services');
  const { verified, kycStatus, vendor } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshCounts } = useCounts();
  const list = useQuery(() => api.get('/service-offers/mine', { limit: 50 }));
  const [tab, setTab] = useState('all');
  const [del, setDel] = useState(null);
  const items = useMemo(() => list.data?.items || [], [list.data]);
  const tabs = useMemo(() => listingTabs(items, live), [items]);
  const shown = items.filter(tabs.find((t) => t.value === tab).match);
  const after = () => (list.reload(), refreshCounts());

  const [setStatus, statusBusy] = useAction(
    useCallback(async (s, status) => {
      await api.patch(`/service-offers/${s._id}`, { status });
      return status;
    }, []),
    { toast, success: (st) => (st === 'paused' ? 'Service paused — members no longer see it' : 'Service is live again'), onDone: after },
  );
  const [remove, removing] = useAction(
    useCallback(async () => {
      await api.del(`/service-offers/${del._id}`);
    }, [del]),
    { toast, success: 'Service deleted', onDone: () => (setDel(null), after()) },
  );

  const add = () => (verified ? navigate('/services/new') : navigate('/kyc', { state: { reason: 'service' } }));

  return (
    <div>
      <PageHeader
        title="Services"
        subtitle="Home services you offer to NIVASA members. Each new or edited service is reviewed before members see it."
        actions={
          <Button icon={verified ? 'fa-solid fa-plus' : 'fa-solid fa-lock'} onClick={add} data-testid="add-service">
            Add service
          </Button>
        }
      />
      {!verified && <KycStatusCard status={kycStatus} note={vendor?.kycNote} className="mb-5" />}
      {list.loading && !list.data ? (
        <PageSkeleton rows={3} />
      ) : list.error && !list.data ? (
        <div className="card">
          <ErrorState error={list.error} onRetry={list.reload} />
        </div>
      ) : !items.length ? (
        <div className="card">
          <EmptyState
            icon="fa-solid fa-screwdriver-wrench"
            title="No services yet"
            message="Add the home services you offer — plumbing, electrical, cleaning and more. You can list up to 10."
            action={
              <Button icon={verified ? 'fa-solid fa-plus' : 'fa-solid fa-lock'} onClick={add}>
                Add service
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" label="Filter services" />
          {!shown.length ? (
            <div className="card">
              <EmptyState compact icon="fa-solid fa-filter" title="Nothing in this view" message="Pick another filter above." />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((s) => (
                <ListingCard
                  key={s._id}
                  item={s}
                  testId="service-card"
                  icon="fa-solid fa-screwdriver-wrench"
                  editTo={`/services/${s._id}/edit`}
                  price={offerPrice(s)}
                  meta={`${s.category?.name || 'Service'} · ${s.city}${s.commissionBps !== undefined ? ` · commission ${(s.commissionBps || 0) / 100}%` : ''} · added ${formatDate(s.createdAt)}`}
                  extra={s.status === 'paused' ? <Badge status="paused">Paused</Badge> : null}
                  actions={
                    <>
                      <Link to={`/services/${s._id}/edit`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50">
                        <Icon name="fa-regular fa-pen-to-square" className="text-[11px]" /> Edit
                      </Link>
                      {s.moderationStatus !== 'rejected' && (
                        <Button variant="secondary" icon={s.status === 'paused' ? 'fa-solid fa-play' : 'fa-solid fa-pause'} disabled={statusBusy} onClick={() => setStatus(s, s.status === 'paused' ? 'active' : 'paused')}>
                          {s.status === 'paused' ? 'Resume' : 'Pause'}
                        </Button>
                      )}
                      {verified && live(s) && (
                        <Button variant="outline" icon="fa-solid fa-rocket" onClick={() => navigate(`/boosts/new?kind=service&id=${s._id}`)}>
                          Boost
                        </Button>
                      )}
                      <Button variant="danger-outline" icon="fa-regular fa-trash-can" onClick={() => setDel(s)} aria-label={`Delete ${s.title}`}>
                        Delete
                      </Button>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
      <ConfirmDialog open={Boolean(del)} onClose={() => !removing && setDel(null)} busy={removing} title="Delete this service?" message={`“${del?.title}” disappears for members and can’t be restored. Bookings already made stay in your history.`} confirmLabel="Delete service" onConfirm={() => remove()} />
    </div>
  );
}
