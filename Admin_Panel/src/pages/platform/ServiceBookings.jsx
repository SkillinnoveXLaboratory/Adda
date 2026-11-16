import { Link, useSearchParams } from 'react-router';
import { api } from '../../lib/api.js';
import { usePaged, useQuery } from '../../lib/hooks.js';
import { formatDate, formatDateTime, formatINR, formatNumber, plural } from '../../lib/format.js';
import { Alert, Badge, Button, EmptyState, Icon, PageHeader } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Select } from '../../components/Form.jsx';
import { NetAmount, SettlementCards } from '../../components/Settlement.jsx';
import { formatPercent } from '../../lib/pricing.js';

const STATUSES = [
  ['', 'All statuses'],
  ['requested', 'Requested'],
  ['accepted', 'Accepted'],
  ['completed', 'Completed'],
  ['declined', 'Declined'],
  ['cancelled', 'Cancelled'],
];
// Unpaid-only view: no paid bookings match, so every settlement total is zero (the API's totals ignore paid=false).
const NO_TOTALS = { paidBookings: 0, cashCollectedPaise: 0, memberDiscountsPaise: 0, commissionPaise: 0, netToPlatformPaise: 0, vendorEarningsPaise: 0 };
const money = (paise, none = '—') => (paise === null || paise === undefined ? <span className="whitespace-nowrap text-gray-300">{none}</span> : <span className="whitespace-nowrap">{formatINR(paise)}</span>);
/** Commission on the booking: fixed when booked for a listed price; for "price on request" it is known only once paid. */
const commissionOf = (b) => b.commissionPaise ?? (b.payment?.status === 'paid' ? b.payment.commissionPaise : null);

/** Every vendor service booking with its price snapshot and settlement (cash, commission, member discount, net). GET /platform/service-bookings */
export default function ServiceBookings() {
  const [params, setParams] = useSearchParams();
  const vendorId = params.get('vendorId') || '';
  const status = params.get('status') || '';
  const paid = params.get('paid') || '';
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
  const list = usePaged((p) => api.get('/platform/service-bookings', { ...p, vendorId: vendorId || undefined, status: status || undefined, paid: paid || undefined }), { vendorId, status, paid });
  const vendor = useQuery(() => (vendorId ? api.get(`/platform/vendors/${vendorId}`) : Promise.resolve(null)), [vendorId]);
  const vendorName = vendor.data ? vendor.data.profile?.businessName || vendor.data.user?.name || 'Vendor' : list.data?.items?.[0]?.vendor?.name || 'Vendor';

  const columns = [
    {
      key: 'service',
      header: 'Service',
      render: (b) => (
        <div className="min-w-0 max-w-[200px]">
          <p className="truncate font-semibold text-gray-700">{b.offerTitle}</p>
          <p className="truncate text-[11px] text-gray-400">
            {b.customer?.name || 'Member'} · {formatDate(b.preferredDate)}
          </p>
        </div>
      ),
    },
    ...(vendorId
      ? []
      : [
          {
            key: 'vendor',
            header: 'Vendor',
            render: (b) =>
              b.vendor?._id ? (
                <Link to={`/admin/vendors/${b.vendor._id}`} className="link block max-w-[130px] truncate">
                  {b.vendor.name || 'Unnamed'}
                </Link>
              ) : (
                '—'
              ),
          },
        ]),
    { key: 'status', header: 'Status', render: (b) => <Badge status={b.status} /> },
    { key: 'vendorPrice', header: 'Vendor price', align: 'right', render: (b) => money(b.vendorPricePaise, 'On request') },
    {
      key: 'commission',
      header: 'Commission',
      align: 'right',
      render: (b) => (
        <div className="whitespace-nowrap">
          <p className="text-gray-700">{money(commissionOf(b))}</p>
          <p className="text-[11px] text-gray-400" title="Commission rate on this booking">{formatPercent(b.commissionPercent)}</p>
        </div>
      ),
    },
    { key: 'memberPrice', header: 'Member price', align: 'right', render: (b) => money(b.memberPricePaise, 'On request') },
    { key: 'discount', header: 'Discount', align: 'right', render: (b) => (b.discountPaise ? <span className="whitespace-nowrap text-rose-500">−{formatINR(b.discountPaise)}</span> : <span className="text-gray-300">—</span>) },
    { key: 'payable', header: 'Payable', align: 'right', render: (b) => <span className="font-semibold text-gray-700">{money(b.payablePaise)}</span> },
    {
      key: 'paid',
      header: 'Cash received',
      align: 'right',
      render: (b) =>
        b.payment?.status === 'paid' ? (
          <div className="whitespace-nowrap">
            <p className="font-semibold text-gray-700">{formatINR(b.payment.amountPaise)}</p>
            <p className="text-[11px] text-gray-400" title={formatDateTime(b.payment.paidAt)}>
              {formatDate(b.payment.paidAt)}
            </p>
          </div>
        ) : (
          <Badge tone="warning">Unpaid</Badge>
        ),
    },
    { key: 'net', header: 'NIVASA net', align: 'right', render: (b) => (b.payment?.status === 'paid' ? <NetAmount paise={b.payment.netToPlatformPaise} /> : <span className="text-gray-300">—</span>) },
    { key: 'vendorEarned', header: 'Vendor earned', align: 'right', render: (b) => (b.payment?.status === 'paid' ? <span className="whitespace-nowrap">{formatINR(b.payment.vendorEarningsPaise)}</span> : <span className="text-gray-300">—</span>) },
  ];

  const filtered = Boolean(status || paid);
  return (
    <div>
      <PageHeader
        back={
          vendorId && (
            <Link to={`/admin/vendors/${vendorId}`} className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-brand">
              <Icon name="fa-solid fa-arrow-left" /> {vendorName}
            </Link>
          )
        }
        title="Service bookings"
        subtitle="Members’ bookings of vendor services, and what each paid booking settles to. Vendors collect cash in person and record it; no online payment is taken."
      />

      <div className="mb-4">
        <SettlementCards totals={paid === 'false' ? NO_TOTALS : list.data?.totals} vendorScope={Boolean(vendorId)} />
      </div>
      <Alert tone="info" className="mb-6" title="How each booking is priced">
        <b>Member price</b> = vendor price + NIVASA commission (the vendor’s commission %). If the member applied the discount, <b>payable</b> = member price − discount (the vendor’s discount % of the commission). When the vendor records the cash: <b>NIVASA net</b> = commission − discount, and <b>vendor earned</b> = cash − NIVASA net. Vendors collect the cash, so a <span className="font-semibold text-emerald-700">positive</span> net is what the vendor owes NIVASA. Totals cover paid bookings only{filtered || vendorId ? ', for the filters below' : ''}.
      </Alert>

      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'booking')}</span>}>
          {vendorId && (
            <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-brand-light py-1 pl-3 pr-1 text-[11px] font-semibold text-brand sm:self-auto" data-testid="vendor-filter">
              <Icon name="fa-solid fa-id-card" className="text-[10px]" />
              <span className="truncate">{vendorName}</span>
              <button type="button" onClick={() => setFilter('vendorId', '')} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-brand/10" aria-label="Show all vendors">
                <Icon name="fa-solid fa-xmark" className="text-[9px]" />
              </button>
            </span>
          )}
          <Select value={status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Booking status" className="sm:w-44">
            {STATUSES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select value={paid} onChange={(e) => setFilter('paid', e.target.value)} aria-label="Payment" className="sm:w-40">
            <option value="">Paid & unpaid</option>
            <option value="true">Paid</option>
            <option value="false">Unpaid</option>
          </Select>
          {filtered && (
            <Button variant="ghost" size="xs" icon="fa-solid fa-xmark" onClick={() => setParams(vendorId ? { vendorId } : {}, { replace: true })}>
              Clear filters
            </Button>
          )}
        </Toolbar>
        <DataTable
          testId="service-bookings-table"
          columns={columns}
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          dim={list.reloading}
          empty={<EmptyState compact icon="fa-regular fa-calendar-check" title={filtered || vendorId ? 'No bookings match' : 'No service bookings yet'} message={filtered ? 'Try other filters.' : 'Bookings appear here when members book a vendor’s service in the app.'} />}
        />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
      {list.data && (
        <p className="mt-3 text-[11px] text-brand-muted">
          <Icon name="fa-solid fa-circle-info" className="mr-1" />
          Prices and rates are the ones in force when the member booked (the vendor’s rates are set on their page). Settlement figures are fixed when the vendor records the cash and never change. {formatNumber(paid === 'false' ? 0 : list.data.totals?.paidBookings || 0)} paid in this view.
        </p>
      )}
    </div>
  );
}
