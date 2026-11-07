import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../lib/api.js';
import { usePaged } from '../../lib/hooks.js';
import { formatDateTime, formatRelative, humanize, plural } from '../../lib/format.js';
import { Alert, Badge, EmptyState, PageHeader, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination } from '../../components/DataTable.jsx';

export default function ContentReports() {
  const [status, setStatus] = useState('open');
  const list = usePaged((p) => api.get('/platform/content-reports', { ...p, sort: '-createdAt' }), { status });
  const columns = [
    { key: 'type', header: 'Content', render: (r) => <Badge tone="purple">{humanize(r.targetType)}</Badge> },
    { key: 'reason', header: 'Reason', className: 'max-w-[360px] whitespace-normal', render: (r) => <span className="text-gray-700">{r.reason}</span> },
    { key: 'society', header: 'Society', render: (r) => r.society?.name || <span className="text-gray-400">Independent</span> },
    { key: 'by', header: 'Reported by', render: (r) => r.reporter?.name || '—' },
    { key: 'when', header: 'When', render: (r) => <span title={formatDateTime(r.createdAt)}>{formatRelative(r.createdAt)}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
  ];
  return (
    <div>
      <PageHeader title="Content reports" subtitle="Reports raised by users across Nivasa" />
      <Alert tone="info" className="mb-4">
        Community posts and comments are moderated by each society’s staff. Reported property and marketplace listings can be actioned in{' '}
        <Link to="/admin/listings" className="font-semibold underline">
          Listings moderation
        </Link>{' '}
        (use “Reported only”).
      </Alert>
      <Tabs className="mb-4" tabs={['open', 'actioned', 'dismissed'].map((s) => ({ value: s, label: humanize(s) }))} value={status} onChange={setStatus} />
      <div className="card">
        <DataTable columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} empty={<EmptyState compact icon="fa-regular fa-flag" title={`No ${status} reports`} />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
        {list.data && <p className="sr-only">{plural(list.data.total, 'report', 'reports')}</p>}
      </div>
    </div>
  );
}
