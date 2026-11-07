import { useNavigate } from 'react-router';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useQuery } from '../../lib/hooks.js';
import { formatINR, formatINRShort, formatNumber, formatPeriod, formatRelative, humanize } from '../../lib/format.js';
import { ROLE_LABELS } from '../../lib/roles.js';
import { Badge, Button, Card, cx, EmptyState, Icon, PageHeader, PageSkeleton, QueryState } from '../../components/ui.jsx';
import { ActivityList, BarChart, DoughnutChart, Legend, MetricCard, SERIES } from '../../components/Charts.jsx';

const COMPLAINT_STATUS = [
  ['pending', 'Pending', SERIES.amber],
  ['assigned', 'Assigned', SERIES.blue],
  ['in_progress', 'In progress', SERIES.purple],
  ['resolved', 'Resolved', SERIES.green],
  ['closed', 'Closed', SERIES.gray],
  ['rejected', 'Rejected', SERIES.orange],
];

export default function SocietyDashboard() {
  const { can, role, society } = useAuth();
  const navigate = useNavigate();
  const q = useQuery(() => api.get('/society/overview'), []);

  return (
    <QueryState query={q} skeleton={<PageSkeleton cards={4} rows={7} />}>
      {(o) => {
        const trend = o.trend || [];
        const hasTrend = trend.some((t) => t.billedPaise || t.collectedPaise);
        const complaintsTotal = COMPLAINT_STATUS.reduce((s, [k]) => s + (o.complaints?.[k] || 0), 0);
        const open = (o.complaints?.pending || 0) + (o.complaints?.assigned || 0) + (o.complaints?.in_progress || 0);
        const queues = [
          { label: 'Residents to approve', count: o.counts.pendingMembers, icon: 'fa-solid fa-user-clock', to: '/society/residents', perm: 'members.read', tone: 'text-brand bg-brand-light' },
          { label: 'Open complaints', count: open, icon: 'fa-solid fa-screwdriver-wrench', to: '/society/complaints', perm: 'complaints', tone: 'text-amber-500 bg-amber-50' },
          { label: 'Bookings to approve', count: o.counts.pendingBookings, icon: 'fa-regular fa-calendar-check', to: '/society/facilities', perm: 'facilities', tone: 'text-blue-500 bg-blue-50' },
          { label: 'Open service requests', count: o.counts.openServiceRequests, icon: 'fa-solid fa-toolbox', to: '/society/services', perm: 'services', tone: 'text-emerald-500 bg-emerald-50' },
          { label: 'Listings to moderate', count: o.counts.pendingListings, icon: 'fa-solid fa-store', to: '/society/listings', perm: 'listings', tone: 'text-cyan-500 bg-cyan-50' },
          { label: 'Reported content', count: o.counts.openReports, icon: 'fa-regular fa-flag', to: '/society/community', perm: 'community', tone: 'text-rose-500 bg-rose-50' },
        ].filter((x) => can(x.perm));

        return (
          <div data-testid="society-dashboard">
            <PageHeader
              title="Dashboard"
              subtitle={`${o.society?.name || society?.name} · ${o.society?.code || ''} · signed in as ${ROLE_LABELS[role] || role}`}
              actions={
                <>
                  <Button variant="outline" icon="fa-solid fa-rotate-right" onClick={q.reload} loading={q.reloading}>
                    Refresh
                  </Button>
                  {can('finance') ? (
                    <Button icon="fa-solid fa-file-invoice" onClick={() => navigate('/society/billing?generate=1')}>
                      Generate bills
                    </Button>
                  ) : can('announcements') ? (
                    <Button icon="fa-solid fa-bullhorn" onClick={() => navigate('/society/announcements?new=1')}>
                      New notice
                    </Button>
                  ) : null}
                </>
              }
            />

            <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard tone="purple" label="Residents" value={formatNumber(o.counts.residents)} footer={`${formatNumber(o.counts.flats)} flats · ${formatNumber(o.counts.buildings)} buildings`} footerIcon="fa-regular fa-building" icon="fa-solid fa-user-group" testId="card-residents" onClick={can('members.read') ? () => navigate('/society/residents?tab=approved') : undefined} />
              <MetricCard tone="cyan" label="Pending approvals" value={formatNumber(o.counts.pendingMembers)} footer={o.counts.pendingMembers ? 'Awaiting your review' : 'No one is waiting'} footerIcon="fa-regular fa-clock" icon="fa-solid fa-user-clock" testId="card-pending" onClick={can('members.read') ? () => navigate('/society/residents') : undefined} />
              <MetricCard tone="orange" label="Outstanding dues" value={formatINR(o.finance.outstandingPaise, { whole: true })} title={formatINR(o.finance.outstandingPaise)} footer={`${formatINR(o.finance.overduePaise, { whole: true })} overdue · ${formatNumber(o.finance.openInvoices)} open`} footerIcon="fa-solid fa-triangle-exclamation" series={hasTrend ? trend.map((t) => t.billedPaise - t.collectedPaise) : null} icon="fa-solid fa-file-invoice" testId="card-outstanding" onClick={can('finance.read') ? () => navigate('/society/billing') : undefined} />
              <MetricCard tone="green" label="Collected this month" value={formatINR(o.finance.collectedThisMonthPaise, { whole: true })} title={formatINR(o.finance.collectedThisMonthPaise)} footer={`Ledger balance ${formatINR(o.finance.balancePaise, { whole: true })}`} footerIcon="fa-solid fa-wallet" series={hasTrend ? trend.map((t) => t.collectedPaise) : null} icon="fa-solid fa-indian-rupee-sign" testId="card-collected" onClick={can('finance.read') ? () => navigate('/society/payments') : undefined} />
            </div>

            <div className="grid grid-cols-12 gap-6">
              <Card className="col-span-12 lg:col-span-8" title="Billed vs collected · last 6 months" actions={hasTrend && <Legend items={[{ label: 'Billed', color: SERIES.purple }, { label: 'Collected', color: SERIES.cyan }]} />}>
                {hasTrend ? (
                  <BarChart
                    labels={trend.map((t) => formatPeriod(t.period))}
                    datasets={[
                      { label: 'Billed', data: trend.map((t) => t.billedPaise), color: SERIES.purple },
                      { label: 'Collected', data: trend.map((t) => t.collectedPaise), color: SERIES.cyan },
                    ]}
                    formatValue={(v, full) => (full ? formatINR(v) : formatINRShort(v))}
                    ariaLabel="Billed versus collected maintenance for the last six months"
                  />
                ) : (
                  <div className="flex h-80 items-center justify-center">
                    <EmptyState icon="fa-regular fa-chart-bar" title="No billing data yet" message="Once you generate maintenance bills, billed and collected amounts for each month appear here." action={can('finance') && <Button icon="fa-solid fa-file-invoice" onClick={() => navigate('/society/billing?generate=1')}>Generate bills</Button>} />
                  </div>
                )}
              </Card>

              <Card className="col-span-12 lg:col-span-4" title="Recent complaints" actions={can('complaints') && <Button size="xs" onClick={() => navigate('/society/complaints')}>View All</Button>}>
                {o.recentComplaints?.length ? (
                  <ActivityList
                    items={o.recentComplaints.map((c) => ({
                      key: c._id,
                      title: c.ticketNumber,
                      highlight: humanize(c.status),
                      highlightClass: { pending: 'text-amber-500', assigned: 'text-blue-500', in_progress: 'text-brand', resolved: 'text-emerald-500', closed: 'text-gray-400', rejected: 'text-rose-400' }[c.status],
                      subtitle: c.title,
                      time: formatRelative(c.createdAt),
                      onClick: can('complaints') ? () => navigate(`/society/complaints?open=${c._id}`) : undefined,
                    }))}
                  />
                ) : (
                  <EmptyState compact icon="fa-regular fa-face-smile" title="No complaints yet" message="Complaints raised by residents from the Nivasa app appear here." />
                )}
              </Card>

              <Card className="col-span-12 self-start md:col-span-6 xl:col-span-4" title="Complaint status">
                {complaintsTotal ? (
                  <div className="flex flex-col items-center gap-5 sm:flex-row">
                    <DoughnutChart labels={COMPLAINT_STATUS.map((s) => s[1])} data={COMPLAINT_STATUS.map(([k]) => o.complaints?.[k] || 0)} colors={COMPLAINT_STATUS.map((s) => s[2])} centerLabel="Total" centerValue={formatNumber(complaintsTotal)} size={150} />
                    <ul className="w-full flex-1 space-y-2">
                      {COMPLAINT_STATUS.map(([k, label, color]) => (
                        <li key={k} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 text-gray-600">
                            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                            {label}
                          </span>
                          <span className="font-semibold text-gray-800">{formatNumber(o.complaints?.[k] || 0)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <EmptyState compact icon="fa-solid fa-chart-pie" title="Nothing to chart yet" message="The status breakdown appears after the first complaint." />
                )}
              </Card>

              <Card className="col-span-12 self-start md:col-span-6 xl:col-span-8" title="Needs attention">
                {queues.length ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2 min-[1400px]:grid-cols-3">
                    {queues.map((x) => (
                      <button key={x.label} type="button" onClick={() => navigate(x.to)} className="group flex items-center gap-3 rounded-xl border border-gray-100 px-4 py-3 text-left transition-colors hover:border-brand/30 hover:bg-brand-light/30">
                        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', x.tone)}>
                          <Icon name={x.icon} className="text-sm" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-lg font-bold leading-tight text-gray-800">{formatNumber(x.count || 0)}</span>
                          <span className="block truncate text-[11px] text-gray-500">{x.label}</span>
                        </span>
                        <Icon name="fa-solid fa-chevron-right" className="text-[10px] text-gray-300 group-hover:text-brand" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState compact icon="fa-regular fa-circle-check" title="Nothing for your role here" />
                )}
                {o.society?.status === 'suspended' && (
                  <p className="mt-4 text-[11px] text-rose-500">
                    <Badge status="suspended" /> Changes are blocked while the society is suspended.
                  </p>
                )}
              </Card>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
