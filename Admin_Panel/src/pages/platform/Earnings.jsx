import { useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { usePaged, useQuery } from '../../lib/hooks.js';
import { formatDate, formatDateTime, formatINR, formatINRShort, formatNumber, plural, todayIST } from '../../lib/format.js';
import { monthLabel, PERIODS, periodRange, rangeError } from '../../lib/period.js';
import { Alert, Button, Card, cx, EmptyState, ErrorState, Icon, PageHeader, Skeleton, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination } from '../../components/DataTable.jsx';
import { Field, Input } from '../../components/Form.jsx';
import { BarChart, Legend, MetricCard, SERIES } from '../../components/Charts.jsx';
import { NetAmount } from '../../components/Settlement.jsx';
import { VendorPicker } from '../../components/VendorPicker.jsx';
import { formatPercent } from '../../lib/pricing.js';

const money = (paise, none = '—') => (paise === null || paise === undefined ? <span className="whitespace-nowrap text-gray-300">{none}</span> : <span className="whitespace-nowrap">{formatINR(paise)}</span>);
const vendorLabel = (v) => v?.businessName || v?.name || 'Unnamed vendor';

/**
 * NIVASA's earnings from vendor services (GET /platform/earnings, view-only area `earnings`): the commission added on
 * top of each vendor's price, the member discounts given back out of it, NIVASA's net and what vendors earned. Figures are fixed when a vendor records
 * the payment. `?vendorId=` narrows everything to one vendor (linked from the vendor's page).
 */
export default function Earnings() {
  const { canView } = useAuth();
  const [params, setParams] = useSearchParams();
  const vendorId = params.get('vendorId') || '';
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const range = periodRange(period, custom);
  const list = usePaged((p) => api.get('/platform/earnings', { ...p, from: range.from, to: range.to, vendorId: vendorId || undefined }), { from: range.from || '', to: range.to || '', vendorId });
  const canSeeVendors = canView('vendors');
  const vendor = useQuery(() => (vendorId && canSeeVendors ? api.get(`/platform/vendors/${vendorId}`) : Promise.resolve(null)), [vendorId, canSeeVendors]);
  const d = list.data;
  const t = d?.totals;
  const vendorName = vendor.data ? vendor.data.profile?.businessName || vendor.data.user?.name || 'Vendor' : d?.topVendors?.[0] ? vendorLabel(d.topVendors[0].vendor) : 'Selected vendor';
  const setVendor = (id) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (id) n.set('vendorId', id);
        else n.delete('vendorId');
        return n;
      },
      { replace: true },
    );

  return (
    <div data-testid="platform-earnings">
      <PageHeader
        back={
          vendorId &&
          canSeeVendors && (
            <Link to={`/admin/vendors/${vendorId}`} className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-brand">
              <Icon name="fa-solid fa-arrow-left" /> {vendorName}
            </Link>
          )
        }
        title="Earnings"
        subtitle="NIVASA’s commission on vendor services and products, the member discounts given back, NIVASA’s net earnings and what vendors earned. Figures are fixed when the payment is recorded (cash or online)."
      />

      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs tabs={PERIODS} value={period} onChange={setPeriod} className="flex-wrap self-start" />
          {vendorId ? (
            <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-brand-light py-1 pl-3 pr-1 text-[11px] font-semibold text-brand lg:self-auto" data-testid="earnings-vendor-filter">
              <Icon name="fa-solid fa-id-card" className="text-[10px]" />
              <span className="truncate">{vendorName}</span>
              <button type="button" onClick={() => setVendor('')} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-brand/10" aria-label="Show all vendors">
                <Icon name="fa-solid fa-xmark" className="text-[9px]" />
              </button>
            </span>
          ) : (
            canSeeVendors && <VendorPicker onPick={setVendor} testId="earnings-vendor-picker" />
          )}
        </div>
        {period === 'custom' && <CustomRange value={custom} onApply={setCustom} />}
      </div>

      {list.loading && !d ? (
        <SummarySkeleton />
      ) : list.error && !d ? (
        <div className="card">
          <ErrorState error={list.error} onRetry={list.reload} />
        </div>
      ) : (
        <div className={cx('space-y-6 transition-opacity', list.reloading && 'opacity-60')}>
          <p className="-mt-2 text-[11px] text-brand-muted" data-testid="earnings-range">
            <Icon name="fa-regular fa-calendar" className="mr-1" />
            {d.range?.from || d.range?.to ? `${d.range.from ? formatDate(d.range.from) : 'Start'} – ${d.range.to ? formatDate(d.range.to) : 'today'}` : 'All time'} · India time{vendorId ? ` · ${vendorName}` : ' · all vendors'}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
            <MetricCard tone="green" label="NIVASA net earnings" value={<NetAmount paise={t.platformNetPaise} className="!text-2xl !font-bold" />} icon="fa-solid fa-sack-dollar" footer="Commission − member discounts" testId="earn-net" />
            <MetricCard tone="purple" label="NIVASA commission" value={formatINR(t.commissionPaise)} icon="fa-solid fa-percent" footer="Added on top of vendors’ prices" testId="earn-commission" />
            <MetricCard tone="orange" label="Member discounts" value={formatINR(t.memberDiscountsPaise)} icon="fa-solid fa-tag" footer="Given back to members out of the commission" testId="earn-discounts" />
            <MetricCard tone="cyan" label="Vendor earnings" value={formatINR(t.vendorEarningsPaise)} icon="fa-solid fa-wallet" footer="Cash − NIVASA net" testId="earn-vendors" />
            <MetricCard tone="purple" label="Member prices" value={formatINR(t.grossPaise)} icon="fa-solid fa-indian-rupee-sign" footer={`${formatINR(t.cashCollectedPaise)} cash + ${formatINR(t.memberDiscountsPaise)} member discounts`} testId="earn-gross" />
            <MetricCard tone="green" label="Paid jobs & orders" value={formatNumber(t.paidJobs)} icon="fa-solid fa-circle-check" footer={d.breakdown ? `${formatNumber(d.breakdown.services?.paidJobs || 0)} service jobs · ${formatNumber(d.breakdown.products?.paidJobs || 0)} product orders` : 'Jobs vendors marked as paid'} testId="earn-jobs" />
          </div>

          {d.breakdown && (
            <Card title="Services vs products" padded={false}>
              <Breakdown breakdown={d.breakdown} totals={t} />
            </Card>
          )}

          <Card title="By month">
            <MonthChart months={d.months || []} />
            <MonthTable months={d.months || []} />
          </Card>

          {!vendorId && (
            <Card title="Top vendors" padded={false}>
              <TopVendors rows={d.topVendors || []} canSeeVendors={canSeeVendors} onFilter={setVendor} />
            </Card>
          )}

          <Card title="Paid jobs" padded={false} actions={<span className="text-[11px] text-brand-muted">{plural(d.total, 'paid job')}</span>}>
            <JobsTable items={d.items} showVendor={!vendorId} canSeeVendors={canSeeVendors} />
            <Pagination page={list.page} pages={d.pages || 1} total={d.total || 0} limit={list.limit} onPage={list.setPage} />
          </Card>
          <Alert tone="info" title="How it is worked out">
            Each vendor has their own rates (set on the vendor’s page). <b>Member price</b> = vendor price + <b>commission</b> (commission % of the vendor price). A member who applies the discount pays member price − <b>member discount</b> (discount % of the commission). For each paid job: <b>NIVASA net</b> = commission − member discount; <b>vendor earned</b> = cash − NIVASA net. For “price on request” jobs the commission is taken out of the cash recorded. Vendors collect the cash, so NIVASA’s net is settled with them separately (see Service bookings). Product orders use the same rates per unit (the delivery charge goes to the vendor, without commission); cash-on-delivery orders count when delivered, online orders when paid — Cashfree splits the vendor’s share at payment. The “Paid jobs” list below shows service bookings only (see Product orders).
          </Alert>
        </div>
      )}
    </div>
  );
}

/** Totals split into service bookings and product orders (GET /platform/earnings → breakdown). */
function Breakdown({ breakdown, totals }) {
  const rows = [
    { _id: 'services', label: 'Services', icon: 'fa-solid fa-screwdriver-wrench', ...breakdown.services },
    { _id: 'products', label: 'Products', icon: 'fa-solid fa-box', ...breakdown.products },
    { _id: 'total', label: 'Total', total: true, ...totals },
  ];
  const cell = (paise, r) => <span className={cx('whitespace-nowrap', r.total && 'font-bold text-gray-800')}>{formatINR(paise || 0)}</span>;
  const columns = [
    {
      key: 'label',
      header: 'Source',
      render: (r) => (
        <span className={cx('inline-flex items-center gap-2 whitespace-nowrap', r.total ? 'font-bold text-gray-800' : 'font-semibold text-gray-700')}>
          {r.icon && <Icon name={r.icon} className="text-[11px] text-gray-400" />}
          {r.label}
        </span>
      ),
    },
    { key: 'paid', header: 'Paid', align: 'right', render: (r) => <span className={cx(r.total && 'font-bold text-gray-800')}>{formatNumber(r.paidJobs || 0)}</span> },
    { key: 'gross', header: 'Member prices', align: 'right', render: (r) => cell(r.grossPaise, r) },
    { key: 'commission', header: 'Commission', align: 'right', render: (r) => cell(r.commissionPaise, r) },
    { key: 'discounts', header: 'Member discounts', align: 'right', render: (r) => cell(r.memberDiscountsPaise, r) },
    { key: 'net', header: 'NIVASA net', align: 'right', render: (r) => <NetAmount paise={r.platformNetPaise || 0} /> },
    { key: 'vendor', header: 'Vendor earnings', align: 'right', render: (r) => cell(r.vendorEarningsPaise, r) },
  ];
  return <DataTable testId="earnings-breakdown" columns={columns} rows={rows} maxHeight="" />;
}

function CustomRange({ value, onApply }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(null);
  const ids = { from: useId(), to: useId() };
  const today = todayIST();
  const set = (k) => (e) => (setDraft((x) => ({ ...x, [k]: e.target.value })), setError(null));
  const apply = (e) => {
    e.preventDefault();
    const err = rangeError(draft.from, draft.to);
    setError(err);
    if (!err) onApply(draft);
  };
  return (
    <form onSubmit={apply} noValidate className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-start" data-testid="earnings-custom">
      <Field label="From" htmlFor={ids.from} className="sm:w-48">
        <Input id={ids.from} name="from" type="date" max={today} value={draft.from} onChange={set('from')} invalid={Boolean(error)} />
      </Field>
      <Field label="To" htmlFor={ids.to} className="sm:w-48">
        <Input id={ids.to} name="to" type="date" max={today} value={draft.to} onChange={set('to')} invalid={Boolean(error)} />
      </Field>
      <div className="sm:pt-[22px]">
        <Button type="submit" icon="fa-solid fa-filter" data-testid="earnings-apply" className="min-h-[38px]">
          Apply
        </Button>
      </div>
      {error && (
        <p className="flex items-start gap-1 text-[11px] font-medium text-rose-500 sm:self-center sm:pt-[22px]" role="alert" data-testid="earnings-range-error">
          <Icon name="fa-solid fa-circle-exclamation" className="mt-0.5 text-[10px]" />
          {error}
        </p>
      )}
    </form>
  );
}

function SummarySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function MonthChart({ months }) {
  if (months.length < 2) return null;
  const rows = [...months].reverse(); // oldest → newest, left to right
  return (
    <div className="mb-4">
      <Legend
        items={[
          { label: 'Commission', color: SERIES.purple },
          { label: 'NIVASA net', color: SERIES.cyan },
        ]}
      />
      <BarChart
        height="h-56"
        labels={rows.map((m) => monthLabel(m.month))}
        datasets={[
          { label: 'Commission', data: rows.map((m) => m.commissionPaise), color: SERIES.purple },
          { label: 'NIVASA net', data: rows.map((m) => m.platformNetPaise), color: SERIES.cyan },
        ]}
        formatValue={(v, full) => (full ? formatINR(v) : formatINRShort(v))}
        ariaLabel="NIVASA commission and net earnings by month"
      />
    </div>
  );
}

function MonthTable({ months }) {
  const columns = [
    { key: 'month', header: 'Month', render: (m) => <span className="whitespace-nowrap font-semibold text-gray-700">{monthLabel(m.month)}</span> },
    { key: 'jobs', header: 'Paid jobs', align: 'right', render: (m) => formatNumber(m.paidJobs) },
    { key: 'cash', header: 'Cash collected', align: 'right', render: (m) => <span className="whitespace-nowrap">{formatINR(m.cashCollectedPaise)}</span> },
    { key: 'commission', header: 'Commission', align: 'right', render: (m) => <span className="whitespace-nowrap font-semibold text-gray-700">{formatINR(m.commissionPaise)}</span> },
    { key: 'discounts', header: 'Member discounts', align: 'right', render: (m) => <span className="whitespace-nowrap text-rose-500">{m.memberDiscountsPaise ? `−${formatINR(m.memberDiscountsPaise)}` : formatINR(0)}</span> },
    { key: 'net', header: 'NIVASA net', align: 'right', render: (m) => <NetAmount paise={m.platformNetPaise} /> },
    { key: 'vendors', header: 'Vendors earned', align: 'right', render: (m) => <span className="whitespace-nowrap">{formatINR(m.vendorEarningsPaise)}</span> },
  ];
  return (
    <div className="-mx-5 -mb-5 border-t border-gray-100">
      <DataTable testId="earnings-months" columns={columns} rows={months} rowKey="month" maxHeight="max-h-none" empty={<EmptyState compact icon="fa-solid fa-chart-column" title="No paid jobs in this period" message="Earnings appear when vendors mark jobs as paid." />} />
    </div>
  );
}

function TopVendors({ rows, canSeeVendors, onFilter }) {
  const columns = [
    {
      key: 'vendor',
      header: 'Vendor',
      render: (r) => (
        <div className="min-w-0 max-w-[220px]">
          {canSeeVendors ? (
            <Link to={`/admin/vendors/${r.vendor._id}`} className="link block truncate">
              {vendorLabel(r.vendor)}
            </Link>
          ) : (
            <p className="truncate font-semibold text-gray-700">{vendorLabel(r.vendor)}</p>
          )}
          {r.vendor.businessName && r.vendor.name && <p className="truncate text-[11px] text-gray-400">{r.vendor.name}</p>}
        </div>
      ),
    },
    { key: 'jobs', header: 'Paid jobs', align: 'right', render: (r) => formatNumber(r.paidJobs) },
    { key: 'cash', header: 'Cash collected', align: 'right', render: (r) => <span className="whitespace-nowrap">{formatINR(r.cashCollectedPaise)}</span> },
    { key: 'commission', header: 'Commission', align: 'right', render: (r) => <span className="whitespace-nowrap font-semibold text-gray-700">{formatINR(r.commissionPaise)}</span> },
    { key: 'discounts', header: 'Member discounts', align: 'right', render: (r) => <span className="whitespace-nowrap text-rose-500">{r.memberDiscountsPaise ? `−${formatINR(r.memberDiscountsPaise)}` : formatINR(0)}</span> },
    { key: 'net', header: 'NIVASA net', align: 'right', render: (r) => <NetAmount paise={r.platformNetPaise} /> },
    { key: 'earned', header: 'Vendor earned', align: 'right', render: (r) => <span className="whitespace-nowrap">{formatINR(r.vendorEarningsPaise)}</span> },
    {
      key: 'filter',
      header: <span className="sr-only">Filter</span>,
      align: 'right',
      render: (r) => (
        <Button variant="ghost" size="xs" icon="fa-solid fa-filter" onClick={() => onFilter(r.vendor._id)} aria-label={`Show only ${vendorLabel(r.vendor)}`}>
          Only this
        </Button>
      ),
    },
  ];
  return <DataTable testId="earnings-top-vendors" columns={columns} rows={rows.map((r) => ({ ...r, _id: r.vendor._id }))} maxHeight="max-h-none" empty={<EmptyState compact icon="fa-solid fa-id-card" title="No vendor earnings in this period" />} />;
}

function JobsTable({ items, showVendor, canSeeVendors }) {
  const columns = [
    {
      key: 'date',
      header: 'Paid on',
      render: (b) => (
        <span className="whitespace-nowrap" title={formatDateTime(b.paidAt)}>
          {formatDate(b.paidAt)}
        </span>
      ),
    },
    {
      key: 'service',
      header: 'Service',
      render: (b) => (
        <div className="min-w-0 max-w-[200px]">
          <p className="truncate font-semibold text-gray-700">{b.offerTitle}</p>
          <p className="truncate text-[11px] text-gray-400">{b.customer?.name || 'Member'}</p>
        </div>
      ),
    },
    ...(showVendor
      ? [
          {
            key: 'vendor',
            header: 'Vendor',
            render: (b) =>
              b.vendor?._id && canSeeVendors ? (
                <Link to={`/admin/vendors/${b.vendor._id}`} className="link block max-w-[140px] truncate">
                  {b.vendor.name || 'Unnamed'}
                </Link>
              ) : (
                <span className="block max-w-[140px] truncate">{b.vendor?.name || '—'}</span>
              ),
          },
        ]
      : []),
    { key: 'vendorPrice', header: 'Vendor price', align: 'right', render: (b) => money(b.vendorPricePaise, 'On request') },
    { key: 'memberPrice', header: 'Member price', align: 'right', render: (b) => money(b.memberPricePaise, 'On request') },
    { key: 'cash', header: 'Cash', align: 'right', render: (b) => <span className="whitespace-nowrap font-semibold text-gray-700">{formatINR(b.cashPaise)}</span> },
    {
      key: 'commission',
      header: 'Commission',
      align: 'right',
      render: (b) => (
        <div className="whitespace-nowrap">
          <p className="font-semibold text-gray-700">{formatINR(b.commissionPaise)}</p>
          <p className="text-[11px] text-gray-400">{formatPercent(b.commissionPercent)}</p>
        </div>
      ),
    },
    { key: 'discount', header: 'Member discount', align: 'right', render: (b) => (b.discountPaise ? <span className="whitespace-nowrap text-rose-500">−{formatINR(b.discountPaise)}</span> : <span className="text-gray-300">—</span>) },
    { key: 'net', header: 'NIVASA net', align: 'right', render: (b) => <NetAmount paise={b.netToPlatformPaise} /> },
    { key: 'earned', header: 'Vendor earned', align: 'right', render: (b) => <span className="whitespace-nowrap">{formatINR(b.vendorEarningsPaise)}</span> },
  ];
  return (
    <DataTable
      testId="earnings-jobs"
      columns={columns}
      rows={items}
      maxHeight="max-h-none"
      empty={<EmptyState compact icon="fa-solid fa-wallet" title="No paid jobs in this period" message="Earnings appear when vendors mark a job as paid." />}
    />
  );
}
