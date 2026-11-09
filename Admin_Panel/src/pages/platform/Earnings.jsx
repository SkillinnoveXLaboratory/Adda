import { useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useDebounced, usePaged, useQuery } from '../../lib/hooks.js';
import { formatDate, formatDateTime, formatINR, formatINRShort, formatNumber, plural, todayIST } from '../../lib/format.js';
import { monthLabel, PERIODS, periodRange, rangeError } from '../../lib/period.js';
import { Alert, Button, Card, cx, EmptyState, ErrorState, Icon, PageHeader, Skeleton, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination } from '../../components/DataTable.jsx';
import { Field, Input } from '../../components/Form.jsx';
import { BarChart, Legend, MetricCard, SERIES } from '../../components/Charts.jsx';
import { NetAmount } from '../../components/Settlement.jsx';

const pct = (n) => `${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
const vendorLabel = (v) => v?.businessName || v?.name || 'Unnamed vendor';

/**
 * NIVASA's earnings from vendor services (GET /platform/earnings, view-only area `earnings`): the commission taken
 * from each paid job, the coupons NIVASA funds, and what vendors earned. Figures are fixed when a vendor records
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
        subtitle="NIVASA’s commission from vendor services and what vendors earned. Members pay the full service price; the commission is taken from each payment when the vendor records it."
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
            canSeeVendors && <VendorPicker onPick={setVendor} />
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
            <MetricCard tone="purple" label="NIVASA commission earned" value={formatINR(t.commissionPaise)} icon="fa-solid fa-percent" footer="Taken from each paid job" testId="earn-commission" />
            <MetricCard tone="orange" label="Coupon cost" value={formatINR(t.couponCostPaise)} icon="fa-solid fa-ticket" footer="Discounts NIVASA funds" testId="earn-coupons" />
            <MetricCard tone="green" label="Net platform earnings" value={<NetAmount paise={t.platformNetPaise} className="!text-2xl !font-bold" />} icon="fa-solid fa-sack-dollar" footer="Commission − coupon cost" testId="earn-net" />
            <MetricCard tone="cyan" label="Vendors earned" value={formatINR(t.vendorEarningsPaise)} icon="fa-solid fa-wallet" footer="Service value − commission" testId="earn-vendors" />
            <MetricCard tone="purple" label="Service value" value={formatINR(t.grossPaise)} icon="fa-solid fa-indian-rupee-sign" footer={`${formatINR(t.cashCollectedPaise)} cash + ${formatINR(t.couponCostPaise)} coupons`} testId="earn-gross" />
            <MetricCard tone="green" label="Paid jobs" value={formatNumber(t.paidJobs)} icon="fa-solid fa-circle-check" footer="Jobs vendors marked as paid" testId="earn-jobs" />
          </div>

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
            For each paid job: <b>service value</b> = cash + coupon; <b>commission</b> = the job’s commission % × service value; <b>vendor earned</b> = service value − commission; <b>net platform</b> = commission − coupon cost. Vendors collect the cash, so commission is settled with them separately (see Service bookings).
          </Alert>
        </div>
      )}
    </div>
  );
}

function VendorPicker({ onPick }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const q = useDebounced(text.trim());
  const listId = useId();
  const res = useQuery(() => (q.length >= 2 ? api.get('/platform/vendors', { q, limit: 8, sort: 'businessName' }) : Promise.resolve(null)), [q]);
  const items = res.data?.items || [];
  return (
    <div className="relative w-full lg:w-72" data-testid="earnings-vendor-picker">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
        <Icon name="fa-solid fa-magnifying-glass" className="text-xs" />
      </span>
      <input
        type="search"
        value={text}
        onChange={(e) => (setText(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Filter by vendor (name, business)…"
        aria-label="Filter by vendor"
        role="combobox"
        aria-expanded={open && q.length >= 2}
        aria-controls={listId}
        className="form-input pl-8"
      />
      {open && q.length >= 2 && (
        <ul id={listId} role="listbox" className="absolute right-0 z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
          {res.loading && !res.data ? (
            <li className="px-3 py-2 text-xs text-gray-400">Searching…</li>
          ) : res.error ? (
            <li className="px-3 py-2 text-xs text-rose-500">{res.error.message}</li>
          ) : !items.length ? (
            <li className="px-3 py-2 text-xs text-gray-400">No vendors match</li>
          ) : (
            items.map((v) => (
              <li key={v._id} role="option" aria-selected="false">
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick(v._id), setText(''), setOpen(false))} className="flex min-h-[40px] w-full flex-col items-start px-3 py-1.5 text-left hover:bg-gray-50">
                  <span className="max-w-full truncate text-xs font-semibold text-gray-700">{vendorLabel(v)}</span>
                  {v.businessName && v.name && <span className="max-w-full truncate text-[11px] text-gray-400">{v.name}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
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
          { label: 'Net platform', color: SERIES.cyan },
        ]}
      />
      <BarChart
        height="h-56"
        labels={rows.map((m) => monthLabel(m.month))}
        datasets={[
          { label: 'Commission', data: rows.map((m) => m.commissionPaise), color: SERIES.purple },
          { label: 'Net platform', data: rows.map((m) => m.platformNetPaise), color: SERIES.cyan },
        ]}
        formatValue={(v, full) => (full ? formatINR(v) : formatINRShort(v))}
        ariaLabel="NIVASA commission and net platform earnings by month"
      />
    </div>
  );
}

function MonthTable({ months }) {
  const columns = [
    { key: 'month', header: 'Month', render: (m) => <span className="whitespace-nowrap font-semibold text-gray-700">{monthLabel(m.month)}</span> },
    { key: 'jobs', header: 'Paid jobs', align: 'right', render: (m) => formatNumber(m.paidJobs) },
    { key: 'gross', header: 'Service value', align: 'right', render: (m) => <span className="whitespace-nowrap">{formatINR(m.grossPaise)}</span> },
    { key: 'commission', header: 'Commission', align: 'right', render: (m) => <span className="whitespace-nowrap font-semibold text-gray-700">{formatINR(m.commissionPaise)}</span> },
    { key: 'coupons', header: 'Coupon cost', align: 'right', render: (m) => <span className="whitespace-nowrap text-rose-500">{m.couponCostPaise ? `−${formatINR(m.couponCostPaise)}` : formatINR(0)}</span> },
    { key: 'net', header: 'Net platform', align: 'right', render: (m) => <NetAmount paise={m.platformNetPaise} /> },
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
    { key: 'gross', header: 'Service value', align: 'right', render: (r) => <span className="whitespace-nowrap">{formatINR(r.grossPaise)}</span> },
    { key: 'commission', header: 'Commission', align: 'right', render: (r) => <span className="whitespace-nowrap font-semibold text-gray-700">{formatINR(r.commissionPaise)}</span> },
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
    { key: 'gross', header: 'Service value', align: 'right', render: (b) => <span className="whitespace-nowrap">{formatINR(b.grossPaise)}</span> },
    {
      key: 'coupon',
      header: 'Coupon',
      render: (b) =>
        b.couponCode ? (
          <div className="whitespace-nowrap">
            <p className="font-mono text-[11px] font-bold text-gray-700">{b.couponCode}</p>
            <p className="text-[11px] text-rose-500">−{formatINR(b.discountPaise)}</p>
          </div>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      key: 'commission',
      header: 'Commission',
      align: 'right',
      render: (b) => (
        <div className="whitespace-nowrap">
          <p className="font-semibold text-gray-700">{formatINR(b.commissionPaise)}</p>
          <p className="text-[11px] text-gray-400">{pct(b.commissionPercent)}</p>
        </div>
      ),
    },
    { key: 'net', header: 'Net platform', align: 'right', render: (b) => <NetAmount paise={b.netToPlatformPaise} /> },
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
