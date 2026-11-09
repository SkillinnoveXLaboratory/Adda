import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, mediaHref } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAction, useQuery, useTitle } from '../lib/hooks.js';
import { formatDate } from '../lib/format.js';
import { Alert, Badge, Button, EmptyState, ErrorState, Icon, PageHeader, PageSkeleton, Thumb } from '../components/ui.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import { KycStatusCard } from '../components/KycStatusCard.jsx';
import { useToast } from '../components/Toast.jsx';

const STATUS = { pending: ['In review', 'warning'], active: ['Running · Sponsored', 'success'], expired: ['Finished', 'neutral'], rejected: ['Not approved', 'danger'], cancelled: ['Stopped', 'neutral'] };

/** The vendor's boosts: review status, where and how long they run; stop or withdraw them. */
export default function Boosts() {
  useTitle('Boosts');
  const { verified, kycStatus, vendor } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const list = useQuery(() => api.get('/vendor/ads', { limit: 50 }));
  const [stopping, setStopping] = useState(null);
  const [stop, busy] = useAction(
    useCallback(async () => {
      await api.post(`/vendor/ads/${stopping._id}/cancel`);
      return stopping.status;
    }, [stopping]),
    { toast, success: (s) => (s === 'active' ? 'Boost stopped' : 'Request withdrawn'), onDone: () => (setStopping(null), list.reload()) },
  );
  const running = stopping?.status === 'active';

  return (
    <div>
      <PageHeader
        title="Boosts"
        subtitle="Show your posts at the top of results, marked Sponsored."
        actions={
          <Button icon={verified ? 'fa-solid fa-rocket' : 'fa-solid fa-lock'} onClick={() => (verified ? navigate('/boosts/new') : navigate('/kyc', { state: { reason: 'boost' } }))} data-testid="new-boost">
            Boost a post
          </Button>
        }
      />
      {!verified && <KycStatusCard status={kycStatus} note={vendor?.kycNote} className="mb-5" />}
      <Alert tone="purple" icon="fa-solid fa-rocket" className="mb-5">
        Choose a post, a city and how many days. After NIVASA approves it, your post shows first in its category for people in that city, marked Sponsored. There is no charge for boosting right now.
      </Alert>
      {list.loading && !list.data ? (
        <PageSkeleton rows={3} />
      ) : list.error && !list.data ? (
        <div className="card">
          <ErrorState error={list.error} onRetry={list.reload} />
        </div>
      ) : !list.data.items.length ? (
        <div className="card">
          <EmptyState icon="fa-solid fa-rocket" title="No boosts yet" message="Boost an approved property or service to reach more people." />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2" data-testid="boost-list">
          {list.data.items.map((ad) => {
            const [label, tone] = STATUS[ad.status] || [ad.status, 'neutral'];
            return (
              <article key={ad._id} className="card flex flex-col p-4" data-testid="boost-card" data-status={ad.status}>
                <div className="flex gap-3">
                  <Thumb src={ad.listing?.photo?.url ? mediaHref(ad.listing.photo.url) : null} icon={ad.kind === 'property' ? 'fa-solid fa-building' : 'fa-solid fa-screwdriver-wrench'} className="h-16 w-20" />
                  <div className="min-w-0 flex-1">
                    <Badge tone={tone}>{label}</Badge>
                    <p className="mt-1 break-words text-sm font-bold text-gray-800">{ad.listingTitle}</p>
                    <p className="mt-0.5 text-[11px] text-azea-muted">
                      <Icon name="fa-solid fa-location-dot" className="mr-1" />
                      {[ad.area, ad.city].filter(Boolean).join(', ')} · {ad.days} day{ad.days === 1 ? '' : 's'} · {ad.kind === 'property' ? 'Property' : 'Service'}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-gray-500">{ad.startsAt ? (ad.status === 'active' ? `Running until ${formatDate(ad.endsAt)}` : `Ran ${formatDate(ad.startsAt)} – ${formatDate(ad.endsAt)}`) : `Requested ${formatDate(ad.createdAt)}`}</p>
                {ad.reviewNote ? <p className={`mt-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed ${ad.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-azea-purpleLight/60 text-azea-purpleDark'}`}>{ad.reviewNote}</p> : null}
                {['pending', 'active'].includes(ad.status) && (
                  <div className="mt-3">
                    <Button variant="danger-outline" icon={ad.status === 'active' ? 'fa-solid fa-stop' : 'fa-solid fa-xmark'} onClick={() => setStopping(ad)} data-testid="boost-cancel">
                      {ad.status === 'active' ? 'Stop boost' : 'Withdraw request'}
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(stopping)}
        onClose={() => !busy && setStopping(null)}
        busy={busy}
        title={running ? 'Stop this boost?' : 'Withdraw this request?'}
        message={running ? 'Your post stops showing as sponsored right away. This can’t be undone; you can request a new boost later.' : 'NIVASA will no longer review it.'}
        confirmLabel={running ? 'Stop boost' : 'Withdraw'}
        onConfirm={() => stop()}
      />
    </div>
  );
}
