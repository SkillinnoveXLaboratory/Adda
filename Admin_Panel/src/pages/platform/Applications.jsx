import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, mediaHref } from '../../lib/api.js';
import { useAction, useDebounced, usePaged, useQuery } from '../../lib/hooks.js';
import { formatBytes, formatDateTime, formatNumber, formatPhone, formatRelative, plural } from '../../lib/format.js';
import { Alert, Badge, Button, CopyField, EmptyState, ErrorState, Icon, KeyValue, PageHeader, Skeleton, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { SearchInput } from '../../components/Form.jsx';
import { ConfirmDialog, Drawer, Modal, ReasonDialog } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useCounts } from '../../layout/Portals.jsx';

const TABS = [
  { value: '', label: 'Needs review', icon: 'fa-regular fa-clock' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'draft', label: 'Drafts' },
];

function ApprovedModal({ result, onClose }) {
  const navigate = useNavigate();
  return (
    <Modal
      open={Boolean(result)}
      onClose={onClose}
      size="lg"
      title="Society approved"
      icon="fa-solid fa-circle-check"
      footer={
        <>
          <Button variant="secondary" onClick={() => (onClose(), navigate(`/admin/societies/${result.society._id}`))}>
            Open society
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {result && (
        <div className="space-y-4" data-testid="approve-result">
          <div className="rounded-xl bg-grad-green p-5 text-white">
            <p className="text-xs text-white/85">{result.society.name}</p>
            <p className="mt-1 font-mono text-2xl font-bold" data-testid="approved-code">
              {result.society.code}
            </p>
            <p className="mt-1 text-[11px] text-white/85">Society code · admin {result.adminEmail}</p>
          </div>
          {result.setupLink ? (
            <>
              <Alert tone={result.emailed ? 'success' : 'warning'} title={result.emailed ? 'Setup link emailed to the admin' : 'Email is not configured — share the setup link yourself'}>
                The registrant can also activate the admin account from the public status page using their reference code and access key — no link needed.
              </Alert>
              <CopyField label="One-time admin setup link (valid 72 hours)" value={result.setupLink} testId="approve-setup-link" />
            </>
          ) : (
            <Alert tone="info">The representative already had an active adda account, so they can sign in with their existing password.</Alert>
          )}
        </div>
      )}
    </Modal>
  );
}

function ApplicationDrawer({ id, onClose, onChanged }) {
  const toast = useToast();
  const q = useQuery(() => (id ? api.get(`/platform/society-registrations/${id}`) : Promise.resolve(null)), [id]);
  const [modal, setModal] = useState(null);
  const [approved, setApproved] = useState(null);
  const r = q.data;
  const after = () => (q.reload(), onChanged());
  const [review, reviewing] = useAction(() => api.post(`/platform/society-registrations/${id}/review`), { toast, success: 'Marked as under review', onDone: () => (setModal(null), after()) });
  const [approve, approving] = useAction((note) => api.post(`/platform/society-registrations/${id}/approve`, note ? { reason: note } : {}), { toast, success: 'Society approved and created', onDone: (res) => (setModal(null), setApproved(res), after()) });
  const [reject, rejecting] = useAction((reason) => api.post(`/platform/society-registrations/${id}/reject`, { reason }), { toast, success: 'Application rejected', onDone: () => (setModal(null), after()) });
  const pending = r && ['submitted', 'under_review'].includes(r.status);
  return (
    <>
      <Drawer
        open={Boolean(id)}
        onClose={onClose}
        title={r?.societyName || 'Application'}
        subtitle={r ? `${r.referenceCode} · submitted ${formatDateTime(r.submittedAt || r.createdAt)}` : ''}
        width="max-w-2xl"
        footer={
          pending && (
            <>
              {r.status === 'submitted' && (
                <Button variant="outline" icon="fa-regular fa-eye" onClick={() => setModal('review')} data-testid="app-review">
                  Mark under review
                </Button>
              )}
              <Button variant="danger-outline" icon="fa-solid fa-xmark" onClick={() => setModal('reject')} data-testid="app-reject">
                Reject
              </Button>
              <Button variant="success" icon="fa-solid fa-check" onClick={() => setModal('approve')} data-testid="app-approve">
                Approve
              </Button>
            </>
          )
        }
      >
        {q.loading && !r ? (
          <div className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </div>
        ) : q.error && !r ? (
          <ErrorState error={q.error} onRetry={q.reload} compact />
        ) : r ? (
          <div className="space-y-6" data-testid="application-detail">
            <div className="flex flex-wrap items-center gap-2">
              <Badge status={r.status} />
              {r.reviewedBy?.name && <span className="text-[11px] text-gray-400">Reviewer: {r.reviewedBy.name}</span>}
            </div>
            {r.status === 'rejected' && r.decisionReason && <Alert tone="danger" title="Rejection reason">{r.decisionReason}</Alert>}
            <section>
              <p className="card-title mb-3">Society</p>
              <KeyValue
                items={[
                  ['Name', r.societyName],
                  ['Units', r.totalUnits ? formatNumber(r.totalUnits) : '—'],
                  ['Phone', formatPhone(r.phone)],
                  ['Email', r.email],
                  ['Address', [r.addressLine, r.area].filter(Boolean).join(', ')],
                  ['City / State', `${r.city}, ${r.state} – ${r.pincode}`],
                ]}
              />
            </section>
            <section>
              <p className="card-title mb-3">Representative (first admin)</p>
              <KeyValue
                items={[
                  ['Name', r.representative?.name],
                  ['Designation', r.representative?.designation || '—'],
                  ['Mobile', formatPhone(r.representative?.phone)],
                  ['Email', r.representative?.email],
                ]}
              />
            </section>
            <section>
              <p className="card-title mb-3">Documents</p>
              {r.documents?.length ? (
                <ul className="space-y-2">
                  {r.documents.map((d) => (
                    <li key={d._id}>
                      <a href={mediaHref(d.url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-gray-100 px-4 py-3 hover:border-brand/40 hover:bg-brand-light/30">
                        <Icon name={d.mimeType === 'application/pdf' ? 'fa-regular fa-file-pdf text-rose-400' : 'fa-regular fa-file-image text-brand'} className="text-lg" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">{d.originalName || 'Document'}</span>
                        <span className="text-[11px] text-gray-400">{formatBytes(d.size)}</span>
                        <Icon name="fa-solid fa-arrow-up-right-from-square" className="text-[10px] text-gray-400" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-brand-bg px-4 py-3 text-xs text-brand-muted">No documents were uploaded.</p>
              )}
            </section>
            {r.status === 'approved' && r.society && (
              <Alert tone="success" title="Approved">
                This application created a society.{' '}
                <Link to={`/admin/societies/${r.society}`} className="font-semibold underline">
                  Open it
                </Link>
              </Alert>
            )}
          </div>
        ) : null}
      </Drawer>
      <ConfirmDialog open={modal === 'review'} onClose={() => setModal(null)} onConfirm={() => review()} busy={reviewing} tone="primary" title="Mark under review" confirmLabel="Mark under review" message="The applicant will see “Under review” on the status page." />
      <ReasonDialog open={modal === 'approve'} onClose={() => setModal(null)} onSubmit={(n) => approve(n)} busy={approving} required={false} tone="primary" label="Internal note" placeholder="Optional — recorded with the decision" title="Approve application" confirmLabel="Approve & create society" message={<>This creates <b>{r?.societyName}</b>, makes <b>{r?.representative?.email}</b> its first admin and issues a society code.</>} />
      <ReasonDialog open={modal === 'reject'} onClose={() => setModal(null)} onSubmit={(reason) => reject(reason)} busy={rejecting} title="Reject application" confirmLabel="Reject" label="Reason (shown to the applicant)" placeholder="e.g. Registration certificate is missing" message="The applicant sees this reason on the status page and can submit a corrected application." />
      <ApprovedModal result={approved} onClose={() => setApproved(null)} />
    </>
  );
}

export default function Applications() {
  const { refreshCounts } = useCounts();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const list = usePaged((p) => api.get('/platform/society-registrations', { ...p, sort: '-createdAt' }), { status, q });
  const columns = [
    { key: 'ref', header: 'Reference', render: (r) => <span className="font-mono text-[11px] font-semibold text-brand">{r.referenceCode}</span> },
    { key: 'name', header: 'Society', render: (r) => <div><p className="font-semibold text-gray-700">{r.societyName}</p><p className="text-[11px] text-gray-400">{[r.city, r.state].filter(Boolean).join(', ')}</p></div> },
    { key: 'rep', header: 'Representative', render: (r) => <div><p className="font-medium text-gray-700">{r.representative?.name}</p><p className="text-[11px] text-gray-400">{r.representative?.email}</p></div> },
    { key: 'units', header: 'Units', align: 'right', render: (r) => (r.totalUnits ? formatNumber(r.totalUnits) : '—') },
    { key: 'docs', header: 'Docs', align: 'center', render: (r) => (r.documents?.length ? <span className="text-xs font-semibold text-gray-700"><Icon name="fa-solid fa-paperclip" className="mr-1 text-gray-400" />{r.documents.length}</span> : <span className="text-gray-300">0</span>) },
    { key: 'when', header: 'Submitted', render: (r) => <span title={formatDateTime(r.submittedAt || r.createdAt)}>{formatRelative(r.submittedAt || r.createdAt)}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
  ];
  return (
    <div>
      <PageHeader title="Society applications" subtitle="Review registrations and onboard new societies" actions={<Button variant="outline" icon="fa-solid fa-rotate-right" onClick={list.reload} loading={list.reloading}>Refresh</Button>} />
      <Tabs className="mb-4" tabs={TABS} value={status} onChange={setStatus} />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'application', 'applications')}</span>}>
          <SearchInput value={search} onChange={setSearch} placeholder="Society, city or reference…" className="w-full sm:w-72" />
        </Toolbar>
        <DataTable testId="applications-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} onRowClick={(r) => setParams({ open: r._id })} empty={<EmptyState compact icon="fa-regular fa-file-lines" title={status === '' ? 'No applications waiting' : 'No applications here'} message={status === '' ? 'New society registrations will appear here for review.' : undefined} />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
      <ApplicationDrawer id={params.get('open')} onClose={() => setParams({})} onChanged={() => (list.reload(), refreshCounts())} />
    </div>
  );
}
