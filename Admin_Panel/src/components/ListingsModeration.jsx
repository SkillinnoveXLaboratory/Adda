import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, mediaHref } from '../lib/api.js';
import { useAction, usePaged } from '../lib/hooks.js';
import { formatDateTime, formatINR, formatNumber, formatPhone, formatRelative, humanize, plural } from '../lib/format.js';
import { Badge, Button, cx, EmptyState, Icon, PageHeader, Tabs } from './ui.jsx';
import { DataTable, Pagination, Toolbar } from './DataTable.jsx';
import { Checkbox, Select } from './Form.jsx';
import { Drawer, ReasonDialog } from './Modal.jsx';
import { useToast } from './Toast.jsx';

const KIND_ICON = { property: 'fa-solid fa-house', marketplace: 'fa-solid fa-tag', service: 'fa-solid fa-screwdriver-wrench', product: 'fa-solid fa-box' };
const KINDS = ['property', 'marketplace', 'service', 'product'];
const KIND_NOUN = { service: 'service', product: 'product' };
const kindPlural = (kind) => ({ service: 'services', product: 'products' })[kind] || `${kind} listings`;
const PRICE_SUFFIX = { starting_from: 'from', per_hour: '/hour', per_visit: '/visit' };
/** Listing price as the owner set it (services can be "on request" or per hour / visit). */
export const priceText = (l, kind, whole = true) => {
  if (kind === 'service') {
    if (l.priceType === 'on_quote' || !(l.pricePaise > 0)) return 'On request';
    const p = formatINR(l.pricePaise, { whole });
    return l.priceType === 'starting_from' ? `From ${p}` : PRICE_SUFFIX[l.priceType] ? `${p} ${PRICE_SUFFIX[l.priceType]}` : p;
  }
  return formatINR(l.pricePaise, { whole });
};

const DECISION = { approved: ['Approve', 'success-outline', 'fa-solid fa-check'], rejected: ['Reject', 'danger-outline', 'fa-solid fa-xmark'], removed: ['Remove', 'danger-outline', 'fa-regular fa-trash-can'] };

/**
 * Property / marketplace / service-offer / vendor-product moderation queue (products: platform only).
 * society: GET /society/listings, POST /society/listings/:kind/:id/moderate
 * platform: GET /platform/listings (+scope, reported), POST /platform/listings/:kind/:id/moderate
 */
export function ListingsModeration({ platform = false, onChanged, readOnly = false }) {
  const toast = useToast();
  const base = platform ? '/platform/listings' : '/society/listings';
  const [params] = useSearchParams();
  // ?kind=product (linked from a vendor's page) opens that tab.
  const [kind, setKind] = useState(() => (KINDS.includes(params.get('kind')) && (platform || params.get('kind') !== 'product') ? params.get('kind') : 'property'));
  const [status, setStatus] = useState('pending');
  const [scope, setScope] = useState('');
  const [reported, setReported] = useState(false);
  const list = usePaged((p) => api.get(base, { ...p, sort: reported ? '-reportCount' : '-createdAt', kind, reported: reported ? 'true' : undefined, scope: scope || undefined }), { kind, status, scope, reported });
  const [act, setAct] = useState(null); // { item, decision }
  const [view, setView] = useState(null);
  const [run, busy] = useAction((note) => api.post(`${base}/${kind}/${act.item._id}/moderate`, { decision: act.decision, note: note || undefined }), {
    toast,
    success: () => `Listing ${act.decision}`,
    onDone: () => (setAct(null), setView(null), list.reload(), onChanged?.()),
  });

  const owner = (l) => l.owner || l.seller || l.provider || l.vendor;
  const describe = (l) =>
    kind === 'property'
      ? `${humanize(l.listingType)} · ${humanize(l.propertyType)}${l.bedrooms ? ` · ${l.bedrooms} BHK` : ''}`
      : kind === 'service'
        ? [l.category?.name, l.experienceYears ? `${l.experienceYears} yrs exp.` : null].filter(Boolean).join(' · ')
        : kind === 'product'
          ? [l.category?.name, l.unit, l.status === 'paused' ? 'Paused by vendor' : null].filter(Boolean).join(' · ')
          : humanize(l.condition);
  // readOnly (Listings · view only): no moderation buttons.
  const decisions = (l) => (readOnly ? [] : ['approved', 'rejected', 'removed']).filter((d) => d !== l.moderationStatus && !(d === 'rejected' && l.moderationStatus === 'removed'));
  const columns = [
    {
      key: 'title',
      header: 'Listing',
      render: (l) => (
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-gray-400">{l.photos?.[0]?.url ? <img src={mediaHref(l.photos[0].url)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Icon name={KIND_ICON[kind]} />}</span>
          <div className="min-w-0 max-w-[300px]">
            <p className="flex items-center gap-1.5 font-semibold text-gray-700"><span className="truncate">{l.title}</span>{l.reportCount > 0 && <Badge tone="danger">{l.reportCount} report{l.reportCount > 1 ? 's' : ''}</Badge>}</p>
            <p className="truncate text-[11px] text-gray-400">{[describe(l), [l.locality || l.serviceArea, l.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      ),
    },
    { key: 'price', header: kind === 'product' ? 'Vendor price' : 'Price', align: 'right', render: (l) => <span className="font-semibold text-gray-700">{priceText(l, kind)}{kind === 'property' && l.listingType === 'rent' ? <span className="text-[10px] font-normal text-gray-400">/mo</span> : null}{kind === 'product' && l.unit ? <span className="block text-[10px] font-normal text-gray-400">per {l.unit}</span> : null}</span> },
    ...(kind === 'product' ? [{ key: 'stock', header: 'Stock', align: 'right', render: (l) => (l.stock > 0 ? formatNumber(l.stock) : <Badge tone="danger">Out of stock</Badge>) }] : []),
    ...(platform && kind !== 'product' ? [{ key: 'society', header: 'Society', render: (l) => l.society?.name || <span className="text-gray-400">Independent</span> }] : []),
    {
      key: 'owner',
      header: { property: 'Vendor', marketplace: 'Seller', service: 'Vendor', product: 'Vendor' }[kind],
      render: (l) =>
        kind === 'product' ? (
          <div className="min-w-0 max-w-[160px]">
            <p className="truncate font-medium text-gray-700">{owner(l)?.name || '—'}</p>
            {owner(l)?.phone && <p className="truncate font-mono text-[11px] text-gray-400">{owner(l).phone}</p>}
          </div>
        ) : (
          owner(l)?.name || '—'
        ),
    },
    { key: 'created', header: 'Posted', render: (l) => formatRelative(l.createdAt) },
    { key: 'status', header: 'Status', render: (l) => <Badge status={l.moderationStatus} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (l) => (
        <div className="flex justify-end gap-2">
          {decisions(l).map((d) => (
            <Button key={d} size="xs" variant={DECISION[d][1]} icon={DECISION[d][2]} className="!px-2" aria-label={`${DECISION[d][0]} ${l.title}`} title={DECISION[d][0]} onClick={(e) => (e.stopPropagation(), setAct({ item: l, decision: d }))} data-testid={`listing-${d}`} />
          ))}
        </div>
      ),
    },
  ];

  const v = view;
  return (
    <div>
      <PageHeader title={platform ? 'Listings moderation' : 'Listings'} subtitle={platform ? 'Property listings, services and products from verified vendors, and marketplace listings from members, across Nivasa' : 'Listings linked to your society'} />
      <Tabs
        className="mb-4"
        tabs={[
          { value: 'property', label: 'Property', icon: 'fa-solid fa-house' },
          { value: 'marketplace', label: 'Marketplace', icon: 'fa-solid fa-tag' },
          { value: 'service', label: 'Services', icon: KIND_ICON.service },
          ...(platform ? [{ value: 'product', label: 'Products', icon: KIND_ICON.product }] : []),
        ]}
        value={kind}
        onChange={setKind}
      />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'listing', 'listings')}</span>}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Moderation status" className="sm:w-40">
            {['pending', 'approved', 'rejected', 'removed'].map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
          {platform && kind !== 'product' && (
            <Select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope" className="sm:w-48">
              <option value="">All listings</option>
              <option value="independent">Independent (no society)</option>
            </Select>
          )}
          {platform && <Checkbox checked={reported} onChange={setReported} label="Reported only" />}
        </Toolbar>
        <DataTable testId="listings-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} onRowClick={setView} empty={<EmptyState compact icon={KIND_ICON[kind]} title={`No ${status} ${kindPlural(kind)}`} message={status === 'pending' ? 'New listings that need review appear here.' : undefined} />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>

      <Drawer
        open={Boolean(v)}
        onClose={() => setView(null)}
        title={v?.title}
        subtitle={v ? `Posted ${formatDateTime(v.createdAt)}` : ''}
        footer={
          v && (
            <>
              {decisions(v).map((d) => (
                <Button key={d} variant={DECISION[d][1]} icon={DECISION[d][2]} onClick={() => setAct({ item: v, decision: d })}>
                  {DECISION[d][0]}
                </Button>
              ))}
            </>
          )
        }
      >
        {v && (
          <div className="space-y-5">
            {v.photos?.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {v.photos.map((p) => (
                  <a key={p._id} href={mediaHref(p.url)} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-gray-100">
                    <img src={mediaHref(p.url)} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Badge status={v.moderationStatus} />
              <span className="text-lg font-bold text-gray-800">{priceText(v, kind, false)}</span>
              {kind === 'product' && <span className="text-[11px] text-gray-400">vendor price{v.unit ? ` per ${v.unit}` : ''} · members pay this + commission</span>}
              {v.negotiable && <Badge tone="info">Negotiable</Badge>}
            </div>
            {v.description && <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-600">{v.description}</p>}
            <dl className="grid grid-cols-2 gap-4 text-xs">
              {[
                ['Location', [v.locality || v.serviceArea, v.city].filter(Boolean).join(', ')],
                kind === 'property' ? ['Type', `${humanize(v.listingType)} · ${humanize(v.propertyType)}`] : ['Category', v.category?.name],
                kind === 'property' ? ['Area', v.areaSqft ? `${formatNumber(v.areaSqft)} sq ft` : null] : kind === 'service' ? ['Pricing', humanize(v.priceType)] : kind === 'product' ? ['Vendor price', formatINR(v.pricePaise)] : ['Condition', humanize(v.condition)],
                kind === 'property' ? ['Furnishing', v.furnishing && humanize(v.furnishing)] : kind === 'product' ? ['Unit', v.unit] : ['Visibility', humanize(v.visibility)],
                kind === 'product' && ['Stock', v.stock > 0 ? `${formatNumber(v.stock)} in stock` : 'Out of stock'],
                kind === 'product' && ['Max per order', v.maxPerOrder ? String(v.maxPerOrder) : null],
                kind === 'product' && ['Fulfilment', [v.delivery && `Delivery${v.deliveryChargePaise ? ` (${formatINR(v.deliveryChargePaise)})` : ' (free)'}`, v.pickup && 'Pickup'].filter(Boolean).join(' · ')],
                kind === 'product' && ['Selling', v.status === 'paused' ? 'Paused by vendor' : 'Active'],
                kind === 'product' && ['Vendor mobile', owner(v)?.phone ? <span className="font-mono">{owner(v).phone}</span> : null],
                kind === 'service' && ['Experience', v.experienceYears ? `${v.experienceYears} years` : null],
                kind === 'service' && ['Availability', v.availabilityNote],
                kind !== 'product' && ['Contact', [v.contactName, formatPhone(v.contactPhone)].filter((x) => x && x !== '—').join(' · ')],
                ['Posted by', platform && kind !== 'marketplace' && owner(v)?._id ? <Link className="link" to={`/admin/vendors/${owner(v)._id}`}>{owner(v).name || 'Vendor'}</Link> : owner(v)?.name],
                ['Reports', String(v.reportCount || 0)],
                v.moderationNote && ['Moderator note', v.moderationNote],
              ]
                .filter(Boolean)
                .map(([k, val]) => (
                  <div key={k}>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</dt>
                    <dd className={cx('mt-0.5 font-medium text-gray-700')}>{val || '—'}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}
      </Drawer>
      <ReasonDialog open={Boolean(act)} onClose={() => setAct(null)} onSubmit={(n) => run(n)} busy={busy} required={false} tone={act?.decision === 'approved' ? 'primary' : 'danger'} label={kind === 'marketplace' ? 'Note to the seller' : 'Note to the vendor'} title={`${DECISION[act?.decision]?.[0] || ''} ${KIND_NOUN[kind] || 'listing'}`} confirmLabel={DECISION[act?.decision]?.[0]} message={`“${act?.item?.title}” will be ${act?.decision}. The ${kind === 'marketplace' ? 'seller' : 'vendor'} is notified.`} />
    </div>
  );
}
