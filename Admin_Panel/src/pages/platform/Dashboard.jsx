import { useNavigate } from 'react-router';
import { api } from '../../lib/api.js';
import { useQuery } from '../../lib/hooks.js';
import { formatDate, formatINR, formatINRShort, formatNumber, formatPeriod, formatRelative, humanize } from '../../lib/format.js';
import { Button, Card, cx, EmptyState, Icon, PageHeader, PageSkeleton, QueryState } from '../../components/ui.jsx';
import { ActivityList, BarChart, Legend, MetricCard, SERIES } from '../../components/Charts.jsx';

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const q = useQuery(async () => {
    const [overview, regs, insights] = await Promise.all([api.get('/platform/overview'), api.get('/platform/society-registrations', { limit: 5, sort: '-createdAt' }), api.get('/platform/overview/insights')]);
    return { overview, regs, insights };
  }, []);

  return (
    <QueryState query={q} skeleton={<PageSkeleton cards={4} rows={7} />}>
      {({ overview: o, regs, insights: ins }) => {
        const statuses = [...new Set((o.payments30d || []).map((p) => p.status))];
        const amount = (channel, status) => (o.payments30d || []).filter((p) => p.channel === channel && p.status === status).reduce((s, p) => s + p.totalPaise, 0);
        const count = (o.payments30d || []).reduce((s, p) => s + p.count, 0);
        const billed = o.billing?.billedPaise || 0;
        const collected = o.billing?.collectedPaise || 0;
        const rate = billed ? Math.round((collected / billed) * 1000) / 10 : 0;
        const attention = [
          { label: 'Applications to review', count: o.counts.pendingRegistrations, icon: 'fa-regular fa-file-lines', to: '/admin/applications', tone: 'text-brand bg-brand-light' },
          { label: 'Listings to moderate', count: o.counts.pendingListings, icon: 'fa-solid fa-store', to: '/admin/listings', tone: 'text-cyan-500 bg-cyan-50' },
          { label: 'Open content reports', count: o.counts.openReports, icon: 'fa-regular fa-flag', to: '/admin/reports', tone: 'text-rose-500 bg-rose-50' },
          { label: 'Open complaints', count: o.counts.openComplaints, icon: 'fa-solid fa-screwdriver-wrench', tone: 'text-amber-500 bg-amber-50' },
          { label: 'Pending memberships', count: o.counts.pendingMembers, icon: 'fa-solid fa-user-clock', to: '/admin/members', tone: 'text-blue-500 bg-blue-50' },
          { label: 'Suspended societies', count: o.counts.suspended, icon: 'fa-solid fa-ban', to: '/admin/societies?status=suspended', tone: 'text-gray-500 bg-gray-100' },
        ];
        return (
          <div data-testid="platform-dashboard">
            <PageHeader
              title="Dashboard"
              subtitle="Platform-wide activity across every society"
              actions={
                <>
                  <Button variant="outline" icon="fa-solid fa-rotate-right" onClick={q.reload} loading={q.reloading}>
                    Refresh
                  </Button>
                  <Button icon="fa-regular fa-file-lines" onClick={() => navigate('/admin/applications')}>
                    Review applications
                  </Button>
                </>
              }
            />
            <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard tone="purple" label="Active societies" value={formatNumber(o.counts.societies)} footer={`${formatNumber(o.counts.suspended)} suspended`} footerIcon="fa-regular fa-building" icon="fa-regular fa-building" onClick={() => navigate('/admin/societies')} testId="card-societies" />
              <MetricCard tone="orange" label="Pending applications" value={formatNumber(o.counts.pendingRegistrations)} footer="In the review queue" footerIcon="fa-regular fa-clock" icon="fa-regular fa-file-lines" onClick={() => navigate('/admin/applications')} testId="card-applications" />
              <MetricCard tone="green" label="Resident accounts" value={formatNumber(o.counts.users)} footer={`${formatNumber(o.counts.newUsers30d)} joined in 30 days`} footerIcon="fa-solid fa-arrow-trend-up" icon="fa-solid fa-users" series={ins.trends.newResidents} onClick={() => navigate('/admin/users')} testId="card-users" />
              <MetricCard tone="cyan" label="Approved members" value={formatNumber(o.counts.members)} footer={`${formatNumber(o.counts.pendingMembers)} awaiting approval`} footerIcon="fa-solid fa-user-check" icon="fa-solid fa-house-user" onClick={() => navigate('/admin/members')} testId="card-members" />
            </div>

            <div className="grid grid-cols-12 gap-6">
              <Card className="col-span-12 lg:col-span-8" title="Payments · last 30 days" actions={statuses.length > 0 && <Legend items={[{ label: 'Online', color: SERIES.purple }, { label: 'Offline', color: SERIES.cyan }]} />}>
                {statuses.length ? (
                  <>
                    <BarChart
                      height="h-72"
                      labels={statuses.map(humanize)}
                      datasets={[
                        { label: 'Online', data: statuses.map((s) => amount('online', s)), color: SERIES.purple },
                        { label: 'Offline', data: statuses.map((s) => amount('offline', s)), color: SERIES.cyan },
                      ]}
                      formatValue={(v, full) => (full ? formatINR(v) : formatINRShort(v))}
                      ariaLabel="Payment amounts by status for the last 30 days"
                    />
                    <p className="mt-3 text-[11px] text-brand-muted">{formatNumber(count)} payment records in the last 30 days, grouped by status.</p>
                  </>
                ) : (
                  <div className="flex h-72 items-center justify-center">
                    <EmptyState icon="fa-solid fa-indian-rupee-sign" title="No payments in the last 30 days" message="Offline and online maintenance payments recorded by societies appear here." />
                  </div>
                )}
              </Card>

              <Card className="col-span-12 lg:col-span-4" title="Recent applications" actions={<Button size="xs" onClick={() => navigate('/admin/applications')}>View All</Button>}>
                {regs.items?.length ? (
                  <ActivityList
                    items={regs.items.map((r) => ({
                      key: r._id,
                      title: `${r.societyName},`,
                      highlight: humanize(r.status),
                      highlightClass: r.status === 'under_review' ? 'text-blue-500' : 'text-amber-500',
                      subtitle: `${r.city} · ${r.referenceCode}`,
                      time: formatRelative(r.submittedAt || r.createdAt),
                      onClick: () => navigate(`/admin/applications?open=${r._id}`),
                    }))}
                  />
                ) : (
                  <EmptyState compact icon="fa-regular fa-circle-check" title="Queue is clear" message="New society applications will show up here." />
                )}
              </Card>

              <Card className="col-span-12 self-start md:col-span-5 xl:col-span-4" title="Maintenance billing · all time">
                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[11px] text-brand-muted">Collected</p>
                      <p className="text-xl font-bold text-gray-800">{formatINR(collected, { whole: true })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-brand-muted">Billed</p>
                      <p className="text-sm font-semibold text-gray-600">{formatINR(billed, { whole: true })}</p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100} aria-label="Collection rate">
                    <div className="h-full rounded-full bg-grad-green" style={{ width: `${Math.min(rate, 100)}%` }} />
                  </div>
                  <p className="text-xs text-gray-600">
                    Collection rate <span className="font-bold text-gray-800">{billed ? `${rate}%` : '—'}</span>
                    {billed > 0 && <span className="text-brand-muted"> · {formatINR(billed - collected, { whole: true })} outstanding</span>}
                  </p>
                </div>
              </Card>

              <Card className="col-span-12 self-start md:col-span-7 xl:col-span-8" title="Needs attention">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2 min-[1400px]:grid-cols-3">
                  {attention.map((x) => {
                    const Comp = x.to ? 'button' : 'div';
                    return (
                      <Comp key={x.label} type={x.to ? 'button' : undefined} onClick={x.to ? () => navigate(x.to) : undefined} className={cx('group flex items-center gap-3 rounded-xl border border-gray-100 px-4 py-3 text-left', x.to && 'transition-colors hover:border-brand/30 hover:bg-brand-light/30')}>
                        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', x.tone)}>
                          <Icon name={x.icon} className="text-sm" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-lg font-bold leading-tight text-gray-800">{formatNumber(x.count || 0)}</span>
                          <span className="block truncate text-[11px] text-gray-500">{x.label}</span>
                        </span>
                        {x.to && <Icon name="fa-solid fa-chevron-right" className="text-[10px] text-gray-300 group-hover:text-brand" />}
                      </Comp>
                    );
                  })}
                </div>
              </Card>

              <Card className="col-span-12 xl:col-span-6" title="Billed vs collected · last 6 months" actions={<Legend items={[{ label: 'Billed', color: SERIES.purple }, { label: 'Collected', color: SERIES.green }]} />}>
                <BarChart
                  height="h-64"
                  labels={ins.months.map(formatPeriod)}
                  datasets={[
                    { label: 'Billed', data: ins.trends.billedPaise, color: SERIES.purple },
                    { label: 'Collected', data: ins.trends.collectedPaise, color: SERIES.green },
                  ]}
                  formatValue={(v, full) => (full ? formatINR(v) : formatINRShort(v))}
                  ariaLabel="Maintenance billed and collected per month, all societies"
                />
              </Card>
              <Card className="col-span-12 xl:col-span-6" title="Residents & complaints · last 6 months" actions={<Legend items={[{ label: 'New residents', color: SERIES.cyan }, { label: 'Complaints', color: SERIES.orange }, { label: 'Resolved', color: SERIES.green }]} />}>
                <BarChart
                  height="h-64"
                  labels={ins.months.map(formatPeriod)}
                  datasets={[
                    { label: 'New residents', data: ins.trends.newResidents, color: SERIES.cyan },
                    { label: 'Complaints opened', data: ins.trends.complaintsOpened, color: SERIES.orange },
                    { label: 'Resolved', data: ins.trends.complaintsResolved, color: SERIES.green },
                  ]}
                  ariaLabel="New residents, complaints opened and resolved per month"
                />
              </Card>

              <Card className="col-span-12 lg:col-span-4" title="Applications waiting > 3 days">
                {ins.attention.staleApplications.length ? (
                  <ul className="divide-y divide-gray-50" data-testid="stale-applications">
                    {ins.attention.staleApplications.map((r) => (
                      <li key={r._id}>
                        <button type="button" onClick={() => navigate(`/admin/applications?open=${r._id}`)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-brand">
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-gray-700">{r.societyName}</span>
                            <span className="block text-[11px] text-gray-400">
                              {r.city} · {r.referenceCode}
                            </span>
                          </span>
                          <span className="whitespace-nowrap text-[11px] font-semibold text-amber-600">{formatRelative(r.submittedAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState compact icon="fa-regular fa-circle-check" title="No application is waiting long" />
                )}
              </Card>
              <Card className="col-span-12 lg:col-span-4" title="Complaints open > 14 days">
                {ins.attention.staleComplaints.length ? (
                  <ul className="divide-y divide-gray-50">
                    {ins.attention.staleComplaints.map((c) => (
                      <li key={c._id} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-gray-700">{c.title}</span>
                          <span className="block text-[11px] text-gray-400">
                            {c.society?.name} · {c.ticketNumber} · {humanize(c.status)}
                          </span>
                        </span>
                        <span className="whitespace-nowrap text-[11px] text-gray-400">{formatDate(c.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState compact icon="fa-regular fa-circle-check" title="No old open complaints" />
                )}
              </Card>
              <Card className="col-span-12 lg:col-span-4" title="Societies without an active admin">
                {ins.attention.societiesWithoutAdmin.length ? (
                  <ul className="divide-y divide-gray-50">
                    {ins.attention.societiesWithoutAdmin.map((s) => (
                      <li key={s._id}>
                        <button type="button" onClick={() => navigate(`/admin/societies/${s._id}`)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:text-brand">
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-gray-700">{s.name}</span>
                            <span className="block text-[11px] text-gray-400">
                              {s.code} · {s.city}
                            </span>
                          </span>
                          <Icon name="fa-solid fa-user-plus" className="text-[11px] text-brand" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState compact icon="fa-regular fa-circle-check" title="Every society has an admin" />
                )}
              </Card>

              <Card className="col-span-12" title="Top societies">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  {[
                    ['By residents', ins.top.bySize, (r) => formatNumber(r.residents)],
                    ['By outstanding dues', ins.top.byDues, (r) => formatINR(r.duePaise, { whole: true })],
                    ['By open complaints', ins.top.byOpenComplaints, (r) => formatNumber(r.openComplaints)],
                  ].map(([title, rows, value]) => (
                    <div key={title}>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">{title}</p>
                      {rows.length ? (
                        <ol className="space-y-1">
                          {rows.slice(0, 5).map((r, i) => (
                            <li key={r.society._id}>
                              <button type="button" onClick={() => navigate(`/admin/societies/${r.society._id}`)} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-brand-light/50">
                                <span className="w-4 text-[11px] font-bold text-gray-300">{i + 1}</span>
                                <span className="min-w-0 flex-1 truncate font-medium text-gray-700">{r.society.name}</span>
                                <span className="font-semibold text-gray-800">{value(r)}</span>
                              </button>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="px-2 py-3 text-xs text-gray-400">No data yet</p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
