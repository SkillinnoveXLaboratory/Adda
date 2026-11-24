import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, mediaHref } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction, usePaged, useQuery } from '../../lib/hooks.js';
import { formatDateTime, formatINR, formatNumber, plural } from '../../lib/format.js';
import { formatPercent } from '../../lib/pricing.js';
import { Alert, Badge, Button, cx, EmptyState, Icon, KeyValue, PageHeader } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Select } from '../../components/Form.jsx';
import { ConfirmDialog, Drawer } from '../../components/Modal.jsx';
import { MetricCard } from '../../components/Charts.jsx';
import { NetAmount, netCaption } from '../../components/Settlement.jsx';
import { VendorPicker } from '../../components/VendorPicker.jsx';
import { useToast } from '../../components/Toast.jsx';

/** Order status → [label, badge tone]. Same wording as the app's tracker. */
export const ORDER_STATUS = {
  awaiting_payment: ['Waiting for payment', 'warning'],
  placed: ['Placed', 'info'],
  confirmed: ['Confirmed', 'info'],
  packed: ['Packed', 'info'],
  shipped: ['Shipped', 'purple'],
  out_for_delivery: ['Out for delivery', 'purple'],
  ready_for_pickup: ['Ready for pickup', 'purple'],
  delivered: ['Delivered', 'success'],
  cancelled: ['Cancelled', 'neutral'],
};
const PAYMENT_STATUS = { unpaid: ['Unpaid', 'warning'], paid: ['Paid', 'success'], refund_pending: ['Refund pending', 'info'], refunded: ['Refunded', 'neutral'] };
const METHOD = { cod: 'Cash on delivery', online: 'Online' };

const money = (paise) => (paise === null || paise === undefined ? <span className="text-gray-300">—</span> : <span className="whitespace-nowrap">{formatINR(paise)}</span>);
const statusBadge = (s, map) => <Badge tone={map[s]?.[1] || 'neutral'}>{map[s]?.[0] || s}</Badge>;
const canRetryRefund = (o) => o?.payment?.status === 'refund_pending' && (o.payment.method === 'online' || o.paymentMethod === 'online');

function Timeline({ items }) {
  if (!items?.length) return <p className="text-xs text-gray-400">No status changes yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-gray-200 pl-5" data-testid="order-timeline">
      {items.map((t, i) => (
        <li key={`${t.status}-${i}`} className="relative">
          <span className={cx('absolute -left-[26px] top-0.5 flex h-3 w-3 rounded-full ring-4 ring-white', t.status === 'cancelled' ? 'bg-rose-400' : i === items.length - 1 ? 'bg-brand' : 'bg-gray-300')} aria-hidden="true" />
          <p className="text-xs font-semibold text-gray-700">{ORDER_STATUS[t.status]?.[0] || t.status}</p>
          <p className="text-[11px] text-gray-400">{formatDateTime(t.at)}</p>
          {t.note && <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-gray-600">{t.note}</p>}
        </li>
      ))}
    </ol>
  );
}

function OrderDrawer({ order: o, onClose, canSeeVendors, canRefund, onRetry, retrying }) {
  const s = o?.settlement;
  return (
    <Drawer
      open={Boolean(o)}
      onClose={onClose}
      busy={retrying}
      title={o ? `Order ${o.orderNumber}` : ''}
      subtitle={o ? `Placed ${formatDateTime(o.createdAt)}` : ''}
      footer={
        o &&
        canRefund &&
        canRetryRefund(o) && (
          <Button variant="outline" icon="fa-solid fa-rotate-left" onClick={onRetry} loading={retrying} data-testid="order-refund-retry">
            Retry refund
          </Button>
        )
      }
    >
      {o && (
        <div className="space-y-6" data-testid="order-detail">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-gray-400">{o.product?.photoUrl ? <img src={mediaHref(o.product.photoUrl)} alt="" className="h-full w-full object-cover" /> : <Icon name="fa-solid fa-box" />}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-800">{o.product?.title || 'Product'}</p>
              <p className="text-[11px] text-gray-400">
                {o.quantity} × {o.product?.unit || 'unit'} · {o.shopName || o.vendor?.name || 'Shop'}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {statusBadge(o.status, ORDER_STATUS)}
                {statusBadge(o.payment?.status, PAYMENT_STATUS)}
                <Badge tone="neutral">{METHOD[o.paymentMethod] || o.paymentMethod}</Badge>
              </div>
            </div>
          </div>
          {canRetryRefund(o) && (
            <Alert tone="warning" title="Refund not finished">
              The order was cancelled after an online payment and the refund hasn’t been confirmed by Cashfree yet. {canRefund ? 'Retry refund asks Cashfree again (it never refunds twice).' : 'Retrying it needs the “Vendors & KYC · manage” permission.'}
            </Alert>
          )}
          {o.status === 'cancelled' && (
            <Alert tone="info" title={`Cancelled by ${o.cancelledBy || 'unknown'}`}>
              {o.cancelReason || 'No reason given.'}
            </Alert>
          )}
          <KeyValue
            items={[
              ['Vendor', o.vendor?._id && canSeeVendors ? <Link key="v" className="link" to={`/admin/vendors/${o.vendor._id}`}>{o.vendor.name || 'Vendor'}</Link> : o.vendor?.name],
              ['Customer', [o.customer?.name, o.customer?.phone].filter(Boolean).join(' · ') || null],
              ['Fulfilment', o.fulfilment === 'pickup' ? 'Pickup from the shop' : 'Delivery'],
              o.fulfilment === 'pickup' ? ['Pickup address', o.pickupAddress] : ['Delivery address', o.address],
              ['Note from member', o.note],
              ['Paid', o.payment?.paidAt ? formatDateTime(o.payment.paidAt) : null],
              o.payment?.refundedAt ? ['Refunded', formatDateTime(o.payment.refundedAt)] : null,
            ]}
          />
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Price</p>
            <dl className="space-y-1.5 text-xs" data-testid="order-price">
              {[
                ['Vendor price', `${formatINR(o.vendorUnitPaise)} × ${o.quantity}`, formatINR(o.vendorTotalPaise)],
                [`Commission (${formatPercent(o.commissionPercent)})`, null, formatINR(o.commissionPaise)],
                ['Member price', `${formatINR(o.memberUnitPaise)} × ${o.quantity}`, formatINR(o.memberTotalPaise)],
                o.discountPaise ? ['Member discount', null, `−${formatINR(o.discountPaise)}`] : null,
                o.deliveryChargePaise ? ['Delivery charge (to the vendor)', null, formatINR(o.deliveryChargePaise)] : null,
              ]
                .filter(Boolean)
                .map(([k, sub, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-500">
                      {k} {sub && <span className="text-[11px] text-gray-400">· {sub}</span>}
                    </dt>
                    <dd className="whitespace-nowrap font-medium text-gray-700">{v}</dd>
                  </div>
                ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-gray-100 pt-1.5">
                <dt className="font-semibold text-gray-700">Payable</dt>
                <dd className="whitespace-nowrap text-sm font-bold text-gray-800">{formatINR(o.payablePaise)}</dd>
              </div>
            </dl>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Settlement</p>
            {s ? (
              <KeyValue
                cols={3}
                items={[
                  ['Collected', formatINR(s.cashPaise)],
                  ['NIVASA net', <NetAmount key="n" paise={s.netToPlatformPaise} />],
                  ['Vendor earnings', formatINR(s.vendorEarningsPaise)],
                ]}
              />
            ) : (
              <p className="text-xs text-gray-400">Not paid yet — fixed when the online payment is confirmed, or when a cash-on-delivery order is delivered.</p>
            )}
          </div>
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Timeline</p>
            <Timeline items={o.timeline} />
          </div>
        </div>
      )}
    </Drawer>
  );
}

/** Every vendor product order with its price snapshot, payment and settlement. GET /platform/product-orders (orders.view). */
export default function ProductOrders() {
  const toast = useToast();
  const { canView, canManage } = useAuth();
  const canSeeVendors = canView('vendors');
  const canRefund = canManage('vendors');
  const [params, setParams] = useSearchParams();
  const vendorId = params.get('vendorId') || '';
  const status = params.get('status') || '';
  const payment = params.get('payment') || '';
  const setFilter = (k, v) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );
  const list = usePaged((p) => api.get('/platform/product-orders', { ...p, vendorId: vendorId || undefined, status: status || undefined, payment: payment || undefined }), { vendorId, status, payment });
  const vendor = useQuery(() => (vendorId && canSeeVendors ? api.get(`/platform/vendors/${vendorId}`) : Promise.resolve(null)), [vendorId, canSeeVendors]);
  const vendorName = vendor.data ? vendor.data.profile?.businessName || vendor.data.user?.name || 'Vendor' : list.data?.items?.[0]?.vendor?.name || 'Selected vendor';
  const [openId, setOpenId] = useState(null);
  const open = list.data?.items?.find((o) => o._id === openId) || null;
  const [confirm, setConfirm] = useState(null);
  const [retry, retrying] = useAction((o) => api.post(`/platform/product-orders/${o._id}/refund-retry`), {
    toast,
    success: (r) => (r?.payment?.status === 'refunded' ? 'Refund confirmed' : 'Refund requested again — Cashfree will confirm it shortly'),
    onDone: (r) => (list.setData((d) => (d ? { ...d, items: d.items.map((x) => (x._id === r?._id ? { ...x, ...r } : x)) } : d)), setConfirm(null), list.reload()),
  });

  const columns = [
    {
      key: 'order',
      header: 'Order',
      render: (o) => (
        <div className="whitespace-nowrap">
          <p className="font-mono text-[11px] font-semibold text-brand">{o.orderNumber}</p>
          <p className="text-[11px] text-gray-400">{formatDateTime(o.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      render: (o) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-gray-400">{o.product?.photoUrl ? <img src={mediaHref(o.product.photoUrl)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Icon name="fa-solid fa-box" className="text-xs" />}</span>
          <div className="min-w-0 max-w-[180px]">
            <p className="truncate font-semibold text-gray-700">{o.product?.title || '—'}</p>
            <p className="truncate text-[11px] text-gray-400">
              Qty {o.quantity}
              {o.product?.unit ? ` × ${o.product.unit}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    ...(vendorId
      ? []
      : [
          {
            key: 'vendor',
            header: 'Vendor',
            render: (o) =>
              o.vendor?._id && canSeeVendors ? (
                <Link to={`/admin/vendors/${o.vendor._id}`} onClick={(e) => e.stopPropagation()} className="link block max-w-[130px] truncate">
                  {o.vendor.name || 'Unnamed'}
                </Link>
              ) : (
                <span className="block max-w-[130px] truncate">{o.vendor?.name || '—'}</span>
              ),
          },
        ]),
    {
      key: 'customer',
      header: 'Customer',
      render: (o) => (
        <div className="min-w-0 max-w-[140px]">
          <p className="truncate text-gray-700">{o.customer?.name || 'Member'}</p>
          {o.customer?.phone && <p className="truncate font-mono text-[11px] text-gray-400">{o.customer.phone}</p>}
        </div>
      ),
    },
    { key: 'fulfilment', header: 'Fulfilment', render: (o) => (o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery') },
    {
      key: 'payment',
      header: 'Payment',
      render: (o) => (
        <div className="whitespace-nowrap">
          <p className="text-[11px] text-gray-500">{o.paymentMethod === 'cod' ? 'COD' : 'Online'}</p>
          {statusBadge(o.payment?.status, PAYMENT_STATUS)}
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (o) => statusBadge(o.status, ORDER_STATUS) },
    { key: 'payable', header: 'Payable', align: 'right', render: (o) => <span className="font-semibold text-gray-700">{money(o.payablePaise)}</span> },
    {
      key: 'commission',
      header: 'Commission',
      align: 'right',
      render: (o) => (
        <div className="whitespace-nowrap">
          <p className="text-gray-700">{money(o.settlement?.commissionPaise ?? o.commissionPaise)}</p>
          <p className="text-[11px] text-gray-400">{formatPercent(o.commissionPercent)}</p>
        </div>
      ),
    },
    { key: 'net', header: 'NIVASA net', align: 'right', render: (o) => (o.settlement ? <NetAmount paise={o.settlement.netToPlatformPaise} /> : <span className="text-gray-300">—</span>) },
    { key: 'vendorEarned', header: 'Vendor earnings', align: 'right', render: (o) => (o.settlement ? money(o.settlement.vendorEarningsPaise) : <span className="text-gray-300">—</span>) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (o) =>
        canRefund && canRetryRefund(o) ? (
          <Button size="xs" variant="outline" icon="fa-solid fa-rotate-left" onClick={(e) => (e.stopPropagation(), setConfirm(o))} data-testid="row-refund-retry">
            Retry refund
          </Button>
        ) : null,
    },
  ];

  const t = list.data?.totals || {};
  const filtered = Boolean(status || payment);
  return (
    <div data-testid="product-orders">
      <PageHeader
        back={
          vendorId &&
          canSeeVendors && (
            <Link to={`/admin/vendors/${vendorId}`} className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-brand">
              <Icon name="fa-solid fa-arrow-left" /> {vendorName}
            </Link>
          )
        }
        title="Product orders"
        subtitle="Members’ orders of vendor products: delivery status, payment (cash on delivery or online through Cashfree) and what each paid order settles to."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 2xl:grid-cols-5" data-testid="order-totals">
        <MetricCard tone="green" label="Collected" value={formatINR(t.cashCollectedPaise || 0)} icon="fa-solid fa-money-bill-wave" footer={`${plural(t.paidBookings || 0, 'paid order')} · cash or online`} testId="orders-collected" />
        <MetricCard tone="purple" label="Commission" value={formatINR(t.commissionPaise || 0)} icon="fa-solid fa-percent" footer="Taken out of the vendor’s price" testId="orders-commission" />
        <MetricCard tone="orange" label="Member discounts" value={formatINR(t.memberDiscountsPaise || 0)} icon="fa-solid fa-tag" footer="Given back out of the commission" testId="orders-discounts" />
        <MetricCard tone="cyan" label="NIVASA net" value={<NetAmount paise={t.netToPlatformPaise ?? 0} className="!text-2xl !font-bold" />} icon="fa-solid fa-scale-balanced" footer={netCaption(t.netToPlatformPaise || 0, Boolean(vendorId))} testId="orders-net" />
        <MetricCard tone="green" label="Vendor earnings" value={formatINR(t.vendorEarningsPaise || 0)} icon="fa-solid fa-wallet" footer="Collected − NIVASA net (incl. delivery)" testId="orders-vendor" />
      </div>

      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'order')}</span>}>
          {vendorId ? (
            <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-brand-light py-1 pl-3 pr-1 text-[11px] font-semibold text-brand sm:self-auto" data-testid="orders-vendor-filter">
              <Icon name="fa-solid fa-id-card" className="text-[10px]" />
              <span className="truncate">{vendorName}</span>
              <button type="button" onClick={() => setFilter('vendorId', '')} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-brand/10" aria-label="Show all vendors">
                <Icon name="fa-solid fa-xmark" className="text-[9px]" />
              </button>
            </span>
          ) : (
            canSeeVendors && <VendorPicker onPick={(id) => setFilter('vendorId', id)} testId="orders-vendor-picker" className="w-full sm:w-64" />
          )}
          <Select value={status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Order status" className="sm:w-48">
            <option value="">All statuses</option>
            {Object.entries(ORDER_STATUS).map(([v, [l]]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select value={payment} onChange={(e) => setFilter('payment', e.target.value)} aria-label="Payment status" className="sm:w-44">
            <option value="">Any payment</option>
            {Object.entries(PAYMENT_STATUS).map(([v, [l]]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          {filtered && (
            <Button variant="ghost" size="xs" icon="fa-solid fa-xmark" onClick={() => setParams(vendorId ? { vendorId } : {}, { replace: true })}>
              Clear filters
            </Button>
          )}
        </Toolbar>
        <DataTable
          testId="product-orders-table"
          columns={columns}
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          dim={list.reloading}
          onRowClick={(o) => setOpenId(o._id)}
          empty={<EmptyState compact icon="fa-solid fa-bag-shopping" title={filtered || vendorId ? 'No orders match' : 'No product orders yet'} message={filtered ? 'Try other filters.' : 'Orders appear here when members buy a vendor’s product in the app.'} />}
        />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
      {list.data && (
        <p className="mt-3 text-[11px] text-brand-muted">
          <Icon name="fa-solid fa-circle-info" className="mr-1" />
          Totals cover paid orders{filtered || vendorId ? ' matching the filters' : ''} ({formatNumber(t.paidBookings || 0)}). Cash-on-delivery orders are settled when delivered; online orders when Cashfree confirms the payment, with the vendor’s share split to their Cashfree account. Prices and rates are the ones in force when the member ordered.
        </p>
      )}

      <OrderDrawer order={open} onClose={() => setOpenId(null)} canSeeVendors={canSeeVendors} canRefund={canRefund} onRetry={() => setConfirm(open)} retrying={retrying} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => retry(confirm)}
        busy={retrying}
        tone="primary"
        title={`Retry refund for ${confirm?.orderNumber || 'this order'}?`}
        message={`Asks Cashfree to refund ${confirm ? formatINR(confirm.payment?.amountPaise ?? confirm.payablePaise) : ''} to the member (or checks the refund already started). A refund is never applied twice.`}
        confirmLabel="Retry refund"
        icon="fa-solid fa-rotate-left"
      />
    </div>
  );
}
