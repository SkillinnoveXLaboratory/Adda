import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../lib/api.js';
import { useDebounced, usePaged, useQuery } from '../../lib/hooks.js';
import { formatDate, formatRelative, humanize, plural } from '../../lib/format.js';
import { Avatar, Badge, EmptyState, PageHeader, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { SearchInput, Select } from '../../components/Form.jsx';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Removed' },
];

/** Members directory across every society (GET /platform/members). Contact details arrive masked. */
export default function Members() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [societyId, setSocietyId] = useState('');
  const [residentType, setResidentType] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const societies = useQuery(() => api.get('/platform/societies', { limit: 100, sort: 'name' }), []);
  const list = usePaged((p) => api.get('/platform/members', { ...p, sort: '-createdAt' }), { status, societyId, residentType, q });

  const columns = [
    {
      key: 'member',
      header: 'Member',
      render: (m) => (
        <div className="flex items-center gap-3">
          <Avatar name={m.user?.name} size="sm" />
          <div className="min-w-0">
            <Link to={`/admin/members/${m.user?._id}`} onClick={(e) => e.stopPropagation()} className="link block truncate">
              {m.user?.name || 'Unnamed'}
            </Link>
            <p className="truncate font-mono text-[11px] text-gray-400">{m.user?.phone || m.user?.email || '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'society', header: 'Society', render: (m) => <div className="min-w-0"><p className="truncate font-medium text-gray-700">{m.society?.name || '—'}</p><p className="text-[11px] text-gray-400">{[m.society?.code, m.society?.city].filter(Boolean).join(' · ')}</p></div> },
    { key: 'flat', header: 'Flat', render: (m) => <span className="font-semibold text-gray-700">{[m.building?.name, m.flat?.number].filter(Boolean).join(' · ') || '—'}</span> },
    { key: 'type', header: 'Type', render: (m) => <Badge tone={m.residentType === 'owner' ? 'purple' : m.residentType === 'tenant' ? 'info' : 'neutral'}>{humanize(m.residentType)}</Badge> },
    { key: 'status', header: 'Status', render: (m) => <Badge status={m.status === 'cancelled' ? 'removed' : m.status} /> },
    { key: 'joined', header: 'Requested', render: (m) => formatDate(m.createdAt) },
    { key: 'last', header: 'Last sign-in', render: (m) => (m.user?.lastLoginAt ? formatRelative(m.user.lastLoginAt) : <span className="text-gray-300">Never</span>) },
  ];

  return (
    <div>
      <PageHeader title="Members directory" subtitle="Every resident membership across all societies. Open a member for the full profile and owner actions." />
      <Tabs className="mb-4" tabs={STATUS_TABS} value={status} onChange={setStatus} />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'membership', 'memberships')}</span>}>
          <SearchInput value={search} onChange={setSearch} placeholder="Name, mobile, email or flat no…" className="w-full sm:w-72" />
          <Select value={societyId} onChange={(e) => setSocietyId(e.target.value)} aria-label="Society" className="sm:w-56" data-testid="members-society">
            <option value="">All societies</option>
            {societies.data?.items?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} ({s.code})
              </option>
            ))}
          </Select>
          <Select value={residentType} onChange={(e) => setResidentType(e.target.value)} aria-label="Resident type" className="sm:w-36">
            <option value="">All types</option>
            <option value="owner">Owners</option>
            <option value="tenant">Tenants</option>
            <option value="family">Family</option>
          </Select>
        </Toolbar>
        <DataTable
          testId="members-table"
          columns={columns}
          rows={list.data?.items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          dim={list.reloading}
          onRowClick={(m) => m.user?._id && navigate(`/admin/members/${m.user._id}`)}
          empty={<EmptyState compact icon="fa-solid fa-address-book" title={q || status || societyId || residentType ? 'No members match' : 'No members yet'} message="Residents appear here once they request to join a society." />}
        />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
    </div>
  );
}
