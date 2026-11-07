import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction, useDebounced, usePaged } from '../../lib/hooks.js';
import { formatDate, formatPhone, formatRelative, humanize } from '../../lib/format.js';
import { noPermissionReason } from '../../lib/roles.js';
import { Avatar, Badge, Button, EmptyState, PageHeader, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { SearchInput } from '../../components/Form.jsx';
import { ConfirmDialog, ReasonDialog } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useCounts } from '../../layout/Portals.jsx';

const TABS = [
  { value: 'pending', label: 'Pending approval', icon: 'fa-regular fa-clock' },
  { value: 'approved', label: 'Directory', icon: 'fa-solid fa-address-book' },
  { value: 'suspended', label: 'Suspended', icon: 'fa-solid fa-user-slash' },
  { value: 'rejected', label: 'Rejected', icon: 'fa-solid fa-user-xmark' },
];

const EMPTY = {
  pending: ['fa-regular fa-circle-check', 'No pending requests', 'When residents join your society from the Nivasa app, their requests appear here for approval.'],
  approved: ['fa-solid fa-address-book', 'No approved residents yet', 'Approve pending requests to build your resident directory.'],
  suspended: ['fa-solid fa-user-slash', 'No suspended residents', 'Residents you suspend appear here and can be reactivated.'],
  rejected: ['fa-solid fa-user-xmark', 'No rejected requests', 'Requests you decline are kept here for reference.'],
};

/** Which dialog each action needs and what the API requires. */
const ACTIONS = {
  approve: { title: 'Approve resident', confirm: 'Approve', tone: 'primary', reason: false },
  reactivate: { title: 'Reactivate resident', confirm: 'Reactivate', tone: 'primary', reason: false, endpoint: 'approve' },
  reject: { title: 'Reject request', confirm: 'Reject', tone: 'danger', reason: true },
  suspend: { title: 'Suspend resident', confirm: 'Suspend', tone: 'danger', reason: true },
  remove: { title: 'Remove resident', confirm: 'Remove', tone: 'danger', reason: true },
};

export default function Residents() {
  const { can, role } = useAuth();
  const toast = useToast();
  const { refreshCounts, counts } = useCounts();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'pending';
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const list = usePaged((p) => api.get('/society/memberships', p), { status: tab, q });
  const [pending, setPending] = useState(null); // { action, m }
  const canAct = can('members');
  const reason = canAct ? null : noPermissionReason(role);

  const [run, busy] = useAction(
    async (r) => {
      const def = ACTIONS[pending.action];
      await api.post(`/society/memberships/${pending.m._id}/${def.endpoint || pending.action}`, r ? { reason: r } : {});
      return pending;
    },
    {
      toast,
      success: (p) => `${p.m.user?.name || 'Resident'} — ${humanize(p.action === 'reactivate' ? 'reactivated' : `${p.action}${p.action.endsWith('e') ? 'd' : 'ed'}`)}`,
      onDone: () => {
        setPending(null);
        list.reload();
        refreshCounts();
      },
    },
  );

  const who = (m) => (
    <div className="flex items-center gap-3">
      <Avatar name={m.user?.name} size="sm" />
      <div className="min-w-0">
        <p className="truncate font-semibold text-gray-700">{m.user?.name || 'Unnamed resident'}</p>
        <p className="truncate text-[11px] text-gray-400">{[m.user?.phone && formatPhone(m.user.phone), m.user?.email].filter(Boolean).join(' · ')}</p>
      </div>
    </div>
  );

  const actionsFor = (m) => {
    const btn = (action, label, variant, icon) => (
      <Button key={action} size="xs" variant={variant} icon={icon} disabledReason={reason} onClick={(e) => (e.stopPropagation(), setPending({ action, m }))} data-testid={`member-${action}`}>
        {label}
      </Button>
    );
    if (m.status === 'pending') return [btn('approve', 'Approve', 'success-outline', 'fa-solid fa-check'), btn('reject', 'Reject', 'danger-outline', 'fa-solid fa-xmark')];
    if (m.status === 'approved') return [btn('suspend', 'Suspend', 'secondary', 'fa-solid fa-pause'), btn('remove', 'Remove', 'danger-outline', 'fa-regular fa-trash-can')];
    if (m.status === 'suspended') return [btn('reactivate', 'Reactivate', 'success-outline', 'fa-solid fa-play'), btn('remove', 'Remove', 'danger-outline', 'fa-regular fa-trash-can')];
    return null;
  };

  const columns = [
    { key: 'user', header: 'Resident', render: who },
    { key: 'flat', header: 'Flat', render: (m) => <span className="font-semibold text-gray-700">{[m.building?.name, m.flat?.number].filter(Boolean).join(' · ')}</span> },
    { key: 'type', header: 'Type', render: (m) => <Badge tone={m.residentType === 'owner' ? 'purple' : m.residentType === 'tenant' ? 'info' : 'neutral'}>{humanize(m.residentType)}</Badge> },
    tab === 'pending'
      ? { key: 'requested', header: 'Requested', render: (m) => <span title={formatDate(m.createdAt)}>{formatRelative(m.createdAt)}</span> }
      : { key: 'decided', header: tab === 'approved' ? 'Member since' : 'Decided', render: (m) => formatDate(m.decidedAt || m.updatedAt) },
    ...(tab === 'rejected' || tab === 'suspended' ? [{ key: 'reason', header: 'Reason', className: 'max-w-[260px] whitespace-normal', render: (m) => m.decisionReason || '—' }] : []),
    ...(tab === 'pending' ? [{ key: 'note', header: 'Note', className: 'max-w-[220px] whitespace-normal', render: (m) => m.note || <span className="text-gray-300">—</span> }] : []),
    { key: 'status', header: 'Status', render: (m) => <Badge status={m.status} /> },
    ...(tab !== 'rejected' ? [{ key: 'actions', header: '', align: 'right', render: (m) => <div className="flex justify-end gap-2">{actionsFor(m)}</div> }] : []),
  ];

  const d = pending && ACTIONS[pending.action];
  const subject = pending && `${pending.m.user?.name || 'this resident'} (${[pending.m.building?.name, pending.m.flat?.number].filter(Boolean).join(' ')})`;
  const [icon, title, message] = EMPTY[tab];

  return (
    <div>
      <PageHeader title="Residents" subtitle="Approve membership requests and manage your resident directory" />
      <Tabs className="mb-4" tabs={TABS.map((t) => (t.value === 'pending' ? { ...t, count: counts.pendingMembers ?? undefined } : t))} value={tab} onChange={(v) => (setParams({ tab: v }), setSearch(''))} />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{list.data.total} {list.data.total === 1 ? 'resident' : 'residents'}</span>}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone or flat…" className="w-full sm:w-72" />
        </Toolbar>
        <DataTable testId="residents-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} empty={<EmptyState icon={icon} title={q ? 'No matches' : title} message={q ? `Nothing matches “${q}”.` : message} compact />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>

      <ConfirmDialog open={Boolean(pending && !d?.reason)} onClose={() => setPending(null)} onConfirm={() => run()} busy={busy} tone="primary" title={d?.title} confirmLabel={d?.confirm} message={<>Give {subject} full access to society features in the Nivasa app?</>} />
      <ReasonDialog open={Boolean(pending && d?.reason)} onClose={() => setPending(null)} onSubmit={(r) => run(r)} busy={busy} title={d?.title} confirmLabel={d?.confirm} message={<>This will {pending?.action} {subject}. The resident is notified with your reason.</>} />
    </div>
  );
}
