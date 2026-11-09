import { useId, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api.js';
import { useQuery, useTitle } from '../lib/hooks.js';
import { formatDate, formatDateTime, formatNumber, money, todayIST } from '../lib/format.js';
import { monthLabel, PERIODS, periodRange, rangeError } from '../lib/period.js';
import { Alert, Button, Card, cx, EmptyState, ErrorState, Icon, PageHeader, Skeleton, Tabs } from '../components/ui.jsx';
import { DataTable, Pagination } from '../components/DataTable.jsx';
import { Field, Input } from '../components/Form.jsx';

const LIMIT = 20;
const pct = (n) => `${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;

/**
 * What the vendor earned from PAID jobs (GET /vendor/earnings). Members see and pay the full price; NIVASA's
 * commission is worked out on each payment when it is recorded. The vendor collects the cash, so the commission
 * is settled with NIVASA afterwards.
 */
export default function Earnings() {
  useTitle('Earnings');
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ from: '', to: '' }); // applied custom range
  const [page, setPage] = useState(1);
  const range = periodRange(period, custom);
  const key = `${range.from || ''}|${range.to || ''}`;
  const q = useQuery(() => api.get('/vendor/earnings', { from: range.from, to: range.to, page, limit: LIMIT }), [key, page]);
  const d = q.data;
  const t = d?.totals;

  const choose = (v) => {
    setPeriod(v);
    setPage(1);
  };

  return (
    <div className="space-y-6" data-testid="earnings-page">
      <PageHeader title="Earnings" subtitle="What you earned from jobs marked as paid. Members pay the full service price; NIVASA’s commission is taken from each payment." />

      <div className="space-y-3">
        <Tabs tabs={PERIODS} value={period} onChange={choose} label="Period" />
        {period === 'custom' && (
          <CustomRange
            value={custom}
            onApply={(r) => {
              setCustom(r);
              setPage(1);
            }}
          />
        )}
      </div>

      {q.loading && !d ? (
        <SummarySkeleton />
      ) : q.error && !d ? (
        <div className="card">
          <ErrorState error={q.error} onRetry={q.reload} />
        </div>
      ) : (
        <div className={cx('space-y-6 transition-opacity', q.reloading && 'opacity-60')}>
          <p className="text-[11px] text-azea-muted" data-testid="earnings-range">
            <Icon name="fa-regular fa-calendar" className="mr-1" />
            {d.range?.from || d.range?.to ? `${d.range.from ? formatDate(d.range.from) : 'Start'} – ${d.range.to ? formatDate(d.range.to) : 'today'}` : 'All time'} · India time
          </p>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <SummaryCard highlight icon="fa-solid fa-wallet" label="You earned" value={money(t.vendorEarningsPaise)} note="Service value − commission" testId="earn-you" />
            <SummaryCard icon="fa-solid fa-indian-rupee-sign" label="Service value" value={money(t.grossPaise)} note={t.couponCostPaise ? `incl. ${money(t.couponCostPaise)} coupons` : 'What members paid'} testId="earn-gross" />
            <SummaryCard icon="fa-solid fa-percent" label="NIVASA commission" value={money(t.commissionPaise)} note="Taken from each payment" testId="earn-commission" />
            <SummaryCard icon="fa-solid fa-circle-check" label="Paid jobs" value={formatNumber(t.paidJobs)} note={`${money(t.cashCollectedPaise)} cash received`} testId="earn-jobs" />
          </div>
          <SettlementLine net={t.platformNetPaise} />

          <Card title="By month" padded={false}>
            <MonthTable months={d.months || []} />
          </Card>

          <Card title="Paid jobs" padded={false}>
            <JobsTable items={d.items} />
            <Pagination page={d.page || page} pages={d.pages || 1} total={d.total || 0} limit={d.limit || LIMIT} onPage={setPage} />
          </Card>
        </div>
      )}
    </div>
  );
}

function CustomRange({ value, onApply }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(null);
  const ids = { from: useId(), to: useId() };
  const today = todayIST();
  const apply = (e) => {
    e.preventDefault();
    const err = rangeError(draft.from, draft.to);
    setError(err);
    if (!err) onApply(draft);
  };
  const set = (k) => (e) => (setDraft((x) => ({ ...x, [k]: e.target.value })), setError(null));
  return (
    <form onSubmit={apply} noValidate className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-start" data-testid="earnings-custom">
      <Field label="From" htmlFor={ids.from} className="sm:w-48">
        <Input id={ids.from} name="from" type="date" max={today} value={draft.from} onChange={set('from')} invalid={Boolean(error)} />
      </Field>
      <Field label="To" htmlFor={ids.to} className="sm:w-48">
        <Input id={ids.to} name="to" type="date" max={today} value={draft.to} onChange={set('to')} invalid={Boolean(error)} />
      </Field>
      <div className="flex flex-col gap-1 sm:pt-[22px]">
        <Button type="submit" icon="fa-solid fa-filter" data-testid="earnings-apply">
          Apply
        </Button>
      </div>
      {error && (
        <p className="flex items-start gap-1 text-[11px] font-medium text-rose-600 sm:self-center sm:pt-[22px]" role="alert" data-testid="earnings-range-error">
          <Icon name="fa-solid fa-circle-exclamation" className="mt-0.5 text-[10px]" />
          {error}
        </p>
      )}
    </form>
  );
}

function SummaryCard({ icon, label, value, note, highlight, testId }) {
  return (
    <div className={cx('card flex min-w-0 flex-col gap-1 p-4', highlight && '!border-azea-purple bg-azea-purple text-white')} data-testid={testId}>
      <span className={cx('flex h-9 w-9 items-center justify-center rounded-lg', highlight ? 'bg-white/15 text-white' : 'bg-azea-purpleLight text-azea-purple')}>
        <Icon name={icon} className="text-sm" />
      </span>
      <span className={cx('mt-1 truncate text-lg font-bold sm:text-xl', highlight ? 'text-white' : 'text-gray-800')} data-testid={testId && `${testId}-value`}>
        {value}
      </span>
      <span className={cx('truncate text-xs font-semibold', highlight ? 'text-violet-100' : 'text-gray-600')}>{label}</span>
      <span className={cx('text-[11px] leading-snug', highlight ? 'text-violet-200' : 'text-azea-muted')}>{note}</span>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[124px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-14 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

/** Commission minus coupon credits: the vendor holds the cash, so a positive net is owed to NIVASA. */
function SettlementLine({ net = 0 }) {
  const tone = net > 0 ? 'warning' : net < 0 ? 'success' : 'info';
  return (
    <Alert tone={tone} icon="fa-solid fa-scale-balanced" title={net > 0 ? `Settlement: you owe NIVASA ${money(net)}` : net < 0 ? `Settlement: NIVASA owes you ${money(-net)}` : 'Settlement: nothing to settle'} testId="earnings-settlement">
      You collect the cash from customers, so NIVASA’s commission for this period is settled with NIVASA{net < 0 ? ' — coupons members used are more than the commission, so NIVASA pays you the difference' : ''}.
    </Alert>
  );
}

function MonthTable({ months }) {
  if (!months.length) return <EmptyState compact icon="fa-solid fa-chart-column" title="No paid jobs in this period" message="Earnings appear when you mark a job as paid." />;
  const max = Math.max(...months.map((m) => m.vendorEarningsPaise), 1);
  const columns = [
    { key: 'month', header: 'Month', render: (m) => <span className="whitespace-nowrap font-semibold text-gray-700">{monthLabel(m.month)}</span> },
    {
      key: 'earned',
      header: 'You earned',
      render: (m) => (
        <div className="flex min-w-[160px] items-center gap-2">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-azea-purpleLight" aria-hidden="true">
            <span className="block h-full rounded-full bg-azea-purple" style={{ width: `${Math.max(2, Math.round((Math.max(0, m.vendorEarningsPaise) / max) * 100))}%` }} />
          </span>
          <span className="w-24 whitespace-nowrap text-right font-bold text-gray-800">{money(m.vendorEarningsPaise)}</span>
        </div>
      ),
    },
    { key: 'jobs', header: 'Jobs', align: 'right', render: (m) => formatNumber(m.paidJobs) },
    { key: 'gross', header: 'Service value', align: 'right', render: (m) => <span className="whitespace-nowrap">{money(m.grossPaise)}</span> },
    { key: 'commission', header: 'Commission', align: 'right', render: (m) => <span className="whitespace-nowrap text-gray-500">{money(m.commissionPaise)}</span> },
  ];
  return <DataTable testId="earnings-months" columns={columns} rows={months} rowKey="month" maxHeight="max-h-none" />;
}

function JobsTable({ items }) {
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
    { key: 'service', header: 'Service', render: (b) => <span className="block max-w-[220px] truncate font-semibold text-gray-700">{b.offerTitle}</span> },
    { key: 'customer', header: 'Customer', render: (b) => <span className="block max-w-[140px] truncate">{b.customer?.name || 'Member'}</span> },
    { key: 'price', header: 'Price', align: 'right', render: (b) => <span className="whitespace-nowrap">{money(b.grossPaise)}</span> },
    {
      key: 'coupon',
      header: 'Coupon',
      render: (b) =>
        b.couponCode ? (
          <span className="whitespace-nowrap">
            <span className="font-mono text-[11px] font-bold text-gray-700">{b.couponCode}</span> <span className="text-[11px] text-emerald-700">{money(b.discountPaise)} by NIVASA</span>
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    { key: 'rate', header: 'Commission %', align: 'right', render: (b) => pct(b.commissionPercent) },
    { key: 'commission', header: 'Commission', align: 'right', render: (b) => <span className="whitespace-nowrap text-gray-500">{money(b.commissionPaise)}</span> },
    { key: 'earned', header: 'You earned', align: 'right', render: (b) => <span className="whitespace-nowrap font-bold text-gray-800">{money(b.vendorEarningsPaise)}</span> },
  ];
  return (
    <DataTable
      testId="earnings-jobs"
      columns={columns}
      rows={items}
      maxHeight="max-h-none"
      empty={
        <EmptyState
          compact
          icon="fa-solid fa-wallet"
          title="No paid jobs yet — earnings appear when you mark a job as paid"
          message="Finish a job, then use “Mark cash paid” on it in Bookings."
          action={
            <Link to="/bookings?tab=completed" className="inline-flex min-h-[40px] items-center gap-1.5 text-xs font-semibold text-azea-purple hover:underline">
              Go to bookings <Icon name="fa-solid fa-arrow-right" className="text-[10px]" />
            </Link>
          }
        />
      }
    />
  );
}
