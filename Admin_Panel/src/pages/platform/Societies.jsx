import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../../lib/api.js';
import { useDebounced, usePaged } from '../../lib/hooks.js';
import { formatDate, formatNumber, plural } from '../../lib/format.js';
import { Badge, Button, EmptyState, PageHeader, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { SearchInput } from '../../components/Form.jsx';

export default function Societies() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') || '');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const list = usePaged((p) => api.get('/platform/societies', { ...p, sort: '-createdAt' }), { status, q });
  const columns = [
    { key: 'name', header: 'Society', render: (s) => <div><p className="font-semibold text-gray-700">{s.name}</p><p className="text-[11px] text-gray-400">{[s.area, s.city, s.state].filter(Boolean).join(', ')}</p></div> },
    { key: 'code', header: 'Code', render: (s) => <span className="font-mono text-[11px] font-semibold text-brand">{s.code}</span> },
    { key: 'res', header: 'Residents', align: 'right', render: (s) => formatNumber(s.residentCount) },
    { key: 'staff', header: 'Staff', align: 'right', render: (s) => formatNumber(s.staffCount) },
    { key: 'online', header: 'Online pay', render: (s) => <Badge tone={s.payments?.onlineEnabled ? 'success' : 'neutral'}>{s.payments?.onlineEnabled ? 'Enabled' : 'Off'}</Badge> },
    { key: 'created', header: 'Joined', render: (s) => formatDate(s.createdAt) },
    { key: 'status', header: 'Status', render: (s) => <Badge status={s.status} /> },
  ];
  return (
    <div>
      <PageHeader title="Societies" subtitle="Every society on adda" actions={<Button icon="fa-regular fa-file-lines" onClick={() => navigate('/admin/applications')}>Applications</Button>} />
      <Tabs className="mb-4" tabs={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} value={status} onChange={setStatus} />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'society', 'societies')}</span>}>
          <SearchInput value={search} onChange={setSearch} placeholder="Name, city or code…" className="w-full sm:w-72" />
        </Toolbar>
        <DataTable testId="societies-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} onRowClick={(s) => navigate(`/admin/societies/${s._id}`)} empty={<EmptyState compact icon="fa-regular fa-building" title={q || status ? 'No societies match' : 'No societies yet'} message={q || status ? undefined : 'Approve a society application to create the first one.'} />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
    </div>
  );
}
