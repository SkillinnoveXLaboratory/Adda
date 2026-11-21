import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, mediaHref } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction, useQuery } from '../../lib/hooks.js';
import { formatDate, formatDateTime, formatINR, formatPhone, formatRelative, humanize, plural } from '../../lib/format.js';
import { Alert, Avatar, Badge, Button, Card, CopyField, Icon, KeyValue, PageHeader, PageSkeleton, QueryState } from '../../components/ui.jsx';
import { Modal, ReasonDialog } from '../../components/Modal.jsx';
import { MetricCard } from '../../components/Charts.jsx';
import { NetAmount, netCaption } from '../../components/Settlement.jsx';
import { KycBadge } from '../../components/KycBadge.jsx';
import { VendorPricingCard } from '../../components/VendorPricing.jsx';
import { LocationInfo } from '../../components/LocationInfo.jsx';
import { ShopLogo } from '../../components/ShopLogo.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useCounts } from '../../layout/Portals.jsx';

const DOCS = [
  ['panPhoto', 'PAN card'],
  ['aadhaarFront', 'Aadhaar · front'],
  ['aadhaarBack', 'Aadhaar · back'],
];
const PAYOUT_STATUS = {
  not_created: ['Not created', 'neutral'],
  pending: ['Pending', 'warning'],
  active: ['Active', 'success'],
  failed: ['Failed', 'danger'],
  blocked: ['Blocked', 'danger'],
};

/**
 * Cashfree Easy Split vendor account: needed before members can pay this vendor online (services, products).
 * Create / refresh → POST /platform/vendors/:id/payout (vendors.manage).
 */
function PayoutCard({ vendorId, payout, kycStatus, canManage, onSaved, className = '' }) {
  const toast = useToast();
  const po = payout || { status: 'not_created', available: false };
  const [label, tone] = PAYOUT_STATUS[po.status] || [humanize(po.status), 'neutral'];
  const [sync, syncing] = useAction(() => api.post(`/platform/vendors/${vendorId}/payout`), {
    toast,
    success: (r) => (r?.status === 'active' ? 'Payout account is active' : `Payout account: ${(PAYOUT_STATUS[r?.status]?.[0] || humanize(r?.status || 'updated')).toLowerCase()}`),
    onDone: onSaved,
  });
  const blocked = !po.available ? 'Cashfree is not configured on the server' : kycStatus !== 'approved' ? 'Approve the vendor’s KYC first' : null;
  return (
    <Card
      className={className}
      title="Cashfree payout account"
      actions={
        canManage && (
          <Button size="xs" variant="outline" icon="fa-solid fa-rotate-right" loading={syncing} disabledReason={blocked} onClick={() => sync()} data-testid="payout-sync">
            Create / refresh
          </Button>
        )
      }
    >
      <div data-testid="vendor-payout">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone={tone}>{label}</Badge>
          {po.ready && <span className="text-[11px] text-emerald-600">Members can pay this vendor online</span>}
        </div>
        {!po.available && (
          <Alert tone="warning" className="mb-3">
            Cashfree is not configured on the server, so payout accounts can’t be created and members can only pay this vendor in cash.
          </Alert>
        )}
        <KeyValue
          items={[
            ['Cashfree vendor id', po.cfVendorId ? <span key="cf" className="font-mono">{po.cfVendorId}</span> : null],
            ['Provider status', po.providerStatus],
            ['Message', po.message],
            ['Last updated', po.updatedAt ? formatDateTime(po.updatedAt) : null],
          ]}
        />
        <p className="mt-3 text-[11px] leading-relaxed text-brand-muted">
          Created from the approved KYC (bank + PAN) when KYC is approved. Online payments to this vendor need an <b>active</b> account; until then members pay cash (COD). The vendor’s account needs an email address.
          {!canManage && ' Creating or refreshing it needs the “Vendors & KYC · manage” permission.'}
        </p>
      </div>
    </Card>
  );
}

const spacedAadhaar = (a) => String(a || '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');

/** One private KYC document: thumbnail (image) or a PDF tile, opening the full file in a new tab. */
function DocumentTile({ label, doc }) {
  const href = doc?.url ? mediaHref(doc.url) : null;
  const pdf = doc?.mimeType === 'application/pdf';
  return (
    <figure className="min-w-0" data-testid="kyc-document">
      <figcaption className="mb-1.5 flex min-h-[2.5em] items-end text-[10px] font-bold uppercase leading-tight tracking-wider text-gray-400 sm:min-h-0">{label}</figcaption>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="group relative block aspect-[4/3] overflow-hidden rounded-lg border border-gray-200 bg-gray-50" aria-label={`Open ${label} full size`}>
          {pdf ? (
            <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-rose-500">
              <Icon name="fa-regular fa-file-pdf" className="text-3xl" />
              <span className="text-[11px] font-semibold text-gray-600">PDF document</span>
            </span>
          ) : (
            <img src={href} alt={label} className="h-full w-full object-cover" loading="lazy" />
          )}
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gray-900/60 py-1.5 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Icon name="fa-solid fa-up-right-from-square" /> Open full size
          </span>
        </a>
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50 text-gray-400">
          <Icon name="fa-regular fa-image" className="text-xl" />
          <span className="text-[11px]">Not uploaded</span>
        </div>
      )}
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="link mt-1.5 inline-flex items-center gap-1 text-[11px]">
          Open full size <Icon name="fa-solid fa-up-right-from-square" className="text-[9px]" />
        </a>
      )}
    </figure>
  );
}

/** Decrypted KYC numbers. Kept only in this component's state while the dialog is open. */
function RevealedModal({ data, onClose }) {
  return (
    <Modal
      open={Boolean(data)}
      onClose={onClose}
      icon="fa-solid fa-eye"
      title="Full KYC details"
      subtitle="This view was written to the audit log. Nothing is saved — closing this window clears it."
      footer={
        <Button variant="secondary" icon="fa-solid fa-eye-slash" onClick={onClose} data-testid="revealed-close">
          Hide
        </Button>
      }
    >
      {data && (
        <div className="space-y-3" data-testid="kyc-revealed">
          <CopyField label="PAN" value={data.pan || '—'} />
          <CopyField label="Aadhaar" value={data.aadhaar ? spacedAadhaar(data.aadhaar) : '—'} />
          <CopyField label="Bank account number" value={data.bankAccountNumber || '—'} />
          <CopyField label="Mobile" value={data.phone ? formatPhone(data.phone) : '—'} />
        </div>
      )}
    </Modal>
  );
}

/** Vendor account: business + masked KYC, private documents, review (approve / reject) and the logged reveal. */
export default function VendorDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { refreshCounts } = useCounts();
  const { canManage, canView } = useAuth();
  const manage = canManage('vendors'); // KYC approve / reject and reveal
  const q = useQuery(() => api.get(`/platform/vendors/${id}`), [id]);
  const [modal, setModal] = useState(null); // 'approve' | 'reject' | 'reveal'
  const [revealed, setRevealed] = useState(null);
  useEffect(() => setRevealed(null), [id]);
  const done = () => (setModal(null), q.reload(), refreshCounts());

  const [decide, deciding] = useAction((decision, note) => api.post(`/platform/vendors/${id}/kyc`, { decision, note: note || undefined }), {
    toast,
    success: (p) => (p.kycStatus === 'approved' ? 'KYC approved. The vendor can now post listings.' : 'KYC rejected. The vendor was told what to fix.'),
    onDone: done,
  });
  const [reveal, revealing] = useAction((reason) => api.post(`/platform/vendors/${id}/reveal`, { reason }), { toast, onDone: (r) => (setRevealed(r), setModal(null)) });

  return (
    <QueryState query={q} skeleton={<PageSkeleton cards={4} rows={6} />}>
      {({ user: u, profile: p, counts, kycAvailable, settlement, pricing, payout }) => {
        const status = p?.kycStatus || 'not_submitted';
        const canApprove = ['pending', 'rejected'].includes(status);
        const canReject = ['pending', 'approved'].includes(status);
        const hasNumbers = Boolean(p?.pan || p?.aadhaar || p?.bankAccount);
        const revealBlocked = !kycAvailable ? 'Vendor verification isn’t set up on this server' : !hasNumbers ? 'No KYC details submitted yet' : null;
        return (
          <div data-testid="vendor-detail">
            <PageHeader
              back={
                <Link to="/admin/vendors" className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-brand">
                  <Icon name="fa-solid fa-arrow-left" /> Vendors
                </Link>
              }
              title={p?.businessName || u.name || 'Unnamed vendor'}
              subtitle={`Vendor account · joined ${formatDate(u.createdAt)} · last sign-in ${u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'never'}`}
              actions={
                manage && (
                <>
                  <Button variant="outline" icon="fa-solid fa-eye" disabledReason={revealBlocked} onClick={() => setModal('reveal')} data-testid="kyc-reveal">
                    Reveal full details
                  </Button>
                  {canReject && (
                    <Button variant="danger-outline" icon="fa-solid fa-xmark" onClick={() => setModal('reject')} data-testid="kyc-reject">
                      Reject KYC
                    </Button>
                  )}
                  {canApprove && (
                    <Button variant="success" icon="fa-solid fa-check" onClick={() => setModal('approve')} data-testid="kyc-approve">
                      Approve KYC
                    </Button>
                  )}
                </>
                )
              }
            />

            {!kycAvailable && (
              <Alert tone="warning" className="mb-5" title="Vendor verification is not available on this server">
                The server has no KYC encryption key, so vendors can’t submit KYC and full details can’t be revealed. Ask the server administrator to add the KYC encryption key to the server settings.
              </Alert>
            )}
            {status === 'not_submitted' && (
              <Alert tone="info" className="mb-5" title="KYC not submitted">
                This vendor hasn’t sent PAN, Aadhaar and bank details yet. Until KYC is approved they can’t post property or service listings or run ads.
              </Alert>
            )}
            {status === 'pending' && (
              <Alert tone="warning" className="mb-5" title={manage ? 'Waiting for your review' : 'KYC waiting for review'}>
                {manage ? 'Check that the PAN and Aadhaar photos are readable and match the business details, then approve or reject. The vendor is notified either way.' : 'You can see this vendor’s KYC; approving or rejecting it needs the “Vendors & KYC · manage” permission.'}
              </Alert>
            )}
            {status === 'rejected' && (
              <Alert tone="danger" className="mb-5" title="KYC rejected">
                {p?.kycNote || 'No note recorded.'} {p?.reviewedAt && <span className="opacity-80">· {formatDateTime(p.reviewedAt)}</span>}
              </Alert>
            )}

            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 xl:grid-cols-6">
              <MetricCard tone="purple" label="Properties" value={counts.properties} icon="fa-solid fa-house" />
              <MetricCard tone="cyan" label="Services" value={counts.services} icon="fa-solid fa-screwdriver-wrench" />
              <MetricCard tone="green" label="Bookings" value={counts.bookings} icon="fa-regular fa-calendar-check" />
              <MetricCard
                tone="purple"
                label="Products"
                value={counts.products ?? 0}
                icon="fa-solid fa-box"
                testId="vendor-products-count"
                footer={
                  canView('listings') ? (
                    <Link to="/admin/listings?kind=product" className="link text-[11px]">
                      Product moderation
                    </Link>
                  ) : null
                }
              />
              <MetricCard
                tone="cyan"
                label="Orders"
                value={counts.orders ?? 0}
                icon="fa-solid fa-bag-shopping"
                testId="vendor-orders-count"
                footer={
                  canView('orders') ? (
                    <Link to={`/admin/product-orders?vendorId=${u._id}`} className="link text-[11px]" data-testid="vendor-orders-link">
                      View product orders
                    </Link>
                  ) : null
                }
              />
              <MetricCard tone="orange" label="Ads" value={counts.ads} icon="fa-solid fa-rocket" />
            </div>

            <Card
              className="mb-6"
              title="Bookings & commission"
              actions={
                (canView('earnings') || canView('service_bookings')) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {canView('earnings') && (
                      <Link to={`/admin/earnings?vendorId=${u._id}`} className="link inline-flex items-center gap-1.5 text-xs" data-testid="vendor-earnings-link">
                        View earnings <Icon name="fa-solid fa-arrow-right" className="text-[10px]" />
                      </Link>
                    )}
                    {canView('service_bookings') && (
                      <Link to={`/admin/service-bookings?vendorId=${u._id}`} className="link inline-flex items-center gap-1.5 text-xs" data-testid="vendor-bookings-link">
                        View service bookings <Icon name="fa-solid fa-arrow-right" className="text-[10px]" />
                      </Link>
                    )}
                  </div>
                )
              }
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6" data-testid="vendor-settlement">
                {[
                  ['Paid bookings', String(settlement?.paidBookings ?? 0)],
                  ['Cash collected', formatINR(settlement?.cashCollectedPaise ?? 0)],
                  ['Commission', formatINR(settlement?.commissionPaise ?? 0)],
                  ['Member discounts', formatINR(settlement?.memberDiscountsPaise ?? 0)],
                  ['Vendor earnings', formatINR(settlement?.vendorEarningsPaise ?? 0)],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                    <p className="truncate text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</p>
                    <p className="mt-1 truncate text-base font-bold text-gray-800">{v}</p>
                  </div>
                ))}
                <div className="min-w-0 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                  <p className="truncate text-[10px] font-bold uppercase tracking-wider text-gray-400">NIVASA net</p>
                  <p className="mt-1 truncate text-base" data-testid="vendor-settlement-net">
                    <NetAmount paise={settlement?.netToPlatformPaise ?? 0} className="!font-bold" />
                  </p>
                  <p className="truncate text-[10px] text-gray-400">{netCaption(settlement?.netToPlatformPaise || 0, true)}</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-brand-muted">
                Fixed when the vendor records cash for a completed booking ({plural(counts.bookings, 'booking')} in total). NIVASA net = commission − member discounts; the vendor collects the cash, so this is what they owe NIVASA. Vendor earnings = cash − NIVASA net.
              </p>
            </Card>

            <div className="mb-6 grid grid-cols-12 gap-6">
              <VendorPricingCard className="col-span-12 lg:col-span-7" vendorId={u._id} pricing={pricing || p?.pricing} canEdit={manage} onSaved={q.reload} />
              <Card className="col-span-12 lg:col-span-5" title="Shop">
                <div className="mb-4 flex items-center gap-3" data-testid="vendor-shop">
                  <ShopLogo url={p?.shop?.logo?.url} alt={`${p?.shop?.name || 'Shop'} logo`} size="lg" testId="vendor-shop-logo" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-800" data-testid="vendor-shop-name">{p?.shop?.name || <span className="font-medium text-gray-400">No shop name yet</span>}</p>
                    <p className="text-[11px] text-gray-400">{p?.shop?.logo?.url ? 'Shown with the vendor’s services' : 'No logo uploaded'}</p>
                  </div>
                </div>
                <KeyValue cols={1} items={[['Shop location', <LocationInfo key="loc" location={p?.shop?.location} empty="Not set — this vendor’s services don’t appear in members’ “near me” search" testId="vendor-shop-location" />]]} />
                <p className="mt-4 text-[11px] text-brand-muted">The vendor sets the shop name, logo and location in the app (Shop settings).</p>
              </Card>
            </div>

            <PayoutCard className="mb-6" vendorId={u._id} payout={payout} kycStatus={status} canManage={manage} onSaved={q.reload} />

            <div className="mb-6 grid grid-cols-12 gap-6">
              <Card className="col-span-12 lg:col-span-5" title="Account">
                <div className="mb-4 flex items-center gap-3">
                  <Avatar name={u.name} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-800">{u.name || 'Unnamed'}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge status={u.status} />
                      <Badge tone="info">Vendor</Badge>
                      <KycBadge status={status} long />
                    </div>
                  </div>
                </div>
                <KeyValue
                  items={[
                    ['Mobile', <span key="m" className="font-mono">{u.phone || '—'}</span>],
                    ['Joined', formatDate(u.createdAt)],
                    ['Last sign-in', u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'Never'],
                  ]}
                />
                {canView('members') && (
                  <Link to={`/admin/members/${u._id}`} className="link mt-4 inline-flex items-center gap-1.5 text-xs">
                    <Icon name="fa-regular fa-user" /> Open account profile (sessions, password, disable)
                  </Link>
                )}
              </Card>
              <Card className="col-span-12 lg:col-span-7" title="Business">
                <KeyValue
                  items={[
                    ['Business name', p?.businessName],
                    ['Type', p?.businessType ? humanize(p.businessType) : null],
                    ['City', p?.city],
                    ['Address', p?.address],
                    ['KYC submitted', p?.submittedAt ? formatDateTime(p.submittedAt) : 'Not yet'],
                    ['Reviewed', p?.reviewedAt ? formatDateTime(p.reviewedAt) : '—'],
                    ['Consent given', p?.consentAt ? formatDateTime(p.consentAt) : '—'],
                    ['Review note', p?.kycNote],
                  ]}
                />
              </Card>
            </div>

            <div className="grid grid-cols-12 gap-6">
              <Card className="col-span-12 lg:col-span-5" title="Identity & bank (masked)">
                <KeyValue
                  items={[
                    ['PAN', <span key="pan" className="font-mono" data-testid="kyc-pan">{p?.pan || '—'}</span>],
                    ['Aadhaar', <span key="aad" className="font-mono" data-testid="kyc-aadhaar">{p?.aadhaar || '—'}</span>],
                    ['Account holder', p?.bankAccountHolder],
                    ['Account number', <span key="acc" className="font-mono">{p?.bankAccount || '—'}</span>],
                    ['IFSC', <span key="ifsc" className="font-mono">{p?.bankIfsc || '—'}</span>],
                    ['Bank', p?.bankName],
                  ]}
                />
                <p className="mt-4 text-[11px] leading-relaxed text-brand-muted">
                  Numbers are stored encrypted. <b>Reveal full details</b> asks for a reason and writes who viewed them, and why, to the audit log.
                </p>
              </Card>
              <Card
                className="col-span-12 lg:col-span-7"
                title="Documents"
                actions={
                  <Button size="xs" variant="ghost" icon="fa-solid fa-rotate-right" onClick={q.reload} loading={q.reloading}>
                    Refresh links
                  </Button>
                }
              >
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                  {DOCS.map(([key, label]) => (
                    <DocumentTile key={key} label={label} doc={p?.documents?.[key]} />
                  ))}
                </div>
                <p className="mt-4 text-[11px] text-brand-muted">Private files. Links expire after 15 minutes — use Refresh links if one stops opening.</p>
              </Card>
            </div>

            <ReasonDialog open={modal === 'approve'} onClose={() => setModal(null)} onSubmit={(n) => decide('approved', n)} busy={deciding} required={false} tone="primary" label="Note to the vendor" placeholder="e.g. Documents verified" title="Approve KYC" confirmLabel="Approve KYC" message={`${p?.businessName || u.name} will be able to post property and service listings and request ads. The vendor is notified.`} />
            <ReasonDialog open={modal === 'reject'} onClose={() => setModal(null)} onSubmit={(n) => decide('rejected', n)} busy={deciding} label="What needs to change (sent to the vendor)" placeholder="e.g. Aadhaar back photo is blurred — please upload a clear photo" title="Reject KYC" confirmLabel="Reject KYC" message={status === 'approved' ? 'The vendor loses verified status and can’t post new listings or ads until KYC is approved again.' : 'The vendor can correct the details and submit again.'} />
            <ReasonDialog open={modal === 'reveal'} onClose={() => setModal(null)} onSubmit={(r) => reveal(r)} busy={revealing} tone="primary" title="Reveal full KYC details" confirmLabel="Reveal" placeholder="e.g. Matching PAN number against the uploaded card" message="PAN, Aadhaar, bank account and mobile are shown once and not saved. Your reason is written to the audit log." />
            <RevealedModal data={revealed} onClose={() => setRevealed(null)} />
          </div>
        );
      }}
    </QueryState>
  );
}
