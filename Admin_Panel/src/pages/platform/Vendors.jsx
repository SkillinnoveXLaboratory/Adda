import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../lib/api.js';
import { useDebounced, usePaged } from '../../lib/hooks.js';
import { formatDate, formatRelative, plural } from '../../lib/format.js';
import { Avatar, EmptyState, PageHeader, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { SearchInput } from '../../components/Form.jsx';
import { KycBadge } from '../../components/KycBadge.jsx';
import { useCounts } from '../../layout/Portals.jsx';

const EMPTY = {
  pending: ['No KYC waiting for review', 'When a vendor submits PAN, Aadhaar and bank details they appear here.'],
  approved: ['No approved vendors yet', undefined],
  rejected: ['No rejected KYC', undefined],
  not_submitted: ['Every vendor has submitted KYC', undefined],
  '': ['No vendors yet', 'Vendor accounts are created from the app (sign up as a vendor).'],
};

/** Vendor accounts (list properties / services) and their KYC review queue. GET /platform/vendors */
export default function Vendors() {
  const navigate = useNavigate();
  const { counts } = useCounts();
  const [kycStatus, setKycStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const list = usePaged((p) => api.get('/platform/vendors', { ...p, kycStatus: kycStatus || undefined, sort: kycStatus === 'pending' ? 'submittedAt' : '-submittedAt' }), { kycStatus, q });
  const columns = [
    {
      key: 'name',
      header: 'Vendor',
      render: (v) => (
        <div className="flex items-center gap-3">
          <Avatar name={v.name} size="sm" />
          <div className="min-w-0">
            <Link to={`/admin/vendors/${v._id}`} className="link block max-w-[200px] truncate" onClick={(e) => e.stopPropagation()}>
              {v.name || 'Unnamed'}
            </Link>
            {v.status && v.status !== 'active' && <p className="text-[10px] font-semibold text-rose-500">Account {v.status.replace('_', ' ')}</p>}
          </div>
        </div>
      ),
    },
    { key: 'business', header: 'Business', render: (v) => <span className="block max-w-[220px] truncate">{v.businessName || <span className="text-gray-300">—</span>}</span> },
    { key: 'city', header: 'City', render: (v) => v.city || <span className="text-gray-300">—</span> },
    { key: 'phone', header: 'Mobile', render: (v) => <span className="font-mono">{v.phone || '—'}</span> },
    { key: 'kyc', header: 'KYC', render: (v) => <KycBadge status={v.kycStatus} /> },
    { key: 'submitted', header: 'Submitted', render: (v) => (v.submittedAt ? <span title={formatDate(v.submittedAt)}>{formatRelative(v.submittedAt)}</span> : <span className="text-gray-300">—</span>) },
    { key: 'joined', header: 'Joined', render: (v) => formatDate(v.createdAt) },
  ];
  const [emptyTitle, emptyMessage] = q ? ['No vendors match', 'Try a different name, business or mobile number.'] : EMPTY[kycStatus];
  return (
    <div>
      <PageHeader title="Vendors" subtitle="Businesses and individuals who list properties and services. Only vendors with approved KYC can post listings or run ads." />
      <Tabs
        className="mb-4"
        tabs={[
          { value: 'pending', label: 'Pending review', count: counts.pendingKyc || undefined },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'not_submitted', label: 'Not submitted' },
          { value: '', label: 'All' },
        ]}
        value={kycStatus}
        onChange={setKycStatus}
      />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'vendor', 'vendors')}</span>}>
          <SearchInput value={search} onChange={setSearch} placeholder="Name, business or mobile…" className="w-full sm:w-72" />
        </Toolbar>
        <DataTable testId="vendors-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} onRowClick={(v) => navigate(`/admin/vendors/${v._id}`)} empty={<EmptyState compact icon="fa-solid fa-id-card" title={emptyTitle} message={emptyMessage} />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
    </div>
  );
}
