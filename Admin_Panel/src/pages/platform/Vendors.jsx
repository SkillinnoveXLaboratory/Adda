import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { adminRoleLabel } from '../../lib/vendorOnboarding.js';
import { formatPercent } from '../../lib/pricing.js';
import { useDebounced, usePaged } from '../../lib/hooks.js';
import { formatDate, formatRelative, plural } from '../../lib/format.js';
import { Avatar, Badge, Button, EmptyState, PageHeader, Tabs } from '../../components/ui.jsx';
import { ShopLogo } from '../../components/ShopLogo.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { SearchInput } from '../../components/Form.jsx';
import { KycBadge } from '../../components/KycBadge.jsx';
import { useCounts } from '../../layout/Portals.jsx';

const EMPTY = {
  pending: ['No KYC waiting for review', 'When a vendor submits PAN, Aadhaar and bank details they appear here.'],
  approved: ['No approved vendors yet', undefined],
  rejected: ['No rejected KYC', undefined],
  not_submitted: ['Every vendor has submitted KYC', undefined],
  '': ['No vendors yet', 'Vendors sign up in the app, or you can add one here with “Add vendor”.'],
};

/** Vendor accounts (list properties / services) and their KYC review queue. GET /platform/vendors */
export default function Vendors() {
  const navigate = useNavigate();
  const { counts } = useCounts();
  const { canManage } = useAuth();
  const manage = canManage('vendors');
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
    {
      key: 'shop',
      header: 'Shop / business',
      render: (v) => (
        <div className="flex items-center gap-2.5">
          <ShopLogo url={v.shopLogoUrl} />
          <div className="min-w-0 max-w-[200px]">
            <p className="truncate font-semibold text-gray-700">{v.shopName || v.businessName || <span className="font-normal text-gray-300">No shop name</span>}</p>
            {v.shopName && v.businessName && v.businessName !== v.shopName && <p className="truncate text-[11px] text-gray-400">{v.businessName}</p>}
          </div>
        </div>
      ),
    },
    { key: 'city', header: 'City', render: (v) => v.city || <span className="text-gray-300">—</span> },
    { key: 'phone', header: 'Mobile', render: (v) => <span className="font-mono">{v.phone || '—'}</span> },
    { key: 'kyc', header: 'KYC', render: (v) => <KycBadge status={v.kycStatus} /> },
    {
      key: 'rates',
      header: 'Rates',
      render: (v) => (
        <div className="whitespace-nowrap" title="NIVASA commission (taken from the vendor's price) · member discount (share of the commission)">
          <p className="font-semibold text-gray-700">{formatPercent(v.pricing?.commissionPercent)} commission</p>
          <p className="text-[11px] text-gray-400">{v.pricing?.memberDiscountPercent ? `${formatPercent(v.pricing.memberDiscountPercent)} back to members` : 'No member discount'}</p>
        </div>
      ),
    },
    { key: 'submitted', header: 'Submitted', render: (v) => (v.submittedAt ? <span title={formatDate(v.submittedAt)}>{formatRelative(v.submittedAt)}</span> : <span className="text-gray-300">—</span>) },
    {
      key: 'addedBy',
      header: 'Added by',
      render: (v) =>
        v.addedBy ? (
          <div className="max-w-[150px]" title={`Added by ${v.addedBy.name || 'an admin'} (${adminRoleLabel(v.addedBy.role)})`} data-testid="vendor-added-by">
            <p className="truncate text-xs font-medium text-gray-700">{v.addedBy.name || 'Admin'}</p>
            <Badge tone={v.addedBy.role === 'sub_admin' ? 'info' : 'purple'}>{adminRoleLabel(v.addedBy.role)}</Badge>
          </div>
        ) : (
          <span className="text-[11px] text-gray-400">Self sign-up</span>
        ),
    },
    { key: 'joined', header: 'Joined', render: (v) => formatDate(v.createdAt) },
  ];
  const [emptyTitle, emptyMessage] = q ? ['No vendors match', 'Try a different name, business or mobile number.'] : EMPTY[kycStatus];
  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle="Businesses and individuals who list properties and services. Only vendors with approved KYC can post listings or run ads."
        actions={
          manage && (
            <Button icon="fa-solid fa-user-plus" onClick={() => navigate('/admin/vendors/new')} data-testid="vendor-add">
              Add vendor
            </Button>
          )
        }
      />
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
