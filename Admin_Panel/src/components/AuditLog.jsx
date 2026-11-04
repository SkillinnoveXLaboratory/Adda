import { useState } from 'react';
import { api } from '../lib/api.js';
import { usePaged, useQuery } from '../lib/hooks.js';
import { formatDateTime, formatRelative, humanize, plural } from '../lib/format.js';
import { Badge, EmptyState, PageHeader } from './ui.jsx';
import { DataTable, Pagination, Toolbar } from './DataTable.jsx';
import { Select } from './Form.jsx';

const SOCIETY_ACTIONS = ['membership', 'invoice', 'payment', 'expense', 'ledger', 'income', 'charge', 'complaint', 'announcement', 'staff', 'building', 'flat', 'facility', 'booking', 'post', 'poll', 'listing', 'society', 'report', 'auth'];
const PLATFORM_ACTIONS = ['registration', 'society', 'platform', 'user', 'staff', 'auth', 'invoice', 'payment', 'membership'];

/** Read-only, tamper-evident audit trail (society or platform). Filters by action prefix. */
export function AuditLog({ platform = false }) {
  const [action, setAction] = useState('');
  const [societyId, setSocietyId] = useState('');
  const societies = useQuery(() => (platform ? api.get('/platform/societies', { limit: 100, sort: 'name' }) : Promise.resolve(null)), []);
  const list = usePaged((p) => api.get(platform ? '/platform/audit-logs' : '/society/audit-logs', { ...p, sort: '-createdAt' }), { action, societyId: platform ? societyId : undefined }, 25);
  const columns = [
    { key: 'when', header: 'When', render: (a) => <span title={formatDateTime(a.createdAt)}>{formatRelative(a.createdAt)}</span> },
    { key: 'actor', header: 'Who', render: (a) => (a.actor ? <div><p className="font-medium text-gray-700">{a.actor.name || a.actor.email}</p>{a.actor.name && <p className="text-[11px] text-gray-400">{a.actor.email}</p>}</div> : <span className="text-gray-400">System</span>) },
    ...(platform ? [{ key: 'society', header: 'Society', render: (a) => a.society?.name || <span className="text-gray-300">—</span> }] : []),
    { key: 'action', header: 'Action', render: (a) => <code className="rounded bg-brand-light px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand">{a.action}</code> },
    { key: 'target', header: 'Target', render: (a) => (a.targetType ? humanize(a.targetType) : '—') },
    { key: 'summary', header: 'Details', className: 'max-w-[360px] truncate', render: (a) => <span title={a.summary}>{a.summary || '—'}</span> },
    { key: 'role', header: 'Role', render: (a) => (a.actorRole ? <Badge tone="neutral">{humanize(a.actorRole.replace(/^society_/, ''))}</Badge> : '—') },
  ];
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every sign-in, approval and money movement — entries can’t be edited or deleted" />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'entry', 'entries')}</span>}>
          <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action" className="sm:w-48">
            <option value="">All actions</option>
            {(platform ? PLATFORM_ACTIONS : SOCIETY_ACTIONS).map((a) => (
              <option key={a} value={a}>
                {humanize(a)}
              </option>
            ))}
          </Select>
          {platform && (
            <Select value={societyId} onChange={(e) => setSocietyId(e.target.value)} aria-label="Society" className="sm:w-56">
              <option value="">All societies</option>
              {(societies.data?.items || []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Toolbar>
        <DataTable testId="audit-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} empty={<EmptyState compact icon="fa-solid fa-clock-rotate-left" title="No audit entries" message={action ? 'Nothing recorded for this action yet.' : undefined} />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
    </div>
  );
}
