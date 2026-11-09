import { useState } from 'react';
import { Link } from 'react-router';
import { api, mediaHref } from '../../lib/api.js';
import { useAction, usePaged, useQuery } from '../../lib/hooks.js';
import { formatDate, formatDateTime, formatNumber, formatRelative, humanize, plural } from '../../lib/format.js';
import { Alert, Badge, Button, EmptyState, ErrorState, Icon, KeyValue, PageHeader, Skeleton, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Select } from '../../components/Form.jsx';
import { Drawer, ReasonDialog } from '../../components/Modal.jsx';
import { priceText } from '../../components/ListingsModeration.jsx';
import { KycBadge } from '../../components/KycBadge.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useCounts } from '../../layout/Portals.jsx';

const KIND = { property: ['Property', 'fa-solid fa-house'], service: ['Service', 'fa-solid fa-screwdriver-wrench'] };
const STATUS_TONE = { pending: 'warning', active: 'success', expired: 'neutral', rejected: 'danger', cancelled: 'neutral' };
const EMPTY = {
  pending: ['No ads waiting for review', 'When a verified vendor asks to boost a listing it appears here.'],
  active: ['No ads running', undefined],
  expired: ['No expired ads', undefined],
  rejected: ['No rejected ads', undefined],
  cancelled: ['No cancelled ads', 'Ads the vendor withdrew or stopped early show here.'],
  all: ['No ads yet', undefined],
};
const where = (a) => [a.area, a.city].filter(Boolean).join(', ');
const AdStatus = ({ status }) => <Badge tone={STATUS_TONE[status]}>{humanize(status)}</Badge>;

/** The listing behind an ad, as the vendor posted it. */
function ListingDetail({ l, kind }) {
  const photos = l.photos || [];
  return (
    <div className="space-y-4">
      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <a key={p._id} href={mediaHref(p.url)} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-gray-100">
              <img src={mediaHref(p.url)} alt="" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
          <Icon name="fa-regular fa-image" className="mr-1.5" /> No photos on this listing
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold text-gray-800">
          {priceText(l, kind, false)}
          {kind === 'property' && l.listingType === 'rent' && <span className="text-xs font-normal text-gray-400"> /month</span>}
        </span>
        <Badge status={l.moderationStatus}>Listing {humanize(l.moderationStatus).toLowerCase()}</Badge>
        {kind === 'property' && l.availability && l.availability !== 'available' && <Badge tone="danger">{humanize(l.availability)}</Badge>}
        {kind === 'service' && l.status && l.status !== 'active' && <Badge tone="danger">{humanize(l.status)}</Badge>}
      </div>
      {l.description && <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-600">{l.description}</p>}
      <KeyValue
        items={
          kind === 'property'
            ? [
                ['Type', `${humanize(l.listingType)} · ${humanize(l.propertyType)}`],
                ['Location', [l.locality, l.city].filter(Boolean).join(', ')],
                ['Bedrooms / bathrooms', l.bedrooms || l.bathrooms ? `${l.bedrooms ?? '—'} / ${l.bathrooms ?? '—'}` : null],
                ['Area', l.areaSqft ? `${formatNumber(l.areaSqft)} sq ft` : null],
                ['Furnishing', l.furnishing && humanize(l.furnishing)],
                ['Amenities', l.amenities?.length ? l.amenities.join(', ') : null],
                ['Posted', formatDate(l.createdAt)],
              ]
            : [
                ['Category', l.category?.name],
                ['Pricing', humanize(l.priceType)],
                ['Service area', [l.serviceArea, l.city].filter(Boolean).join(', ')],
                ['Experience', l.experienceYears ? `${l.experienceYears} years` : null],
                ['Availability', l.availabilityNote],
                ['Posted', formatDate(l.createdAt)],
              ]
        }
      />
    </div>
  );
}

function AdDrawer({ adId, onClose, onDecide, readOnly }) {
  const q = useQuery(() => (adId ? api.get(`/platform/ads/${adId}`) : Promise.resolve(null)), [adId]);
  const a = q.data;
  const kind = a?.kind;
  return (
    <Drawer
      open={Boolean(adId)}
      onClose={onClose}
      title={a ? a.listingTitle : 'Ad'}
      subtitle={a ? `${KIND[kind]?.[0] || ''} ad · requested ${formatDateTime(a.createdAt)}` : ''}
      footer={
        a?.status === 'pending' &&
        !readOnly && (
          <>
            <Button variant="danger-outline" icon="fa-solid fa-xmark" onClick={() => onDecide(a, 'rejected')} data-testid="ad-reject">
              Reject
            </Button>
            <Button variant="success" icon="fa-solid fa-check" onClick={() => onDecide(a, 'approved')} data-testid="ad-approve">
              Approve ad
            </Button>
          </>
        )
      }
    >
      {q.loading && !a && (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {q.error && !a && <ErrorState compact error={q.error} onRetry={q.reload} />}
      {a && (
        <div className="space-y-6" data-testid="ad-detail">
          <section>
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">Boost requested</h3>
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <AdStatus status={a.status} />
                <Badge tone="info">
                  <Icon name={KIND[kind]?.[1]} className="mr-1" />
                  {KIND[kind]?.[0]}
                </Badge>
              </div>
              <KeyValue
                items={[
                  ['Location', where(a)],
                  ['Duration', plural(a.days, 'day')],
                  a.startsAt && ['Runs', `${formatDate(a.startsAt)} → ${formatDate(a.endsAt)}`],
                  ['Requested', formatDateTime(a.createdAt)],
                  a.reviewedAt && ['Reviewed', formatDateTime(a.reviewedAt)],
                  a.reviewNote && ['Review note', a.reviewNote],
                ]}
              />
              {a.status === 'pending' && <p className="mt-3 text-[11px] leading-relaxed text-brand-muted">If approved, the listing is shown first in its category in {a.city}, marked Sponsored, for {plural(a.days, 'day')} starting now. No payment is taken for ads.</p>}
            </div>
          </section>
          <section>
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">Vendor</h3>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-800">{a.vendor?.businessName || a.vendor?.name || 'Unknown vendor'}</p>
                <p className="truncate text-[11px] text-gray-400">{[a.vendor?.businessName && a.vendor?.name, a.vendor?.phone, a.vendor?.city].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex items-center gap-2">
                <KycBadge status={a.vendor?.kycStatus} long />
                {a.vendor?._id && (
                  <Link to={`/admin/vendors/${a.vendor._id}`} className="link text-[11px]">
                    View vendor
                  </Link>
                )}
              </div>
            </div>
            {a.status === 'pending' && a.vendor?.kycStatus !== 'approved' && (
              <Alert tone="warning" className="mt-3">
                This vendor’s KYC is no longer approved. Consider rejecting the ad.
              </Alert>
            )}
          </section>
          <section>
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">Listing</h3>
            {a.listingDetail ? <ListingDetail l={a.listingDetail} kind={kind} /> : <Alert tone="warning">The listing was deleted. This ad can’t run.</Alert>}
          </section>
        </div>
      )}
    </Drawer>
  );
}

/** Vendor "boost" requests: review queue and history. GET /platform/ads, POST /platform/ads/:id/review */
export default function Ads() {
  const toast = useToast();
  const { counts, refreshCounts } = useCounts();
  const { canManage } = useAuth();
  const manage = canManage('ads'); // approve / reject
  const [status, setStatus] = useState('pending');
  const [kind, setKind] = useState('');
  const list = usePaged((p) => api.get('/platform/ads', { ...p, kind: kind || undefined, sort: status === 'pending' ? 'createdAt' : '-createdAt' }), { status, kind });
  const [view, setView] = useState(null);
  const [act, setAct] = useState(null); // { ad, decision }
  const [run, busy] = useAction((note) => api.post(`/platform/ads/${act.ad._id}/review`, { decision: act.decision, note: note || undefined }), {
    toast,
    success: (r) => (r.status === 'active' ? `Ad approved — sponsored in ${r.city} until ${formatDate(r.endsAt)}` : 'Ad rejected. The vendor was told why.'),
    onDone: () => (setAct(null), setView(null), list.reload(), refreshCounts()),
  });

  const columns = [
    {
      key: 'listing',
      header: 'Listing',
      render: (a) => (
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-gray-400">{a.listing?.photo?.url ? <img src={mediaHref(a.listing.photo.url)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Icon name={KIND[a.kind]?.[1]} />}</span>
          <div className="min-w-0 max-w-[260px]">
            <p className="truncate font-semibold text-gray-700">{a.listing?.title || a.listingTitle}</p>
            <p className="truncate text-[11px] text-gray-400">{a.listing ? (a.listing.moderationStatus === 'approved' ? a.listing.city : `Listing ${humanize(a.listing.moderationStatus).toLowerCase()}`) : 'Listing deleted'}</p>
          </div>
        </div>
      ),
    },
    { key: 'kind', header: 'Kind', render: (a) => KIND[a.kind]?.[0] || humanize(a.kind) },
    { key: 'vendor', header: 'Vendor', render: (a) => (a.vendor?._id ? <Link to={`/admin/vendors/${a.vendor._id}`} className="link block max-w-[160px] truncate" onClick={(e) => e.stopPropagation()}>{a.vendor.name || 'Unnamed'}</Link> : '—') },
    { key: 'where', header: 'Location', render: (a) => <span className="block max-w-[180px] truncate">{where(a)}</span> },
    { key: 'days', header: 'Days', align: 'right', render: (a) => a.days },
    { key: 'created', header: 'Submitted', render: (a) => <span title={formatDateTime(a.createdAt)}>{formatRelative(a.createdAt)}</span> },
    { key: 'run', header: 'Start → end', render: (a) => (a.startsAt ? <span className="whitespace-nowrap">{formatDate(a.startsAt)} → {formatDate(a.endsAt)}</span> : <span className="text-gray-300">—</span>) },
    ...(status === 'all' ? [{ key: 'status', header: 'Status', render: (a) => <AdStatus status={a.status} /> }] : []),
    manage && {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) =>
        a.status === 'pending' ? (
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="success-outline" icon="fa-solid fa-check" className="!px-2" aria-label={`Approve ad for ${a.listingTitle}`} title="Approve" onClick={(e) => (e.stopPropagation(), setAct({ ad: a, decision: 'approved' }))} data-testid="ad-row-approve" />
            <Button size="xs" variant="danger-outline" icon="fa-solid fa-xmark" className="!px-2" aria-label={`Reject ad for ${a.listingTitle}`} title="Reject" onClick={(e) => (e.stopPropagation(), setAct({ ad: a, decision: 'rejected' }))} data-testid="ad-row-reject" />
          </div>
        ) : null,
    },
  ].filter(Boolean);
  const [emptyTitle, emptyMessage] = EMPTY[status];
  const approving = act?.decision === 'approved';
  return (
    <div>
      <PageHeader title="Ads (boosts)" subtitle="Verified vendors ask to show a listing first in its category and city, marked Sponsored. Review each request — no payment is taken." />
      <Tabs
        className="mb-4"
        tabs={[
          { value: 'pending', label: 'Pending', count: counts.pendingAds || undefined },
          { value: 'active', label: 'Active' },
          { value: 'expired', label: 'Expired' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'cancelled', label: 'Cancelled' },
          { value: 'all', label: 'All' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'ad', 'ads')}</span>}>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Listing kind" className="sm:w-44">
            <option value="">Properties & services</option>
            <option value="property">Properties</option>
            <option value="service">Services</option>
          </Select>
        </Toolbar>
        <DataTable testId="ads-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} onRowClick={(a) => setView(a._id)} empty={<EmptyState compact icon="fa-solid fa-rocket" title={emptyTitle} message={emptyMessage} />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
      <AdDrawer adId={view} onClose={() => setView(null)} onDecide={(ad, decision) => setAct({ ad, decision })} readOnly={!manage} />
      <ReasonDialog
        open={Boolean(act)}
        onClose={() => setAct(null)}
        onSubmit={(n) => run(n)}
        busy={busy}
        required={!approving}
        tone={approving ? 'primary' : 'danger'}
        label={approving ? 'Note to the vendor' : 'Why is it rejected? (sent to the vendor)'}
        placeholder={approving ? 'e.g. Looks good' : 'e.g. Photos don’t match the listing'}
        title={approving ? 'Approve ad' : 'Reject ad'}
        confirmLabel={approving ? 'Approve ad' : 'Reject ad'}
        message={approving ? `“${act?.ad?.listingTitle}” is shown first and marked Sponsored in ${where(act?.ad || {})} for ${plural(act?.ad?.days, 'day')}, starting now. The vendor is notified.` : `The vendor is told why and can request a new boost.`}
      />
    </div>
  );
}
