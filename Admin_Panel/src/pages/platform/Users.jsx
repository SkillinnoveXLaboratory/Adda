import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction, useDebounced, usePaged } from '../../lib/hooks.js';
import { formatDate, formatPhone, formatRelative, plural } from '../../lib/format.js';
import { Avatar, Badge, Button, EmptyState, PageHeader, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { SearchInput, Select } from '../../components/Form.jsx';
import { ConfirmDialog, ReasonDialog } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [accountType, setAccountType] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const list = usePaged((p) => api.get('/platform/users', { ...p, sort: '-createdAt' }), { status, role, accountType, q });
  const [act, setAct] = useState(null);
  const [run, busy] = useAction((reason) => api.post(`/platform/users/${act.u._id}/${act.to}`, reason ? { reason } : {}), {
    toast,
    success: () => (act.to === 'disabled' ? `${act.u.name || 'User'} disabled and signed out everywhere` : `${act.u.name || 'User'} re-enabled`),
    onDone: () => (setAct(null), list.reload()),
  });
  const reasonFor = (u) => (u._id === me?._id ? 'You can’t change your own account' : u.platformRole === 'super_admin' ? 'Super admin accounts are managed from the server console' : u.status === 'pending_setup' ? 'This account hasn’t completed setup yet' : null);
  const columns = [
    { key: 'name', header: 'User', render: (u) => <div className="flex items-center gap-3"><Avatar name={u.name || u.email || u.phone} size="sm" /><div className="min-w-0"><Link to={`/admin/members/${u._id}`} className="link block truncate">{u.name || 'Unnamed'}</Link><p className="truncate text-[11px] text-gray-400">{u.email || '—'}</p></div></div> },
    {
      key: 'type',
      header: 'Type',
      render: (u) =>
        u.accountType === 'vendor' ? (
          <Link to={`/admin/vendors/${u._id}`} title="Open vendor & KYC">
            <Badge tone="info">Vendor</Badge>
          </Link>
        ) : (
          <Badge tone="neutral">Member</Badge>
        ),
    },
    { key: 'phone', header: 'Mobile', render: (u) => formatPhone(u.phone) },
    { key: 'role', header: 'Role', render: (u) => <Badge tone={u.platformRole === 'super_admin' ? 'purple' : 'neutral'}>{u.platformRole === 'super_admin' ? 'Super admin' : 'User'}</Badge> },
    { key: 'city', header: 'City', render: (u) => u.city || '—' },
    { key: 'joined', header: 'Joined', render: (u) => formatDate(u.createdAt) },
    { key: 'last', header: 'Last sign-in', render: (u) => (u.lastLoginAt ? formatRelative(u.lastLoginAt) : <span className="text-gray-300">—</span>) },
    { key: 'status', header: 'Status', render: (u) => <div><Badge status={u.status} />{u.status === 'disabled' && u.disabledReason && <p className="mt-0.5 max-w-[160px] truncate text-[10px] text-gray-400" title={u.disabledReason}>{u.disabledReason}</p>}</div> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) =>
        u.status === 'disabled' ? (
          <Button size="xs" variant="success-outline" icon="fa-solid fa-play" disabledReason={reasonFor(u)} onClick={() => setAct({ u, to: 'active' })}>
            Enable
          </Button>
        ) : (
          <Button size="xs" variant="danger-outline" icon="fa-solid fa-ban" disabledReason={reasonFor(u)} onClick={() => setAct({ u, to: 'disabled' })} data-testid="user-disable">
            Disable
          </Button>
        ),
    },
  ];
  return (
    <div>
      <PageHeader title="Accounts" subtitle="Every sign-in account on Nivasa — members (residents and customers) and vendors (list properties and services). Contact details are masked — open a profile to reveal them (logged)." />
      <Tabs className="mb-4" tabs={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'pending_setup', label: 'Setup pending' }, { value: 'disabled', label: 'Disabled' }]} value={status} onChange={setStatus} />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'user', 'users')}</span>}>
          <SearchInput value={search} onChange={setSearch} placeholder="Name, phone or email…" className="w-full sm:w-72" />
          <Select value={accountType} onChange={(e) => setAccountType(e.target.value)} aria-label="Account type" className="sm:w-44" data-testid="account-type-filter">
            <option value="">Members & vendors</option>
            <option value="member">Members</option>
            <option value="vendor">Vendors</option>
          </Select>
          <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className="sm:w-44">
            <option value="">All roles</option>
            <option value="user">Users</option>
            <option value="super_admin">Super admins</option>
          </Select>
        </Toolbar>
        <DataTable testId="users-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} empty={<EmptyState compact icon="fa-solid fa-users" title={q || status || role || accountType ? 'No users match' : 'No users yet'} />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
      <ReasonDialog open={act?.to === 'disabled'} onClose={() => setAct(null)} onSubmit={(r) => run(r)} busy={busy} title={`Disable ${act?.u?.name || 'user'}`} confirmLabel="Disable account" message="They are signed out on every device and can’t sign in until re-enabled." />
      <ConfirmDialog open={act?.to === 'active'} onClose={() => setAct(null)} onConfirm={() => run()} busy={busy} tone="primary" title={`Enable ${act?.u?.name || 'user'}`} confirmLabel="Enable" message={`${act?.u?.name || 'This user'} will be able to sign in again.`} />
    </div>
  );
}
