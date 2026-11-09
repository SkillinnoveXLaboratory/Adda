import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAction, useQuery, useTitle } from '../lib/hooks.js';
import { humanize, money } from '../lib/format.js';
import { Badge, Button, EmptyState, ErrorState, Icon, PageHeader, PageSkeleton, Tabs } from '../components/ui.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import { KycStatusCard } from '../components/KycStatusCard.jsx';
import { ListingCard, listingTabs } from '../components/Listing.jsx';
import { useToast } from '../components/Toast.jsx';
import { useCounts } from '../layout/counts.js';

const live = (p) => p.moderationStatus === 'approved' && p.availability === 'available';
const AVAIL_DONE = { inactive: 'Listing paused — members no longer see it', available: 'Listing is live again', sold: 'Marked as sold', rented: 'Marked as rented' };

/** The vendor's property listings: review status, availability (pause / sold / rented), edit, delete, boost. */
export default function Properties() {
  useTitle('Properties');
  const { verified, kycStatus, vendor } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshCounts } = useCounts();
  const list = useQuery(() => api.get('/properties/mine', { limit: 50 }));
  const [tab, setTab] = useState('all');
  const [del, setDel] = useState(null);
  const items = useMemo(() => list.data?.items || [], [list.data]);
  const tabs = useMemo(() => listingTabs(items, live, 'Paused / closed'), [items]);
  const shown = items.filter(tabs.find((t) => t.value === tab).match);
  const after = () => (list.reload(), refreshCounts());

  const [setAvailability, availBusy] = useAction(
    useCallback(async (p, availability) => {
      await api.patch(`/properties/${p._id}`, { availability });
      return availability;
    }, []),
    { toast, success: (a) => AVAIL_DONE[a], onDone: after },
  );
  const [remove, removing] = useAction(
    useCallback(async () => {
      await api.del(`/properties/${del._id}`);
    }, [del]),
    { toast, success: 'Listing deleted', onDone: () => (setDel(null), after()) },
  );

  const add = () => (verified ? navigate('/properties/new') : navigate('/kyc', { state: { reason: 'property' } }));

  return (
    <div>
      <PageHeader
        title="Properties"
        subtitle="Flats, houses, plots and shops you list for sale or rent. Listings are reviewed before members see them."
        actions={
          <Button icon={verified ? 'fa-solid fa-plus' : 'fa-solid fa-lock'} onClick={add} data-testid="add-property">
            List a property
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
            icon="fa-solid fa-building"
            title="No properties yet"
            message="List a flat, house, plot or shop for sale or rent."
            action={
              <Button icon={verified ? 'fa-solid fa-plus' : 'fa-solid fa-lock'} onClick={add}>
                List a property
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" label="Filter properties" />
          {!shown.length ? (
            <div className="card">
              <EmptyState compact icon="fa-solid fa-filter" title="Nothing in this view" message="Pick another filter above." />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((p) => {
                const closed = ['sold', 'rented'].includes(p.availability);
                return (
                  <ListingCard
                    key={p._id}
                    item={p}
                    testId="property-card"
                    icon="fa-solid fa-building"
                    editTo={`/properties/${p._id}/edit`}
                    price={`${money(p.pricePaise)}${p.listingType === 'rent' ? ' / month' : ''}`}
                    meta={[p.listingType === 'rent' ? 'For rent' : 'For sale', humanize(p.propertyType), p.bedrooms ? `${p.bedrooms} BHK` : null, [p.locality, p.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                    extra={p.availability !== 'available' ? <Badge status={p.availability}>{p.availability === 'inactive' ? 'Paused' : humanize(p.availability)}</Badge> : null}
                    actions={
                      <>
                        <Link to={`/properties/${p._id}/edit`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50">
                          <Icon name="fa-regular fa-pen-to-square" className="text-[11px]" /> Edit
                        </Link>
                        {p.moderationStatus !== 'rejected' && (
                          <Button variant="secondary" icon={p.availability === 'available' ? 'fa-solid fa-pause' : 'fa-solid fa-play'} disabled={availBusy} onClick={() => setAvailability(p, p.availability === 'available' ? 'inactive' : 'available')}>
                            {p.availability === 'available' ? 'Pause' : closed ? 'Re-open' : 'Resume'}
                          </Button>
                        )}
                        {p.moderationStatus === 'approved' && p.availability === 'available' && (
                          <Button variant="secondary" icon="fa-solid fa-handshake" disabled={availBusy} onClick={() => setAvailability(p, p.listingType === 'rent' ? 'rented' : 'sold')}>
                            {p.listingType === 'rent' ? 'Mark rented' : 'Mark sold'}
                          </Button>
                        )}
                        {verified && live(p) && (
                          <Button variant="outline" icon="fa-solid fa-rocket" onClick={() => navigate(`/boosts/new?kind=property&id=${p._id}`)}>
                            Boost
                          </Button>
                        )}
                        <Button variant="danger-outline" icon="fa-regular fa-trash-can" onClick={() => setDel(p)} aria-label={`Delete ${p.title}`}>
                          Delete
                        </Button>
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </>
      )}
      <ConfirmDialog open={Boolean(del)} onClose={() => !removing && setDel(null)} busy={removing} title="Delete this listing?" message={`“${del?.title}” disappears for members and can’t be restored.`} confirmLabel="Delete listing" onConfirm={() => remove()} />
    </div>
  );
}
