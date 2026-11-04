import { useState } from 'react';
import { api } from '../../lib/api.js';
import { usePaged, useQuery } from '../../lib/hooks.js';
import { formatDate, formatINR, humanize, plural } from '../../lib/format.js';
import { PAYMENT_METHODS } from '../../lib/finance.js';
import { Alert, Badge, EmptyState, PageHeader } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Select } from '../../components/Form.jsx';

export default function PlatformPayments() {
  const [status, setStatus] = useState('');
  const [societyId, setSocietyId] = useState('');
  const config = useQuery(() => api.get('/public/config', undefined, { auth: false }), []);
  const societies = useQuery(() => api.get('/platform/societies', { limit: 100, sort: 'name' }), []);
  const list = usePaged((p) => api.get('/platform/payments', { ...p, sort: '-createdAt' }), { status, societyId });
  const columns = [
    { key: 'date', header: 'Date', render: (p) => formatDate(p.paidOn || p.createdAt) },
    { key: 'society', header: 'Society', render: (p) => <span className="font-semibold text-gray-700">{p.society?.name || '—'}</span> },
    { key: 'invoice', header: 'Invoice', render: (p) => p.invoice?.invoiceNumber || '—' },
    { key: 'channel', header: 'Channel', render: (p) => <Badge tone={p.channel === 'online' ? 'purple' : 'info'}>{humanize(p.channel)}</Badge> },
    { key: 'method', header: 'Method', render: (p) => PAYMENT_METHODS[p.method] || humanize(p.method) },
    { key: 'ref', header: 'Gateway / ref', render: (p) => <span className="font-mono text-[11px]">{p.providerPaymentId || p.providerOrderId || p.referenceNumber || '—'}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => <span className="font-semibold text-gray-800">{formatINR(p.amountPaise)}</span> },
    { key: 'status', header: 'Status', render: (p) => <Badge status={p.status} /> },
  ];
  const gw = config.data?.payments;
  return (
    <div>
      <PageHeader title="Payments monitor" subtitle="Every maintenance payment across societies" />
      {gw && (
        <Alert tone={gw.gatewayConfigured ? 'success' : 'warning'} className="mb-4" icon="fa-solid fa-credit-card" title={gw.gatewayConfigured ? `Payment gateway configured (${gw.provider})` : 'Payment gateway not configured'}>
          {gw.gatewayConfigured ? 'Online collection works for societies whose settlement you have verified.' : 'No gateway keys are set on the server, so online payments are unavailable everywhere. Societies record payments offline.'}
        </Alert>
      )}
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'payment', 'payments')}</span>}>
          <Select value={societyId} onChange={(e) => setSocietyId(e.target.value)} aria-label="Society" className="sm:w-56">
            <option value="">All societies</option>
            {(societies.data?.items || []).map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="sm:w-44">
            <option value="">All statuses</option>
            {['created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded', 'reversed'].map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </Toolbar>
        <DataTable testId="platform-payments-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} empty={<EmptyState compact icon="fa-solid fa-indian-rupee-sign" title="No payments found" />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
    </div>
  );
}
