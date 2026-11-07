import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, mediaHref } from '../../lib/api.js';
import { useAction, useDebounced, usePaged, useQuery } from '../../lib/hooks.js';
import { formatDateTime, formatPhone, formatRelative, humanize, plural } from '../../lib/format.js';
import { isIndianMobile, normalizePhone } from '../../lib/validation.js';
import { Alert, Badge, Button, cx, EmptyState, ErrorState, Icon, KeyValue, PageHeader, Skeleton, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Field, Input, SearchInput, Select, Textarea } from '../../components/Form.jsx';
import { Drawer, Modal } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useCounts } from '../../layout/Portals.jsx';

/** Server rule (COMPLAINT_TRANSITIONS). Only these moves are offered. */
export const COMPLAINT_TRANSITIONS = {
  pending: ['assigned', 'in_progress', 'rejected'],
  assigned: ['in_progress', 'resolved', 'rejected'],
  in_progress: ['resolved', 'assigned'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  rejected: [],
};
const STATUS_TABS = ['', 'pending', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected'];
const PRIORITY_TONE = { low: 'neutral', normal: 'info', high: 'warning', urgent: 'danger' };

function AssignModal({ open, onClose, complaint, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({ assigneeType: 'staff', assigneeName: '', assigneePhone: '', note: '' });
      setErrors({});
    }
  }, [open]);
  const [save, busy] = useAction(
    () => api.post(`/society/complaints/${complaint._id}/assign`, { assigneeType: v.assigneeType, assigneeName: v.assigneeName.trim(), assigneePhone: v.assigneePhone ? normalizePhone(v.assigneePhone) : undefined, note: v.note.trim() || undefined }),
    { toast, success: 'Complaint assigned', onDone: () => (onDone(), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = {};
    if (v.assigneeName.trim().length < 2) errs.assigneeName = 'Enter who is handling it';
    if (v.assigneePhone && !isIndianMobile(v.assigneePhone)) errs.assigneePhone = 'Enter a valid 10-digit mobile';
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  return (
    <Modal open={open} onClose={onClose} busy={busy} title={`Assign ${complaint?.ticketNumber || ''}`} icon="fa-solid fa-user-gear" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} data-testid="assign-submit">Assign</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {[
            ['staff', 'Society staff', 'fa-solid fa-user-tie'],
            ['vendor', 'External vendor', 'fa-solid fa-truck'],
          ].map(([val, label, icon]) => (
            <button key={val} type="button" onClick={() => setV({ ...v, assigneeType: val })} className={cx('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold', v.assigneeType === val ? 'border-brand bg-brand-light/60 text-brand' : 'border-gray-100 text-gray-600 hover:border-gray-200')}>
              <Icon name={icon} /> {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.assigneeName}>
            <Input name="assigneeName" value={v.assigneeName || ''} onChange={(e) => setV({ ...v, assigneeName: e.target.value })} invalid={Boolean(errors.assigneeName)} placeholder={v.assigneeType === 'vendor' ? 'e.g. Ramesh Plumbing' : 'e.g. Suresh (maintenance)'} />
          </Field>
          <Field label="Mobile" error={errors.assigneePhone}>
            <Input name="assigneePhone" prefix="+91" inputMode="tel" value={v.assigneePhone || ''} onChange={(e) => setV({ ...v, assigneePhone: e.target.value })} invalid={Boolean(errors.assigneePhone)} maxLength={14} />
          </Field>
        </div>
        <Field label="Note for the resident (optional)">
          <Textarea name="note" rows={2} maxLength={1000} value={v.note || ''} onChange={(e) => setV({ ...v, note: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}

function StatusModal({ open, onClose, complaint, onDone }) {
  const toast = useToast();
  const options = COMPLAINT_TRANSITIONS[complaint?.status] || [];
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setStatus(options[0] || '');
      setNote('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const [save, busy] = useAction(() => api.post(`/society/complaints/${complaint._id}/status`, { status, note: note.trim() || undefined }), { toast, success: `Status changed to ${humanize(status)}`, onDone: () => (onDone(), onClose()) });
  const submit = (e) => {
    e?.preventDefault();
    if (status === 'rejected' && note.trim().length < 2) return setError('Explain why the complaint is rejected');
    save();
  };
  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Update status" subtitle={`Currently ${humanize(complaint?.status)}`} icon="fa-solid fa-arrows-rotate" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} data-testid="status-submit">Update</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="New status">
          {options.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => (setStatus(s), setError(null))} className={cx('rounded-full border px-3 py-1.5 text-xs font-semibold', status === s ? 'border-brand bg-brand text-white' : 'border-gray-200 text-gray-600 hover:border-brand hover:text-brand')}>
              {humanize(s)}
            </button>
          ))}
        </div>
        <Field label={status === 'rejected' ? 'Reason (required)' : 'Note to the resident (optional)'} error={error}>
          <Textarea name="note" rows={3} maxLength={2000} value={note} onChange={(e) => (setNote(e.target.value), setError(null))} invalid={Boolean(error)} />
        </Field>
      </form>
    </Modal>
  );
}

function ComplaintDrawer({ id, onClose, onChanged }) {
  const toast = useToast();
  const q = useQuery(() => (id ? api.get(`/society/complaints/${id}`) : Promise.resolve(null)), [id]);
  const [modal, setModal] = useState(null);
  const [remark, setRemark] = useState('');
  const [remarkError, setRemarkError] = useState(null);
  const c = q.data;
  const refresh = () => (q.reload(), onChanged());
  const [addRemark, adding] = useAction(() => api.post(`/society/complaints/${id}/remarks`, { note: remark.trim() }), { toast, success: 'Remark added', onDone: () => (setRemark(''), refresh()) });
  const closed = c && ['closed', 'rejected'].includes(c.status);
  const current = c?.assignments?.find((a) => a.active) || c?.assignments?.[0];
  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      title={c ? `${c.ticketNumber} · ${c.title}` : 'Complaint'}
      subtitle={c ? `Raised ${formatDateTime(c.createdAt)}` : ''}
      width="max-w-2xl"
      footer={
        c && (
          <>
            <Button variant="outline" icon="fa-solid fa-user-gear" disabledReason={closed ? 'This complaint is closed' : null} onClick={() => setModal('assign')} data-testid="open-assign">
              {current ? 'Reassign' : 'Assign'}
            </Button>
            <Button icon="fa-solid fa-arrows-rotate" disabledReason={!COMPLAINT_TRANSITIONS[c.status]?.length ? `No further status changes from ${humanize(c.status)}` : null} onClick={() => setModal('status')} data-testid="open-status">
              Change status
            </Button>
          </>
        )
      }
    >
      {q.loading && !c ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : q.error && !c ? (
        <ErrorState error={q.error} onRetry={q.reload} compact />
      ) : c ? (
        <div className="space-y-6" data-testid="complaint-detail">
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={c.status} />
            <Badge tone={PRIORITY_TONE[c.priority]}>{humanize(c.priority)} priority</Badge>
            {c.category?.name && <Badge tone="purple">{c.category.name}</Badge>}
          </div>
          <KeyValue
            items={[
              ['Raised by', c.raisedBy?.name],
              ['Mobile', formatPhone(c.raisedBy?.phone)],
              ['Flat', [c.flat?.building?.name, c.flat?.number].filter(Boolean).join(' · ')],
              ['Assigned to', current ? `${current.assigneeName} (${humanize(current.assigneeType)})${current.assigneePhone ? ` · ${formatPhone(current.assigneePhone)}` : ''}` : 'Not assigned'],
            ]}
          />
          <div>
            <p className="form-label">Description</p>
            <p className="whitespace-pre-wrap rounded-xl bg-brand-bg p-4 text-xs leading-relaxed text-gray-700">{c.description}</p>
          </div>
          {c.media?.length > 0 && (
            <div>
              <p className="form-label">Attachments</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {c.media.map((m) => (
                  <a key={m._id} href={mediaHref(m.url)} target="_blank" rel="noopener noreferrer" className="group relative block aspect-square overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                    {m.mimeType?.startsWith('image/') ? <img src={mediaHref(m.url)} alt={m.originalName || 'Attachment'} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" /> : <span className="flex h-full flex-col items-center justify-center gap-1 text-rose-400"><Icon name="fa-regular fa-file-pdf" className="text-2xl" /><span className="px-2 text-center text-[10px] text-gray-500">{m.originalName}</span></span>}
                  </a>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="form-label">Timeline</p>
            <ol className="relative space-y-4 border-l-2 border-gray-100 pl-5">
              {[...(c.timeline || [])].reverse().map((t, i) => (
                <li key={t._id || i} className="relative">
                  <span className={cx('absolute -left-[27px] top-0.5 h-3 w-3 rounded-full ring-4 ring-white', i === 0 ? 'bg-brand' : 'bg-gray-300')} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge status={t.status} />
                    <span className="text-[11px] text-gray-400">
                      {formatDateTime(t.at || t.createdAt)} · {t.by?.name || (t.byRole === 'resident' ? 'Resident' : 'Staff')}
                    </span>
                  </div>
                  {t.note && <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-600">{t.note}</p>}
                </li>
              ))}
            </ol>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (remark.trim().length < 2) return setRemarkError('Write a remark first');
              addRemark();
            }}
            className="rounded-xl border border-gray-100 p-4"
          >
            <Field label="Add a remark (visible to the resident)" error={remarkError}>
              <Textarea name="remark" rows={2} maxLength={2000} value={remark} onChange={(e) => (setRemark(e.target.value), setRemarkError(null))} invalid={Boolean(remarkError)} placeholder="e.g. Plumber will visit tomorrow at 11 am" />
            </Field>
            <div className="mt-2 flex justify-end">
              <Button type="submit" size="xs" icon="fa-regular fa-comment" loading={adding}>
                Add remark
              </Button>
            </div>
          </form>
        </div>
      ) : null}
      <AssignModal open={modal === 'assign'} complaint={c} onClose={() => setModal(null)} onDone={refresh} />
      <StatusModal open={modal === 'status'} complaint={c} onClose={() => setModal(null)} onDone={refresh} />
    </Drawer>
  );
}

export default function Complaints() {
  const { refreshCounts } = useCounts();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const cats = useQuery(() => api.get('/society/categories', { kind: 'complaint' }), []);
  const list = usePaged((p) => api.get('/society/complaints', { ...p, sort: '-createdAt' }), { status, priority, categoryId, q });
  const openId = params.get('open');

  const columns = [
    { key: 'ticket', header: 'Ticket', render: (c) => <span className="font-mono text-[11px] font-semibold text-brand">{c.ticketNumber}</span> },
    { key: 'title', header: 'Complaint', className: 'max-w-[260px]', render: (c) => <div className="min-w-0"><p className="truncate font-semibold text-gray-700">{c.title}</p><p className="truncate text-[11px] text-gray-400">{c.category?.name}</p></div> },
    { key: 'flat', header: 'Flat', render: (c) => c.flat?.number || '—' },
    { key: 'by', header: 'Raised by', render: (c) => c.raisedBy?.name || '—' },
    { key: 'priority', header: 'Priority', render: (c) => <Badge tone={PRIORITY_TONE[c.priority]}>{humanize(c.priority)}</Badge> },
    { key: 'status', header: 'Status', render: (c) => <Badge status={c.status} /> },
    { key: 'assignee', header: 'Assigned to', render: (c) => c.currentAssignment?.assigneeName || <span className="text-gray-300">—</span> },
    { key: 'created', header: 'Raised', render: (c) => <span title={formatDateTime(c.createdAt)}>{formatRelative(c.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Complaints" subtitle="Track, assign and resolve resident complaints" actions={<Button variant="outline" icon="fa-solid fa-rotate-right" onClick={list.reload} loading={list.reloading}>Refresh</Button>} />
      <Tabs className="mb-4" tabs={STATUS_TABS.map((s) => ({ value: s, label: s ? humanize(s) : 'All' }))} value={status} onChange={setStatus} />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'complaint', 'complaints')}</span>}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search title or ticket…" className="w-full sm:w-64" />
          <Select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority" className="sm:w-40">
            <option value="">All priorities</option>
            {['urgent', 'high', 'normal', 'low'].map((p) => (
              <option key={p} value={p}>
                {humanize(p)}
              </option>
            ))}
          </Select>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" className="sm:w-48">
            <option value="">All categories</option>
            {(cats.data?.items || []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Toolbar>
        <DataTable testId="complaints-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} onRowClick={(c) => setParams({ open: c._id })} empty={<EmptyState compact icon="fa-regular fa-face-smile" title={status || priority || categoryId || q ? 'No complaints match these filters' : 'No complaints yet'} message="Residents raise complaints from the Nivasa app; they appear here instantly." />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
      {list.error && list.error.status === 403 && <Alert tone="warning" className="mt-4">{list.error.message}</Alert>}
      <ComplaintDrawer id={openId} onClose={() => setParams({})} onChanged={() => (list.reload(), refreshCounts())} />
    </div>
  );
}
