import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAction, usePaged } from '../../lib/hooks.js';
import { formatDate, formatDateTime, formatPhone, formatRelative, humanize, istDateTimeISO } from '../../lib/format.js';
import { Badge, Button, cx, EmptyState, PageHeader, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination } from '../../components/DataTable.jsx';
import { Field, Input, Textarea } from '../../components/Form.jsx';
import { Modal } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useCounts } from '../../layout/Portals.jsx';

/** Server rule (SERVICE_REQUEST_TRANSITIONS). */
export const SERVICE_TRANSITIONS = {
  requested: ['accepted', 'rejected', 'cancelled'],
  accepted: ['scheduled', 'completed', 'cancelled'],
  scheduled: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
};
const ACTION_LABEL = { accepted: 'Accept', scheduled: 'Schedule', completed: 'Complete', rejected: 'Reject', cancelled: 'Cancel' };

function UpdateModal({ open, onClose, item, onDone }) {
  const toast = useToast();
  const options = SERVICE_TRANSITIONS[item?.status] || [];
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open && item) {
      setV({ status: options[0] || '', note: '', assigneeName: item.assigneeName || '', date: item.preferredDate || '', time: '10:00' });
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);
  const [save, busy] = useAction(
    () =>
      api.post(`/society/service-requests/${item._id}/status`, {
        status: v.status,
        note: v.note.trim() || undefined,
        assigneeName: v.assigneeName.trim() || undefined,
        scheduledFor: v.status === 'scheduled' ? istDateTimeISO(v.date, v.time) : undefined,
      }),
    { toast, success: `Request ${humanize(v.status)}`, onDone: () => (onDone(), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = {};
    if (v.status === 'scheduled' && !v.date) errs.date = 'Pick the visit date';
    if (['rejected', 'cancelled'].includes(v.status) && v.note.trim().length < 3) errs.note = 'Tell the resident why';
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Update service request" subtitle={item ? `${item.category?.name} · ${item.user?.name}` : ''} icon="fa-solid fa-toolbox" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} variant={['rejected', 'cancelled'].includes(v.status) ? 'danger' : 'primary'} data-testid="service-submit">{ACTION_LABEL[v.status] || 'Update'}</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="New status">
          {options.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={v.status === s} onClick={() => setV({ ...v, status: s })} className={cx('rounded-full border px-3 py-1.5 text-xs font-semibold', v.status === s ? 'border-azea-purple bg-azea-purple text-white' : 'border-gray-200 text-gray-600 hover:border-azea-purple hover:text-azea-purple')}>
              {ACTION_LABEL[s]}
            </button>
          ))}
        </div>
        {['accepted', 'scheduled'].includes(v.status) && (
          <Field label="Assigned to">
            <Input name="assigneeName" value={v.assigneeName || ''} maxLength={120} onChange={(e) => setV({ ...v, assigneeName: e.target.value })} placeholder="e.g. Suresh (electrician)" />
          </Field>
        )}
        {v.status === 'scheduled' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Visit date" error={errors.date}>
              <Input type="date" name="date" value={v.date || ''} onChange={(e) => (setV({ ...v, date: e.target.value }), setErrors({}))} invalid={Boolean(errors.date)} />
            </Field>
            <Field label="Time (IST)">
              <Input type="time" name="time" value={v.time || ''} onChange={(e) => setV({ ...v, time: e.target.value })} />
            </Field>
          </div>
        )}
        <Field label={['rejected', 'cancelled'].includes(v.status) ? 'Reason' : 'Note to the resident (optional)'} error={errors.note}>
          <Textarea name="note" rows={3} maxLength={500} value={v.note || ''} onChange={(e) => (setV({ ...v, note: e.target.value }), setErrors({}))} invalid={Boolean(errors.note)} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Services() {
  const { refreshCounts } = useCounts();
  const [status, setStatus] = useState('');
  const list = usePaged((p) => api.get('/society/service-requests', { ...p, sort: '-createdAt' }), { status });
  const [item, setItem] = useState(null);
  const columns = [
    { key: 'cat', header: 'Service', render: (r) => <span className="font-semibold text-gray-700">{r.category?.name || '—'}</span> },
    { key: 'desc', header: 'Request', className: 'min-w-[220px] max-w-[280px] whitespace-normal', render: (r) => <span className="line-clamp-2">{r.description}</span> },
    { key: 'who', header: 'Resident', render: (r) => <div><p className="font-medium text-gray-700">{r.user?.name || '—'}</p><p className="text-[11px] text-gray-400">{[r.flat?.number, formatPhone(r.user?.phone)].filter((x) => x && x !== '—').join(' · ')}</p></div> },
    { key: 'pref', header: 'Preferred', render: (r) => (r.preferredDate ? `${formatDate(r.preferredDate)}${r.preferredTime ? ` · ${r.preferredTime}` : ''}` : '—') },
    { key: 'sched', header: 'Scheduled', render: (r) => (r.scheduledFor ? formatDateTime(r.scheduledFor) : '—') },
    { key: 'assignee', header: 'Assigned', render: (r) => r.assigneeName || '—' },
    { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
    { key: 'created', header: 'Requested', render: (r) => formatRelative(r.createdAt) },
    { key: 'actions', header: '', align: 'right', render: (r) => (SERVICE_TRANSITIONS[r.status]?.length ? <Button size="xs" variant="outline" icon="fa-solid fa-arrows-rotate" onClick={() => setItem(r)}>Update</Button> : null) },
  ];
  return (
    <div>
      <PageHeader title="Service requests" subtitle="Electrician, plumber, cleaning and other requests raised by residents" actions={<Button variant="outline" icon="fa-solid fa-rotate-right" onClick={list.reload} loading={list.reloading}>Refresh</Button>} />
      <Tabs className="mb-4" tabs={['', 'requested', 'accepted', 'scheduled', 'completed', 'rejected', 'cancelled'].map((s) => ({ value: s, label: s ? humanize(s) : 'All' }))} value={status} onChange={setStatus} />
      <div className="card">
        <DataTable testId="services-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} empty={<EmptyState compact icon="fa-solid fa-toolbox" title={status ? `No ${humanize(status).toLowerCase()} requests` : 'No service requests yet'} message="Residents request services from the adda app." />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
      <UpdateModal open={Boolean(item)} item={item} onClose={() => setItem(null)} onDone={() => (list.reload(), refreshCounts())} />
    </div>
  );
}
