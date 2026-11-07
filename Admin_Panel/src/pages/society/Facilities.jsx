import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../lib/api.js';
import { useAction, usePaged, useQuery } from '../../lib/hooks.js';
import { formatDate, formatINR, formatPhone, formatTime, humanize, paiseToRupeesInput, rupeesToPaise, plural } from '../../lib/format.js';
import { amountRule, intRange, maxLen, minLen, req, runRules } from '../../lib/validation.js';
import { Badge, Button, cx, EmptyState, ErrorState, Icon, PageHeader, Skeleton, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Field, Input, Select, Textarea, Toggle } from '../../components/Form.jsx';
import { ConfirmDialog, Modal, ReasonDialog } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useCounts } from '../../layout/Portals.jsx';

const SLOTS = [30, 60, 90, 120, 180, 240];
// The resident app picks its icon from this hint + the facility name (Adda_App/src/lib/icons.js).
const ICONS = [
  ['', 'Automatic (from the name)'],
  ['club', 'Clubhouse / party hall'],
  ['gym', 'Gym / fitness'],
  ['pool', 'Swimming pool'],
  ['court', 'Sports court'],
  ['meeting', 'Meeting room'],
  ['parking', 'Parking'],
];
/** Same matching rules as the resident app, mapped to Font Awesome for the panel. */
export const facilityFa = (f) => {
  const n = `${f.icon || ''} ${f.name}`.toLowerCase();
  if (/pool|swim/.test(n)) return 'fa-solid fa-person-swimming';
  if (/gym|fitness/.test(n)) return 'fa-solid fa-dumbbell';
  if (/badminton|tennis|court|sport/.test(n)) return 'fa-solid fa-table-tennis-paddle-ball';
  if (/meeting|conference/.test(n)) return 'fa-solid fa-briefcase';
  if (/park|parking|car/.test(n)) return 'fa-solid fa-car';
  if (/hall|party|club|community/.test(n)) return 'fa-solid fa-champagne-glasses';
  return 'fa-regular fa-calendar-check';
};

function FacilityModal({ open, onClose, item, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({
        name: item?.name || '',
        description: item?.description || '',
        icon: item?.icon || '',
        fee: paiseToRupeesInput(item?.feePaise ?? 0),
        capacity: item?.capacity ?? '',
        openTime: item?.openTime || '06:00',
        closeTime: item?.closeTime || '22:00',
        slotMinutes: String(item?.slotMinutes || 60),
        maxAdvanceDays: String(item?.maxAdvanceDays || 30),
        requiresApproval: item ? Boolean(item.requiresApproval) : false,
        rules: item?.rules || '',
        active: item ? item.active !== false : true,
      });
      setErrors({});
    }
  }, [open, item]);
  const [save, busy] = useAction(
    () => {
      // Always the full object: the API resets omitted fields to defaults on PATCH.
      const body = {
        name: v.name.trim(),
        description: v.description.trim() || undefined,
        icon: v.icon || undefined,
        feePaise: rupeesToPaise(v.fee || '0'),
        capacity: v.capacity === '' ? undefined : Number(v.capacity),
        openTime: v.openTime,
        closeTime: v.closeTime,
        slotMinutes: Number(v.slotMinutes),
        maxAdvanceDays: Number(v.maxAdvanceDays),
        requiresApproval: v.requiresApproval,
        rules: v.rules.trim() || undefined,
        active: v.active,
      };
      return item ? api.patch(`/society/facilities/${item._id}`, body) : api.post('/society/facilities', body);
    },
    { toast, success: item ? 'Facility updated' : 'Facility added', onDone: () => (onSaved(), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, {
      name: [req('Enter a name'), minLen(2), maxLen(80)],
      fee: [amountRule('Enter a fee in rupees (0 for free)', { allowZero: true })],
      capacity: [intRange(0, 100000)],
      maxAdvanceDays: [req('Required'), intRange(1, 365, '1–365 days')],
      openTime: [req('Required')],
      closeTime: [req('Required'), [(x, all) => !all.openTime || x > all.openTime, 'Must be after opening time']],
      rules: [maxLen(2000)],
      description: [maxLen(1000)],
    });
    if (!errs.closeTime && v.openTime && v.closeTime) {
      const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      if (mins(v.closeTime) - mins(v.openTime) < Number(v.slotMinutes)) errs.closeTime = 'Opening hours are shorter than one slot';
    }
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} size="lg" title={item ? `Edit ${item.name}` : 'Add facility'} icon="fa-regular fa-calendar-check" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} data-testid="facility-save">{item ? 'Save changes' : 'Add facility'}</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name}>
            <Input name="name" value={v.name || ''} onChange={set('name')} invalid={Boolean(errors.name)} placeholder="e.g. Clubhouse" />
          </Field>
          <Field label="Icon in the resident app">
            <Select name="icon" value={v.icon || ''} onChange={set('icon')}>
              {ICONS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Description" error={errors.description}>
          <Textarea name="description" rows={2} value={v.description || ''} onChange={set('description')} />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Opens" required error={errors.openTime}>
            <Input type="time" name="openTime" value={v.openTime || ''} onChange={set('openTime')} invalid={Boolean(errors.openTime)} />
          </Field>
          <Field label="Closes" required error={errors.closeTime}>
            <Input type="time" name="closeTime" value={v.closeTime || ''} onChange={set('closeTime')} invalid={Boolean(errors.closeTime)} />
          </Field>
          <Field label="Slot length">
            <Select name="slotMinutes" value={v.slotMinutes || '60'} onChange={set('slotMinutes')}>
              {SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s < 60 ? `${s} min` : `${s / 60} h${s % 60 ? ` ${s % 60} min` : ''}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Book ahead (days)" required error={errors.maxAdvanceDays}>
            <Input name="maxAdvanceDays" inputMode="numeric" value={v.maxAdvanceDays ?? ''} onChange={set('maxAdvanceDays')} invalid={Boolean(errors.maxAdvanceDays)} />
          </Field>
          <Field label="Fee per booking" error={errors.fee}>
            <Input name="fee" prefix="₹" inputMode="decimal" value={v.fee ?? ''} onChange={set('fee')} invalid={Boolean(errors.fee)} />
          </Field>
          <Field label="Capacity" error={errors.capacity}>
            <Input name="capacity" inputMode="numeric" value={v.capacity ?? ''} onChange={set('capacity')} invalid={Boolean(errors.capacity)} placeholder="People" />
          </Field>
        </div>
        <Field label="Rules" error={errors.rules}>
          <Textarea name="rules" rows={3} value={v.rules || ''} onChange={set('rules')} placeholder="e.g. No loud music after 10 pm" />
        </Field>
        <Toggle label="Bookings need approval" description="When on, bookings stay pending until a manager approves them." checked={v.requiresApproval} onChange={(x) => setV({ ...v, requiresApproval: x })} />
        <Toggle label="Active" description="Inactive facilities can’t be booked." checked={v.active} onChange={(x) => setV({ ...v, active: x })} />
      </form>
    </Modal>
  );
}

function FacilitiesTab() {
  const q = useQuery(() => api.get('/society/facilities'), []);
  const [modal, setModal] = useState(null);
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button icon="fa-solid fa-plus" onClick={() => setModal({})} data-testid="add-facility">
          Add facility
        </Button>
      </div>
      {q.loading && !q.data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : q.error && !q.data ? (
        <div className="card">
          <ErrorState error={q.error} onRetry={q.reload} />
        </div>
      ) : !q.data.items.length ? (
        <div className="card">
          <EmptyState icon="fa-regular fa-calendar-check" title="No facilities yet" message="Add the clubhouse, gym, courts or other amenities residents can book from the app." action={<Button icon="fa-solid fa-plus" onClick={() => setModal({})}>Add facility</Button>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data.items.map((f) => (
            <article key={f._id} className={cx('card flex flex-col p-5', f.active === false && 'opacity-70')}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand">
                  <Icon name={facilityFa(f)} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-gray-800">{f.name}</h3>
                  <p className="text-[11px] text-gray-400">{f.feePaise ? `${formatINR(f.feePaise)} per booking` : 'Free'}</p>
                </div>
                <Badge status={f.active === false ? 'inactive' : 'active'} />
              </div>
              {f.description && <p className="mt-3 line-clamp-2 text-xs text-gray-600">{f.description}</p>}
              <dl className="mt-4 grid flex-1 grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Hours</dt>
                  <dd className="font-medium text-gray-700">
                    {f.openTime}–{f.closeTime}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Slot</dt>
                  <dd className="font-medium text-gray-700">{f.slotMinutes} min</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Book ahead</dt>
                  <dd className="font-medium text-gray-700">{f.maxAdvanceDays} days</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Approval</dt>
                  <dd className="font-medium text-gray-700">{f.requiresApproval ? 'Required' : 'Instant'}</dd>
                </div>
              </dl>
              <div className="mt-4 flex justify-end border-t border-gray-50 pt-3">
                <Button size="xs" variant="secondary" icon="fa-regular fa-pen-to-square" onClick={() => setModal({ item: f })}>
                  Edit
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <FacilityModal open={Boolean(modal)} item={modal?.item} onClose={() => setModal(null)} onSaved={q.reload} />
    </>
  );
}

function BookingsTab({ refreshCounts }) {
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [facilityId, setFacilityId] = useState('');
  const [date, setDate] = useState('');
  const facilities = useQuery(() => api.get('/society/facilities'), []);
  const list = usePaged((p) => api.get('/society/bookings', p), { status, facilityId, date });
  const [act, setAct] = useState(null);
  const [run, busy] = useAction(
    (reason) => {
      if (act.action === 'cancel') return api.post(`/society/bookings/${act.b._id}/cancel`, { reason });
      return api.post(`/society/bookings/${act.b._id}/decision`, { decision: act.action === 'approve' ? 'confirmed' : 'rejected', reason: reason || undefined });
    },
    { toast, success: () => ({ approve: 'Booking confirmed', reject: 'Booking rejected', cancel: 'Booking cancelled' })[act.action], onDone: () => (setAct(null), list.reload(), refreshCounts()) },
  );
  const columns = [
    { key: 'facility', header: 'Facility', render: (b) => <span className="font-semibold text-gray-700">{b.facility?.name || '—'}</span> },
    { key: 'who', header: 'Resident', render: (b) => <div><p className="font-medium text-gray-700">{b.user?.name || '—'}</p><p className="text-[11px] text-gray-400">{formatPhone(b.user?.phone)}</p></div> },
    { key: 'flat', header: 'Flat', render: (b) => b.membership?.flat?.number || '—' },
    { key: 'when', header: 'Date & time', render: (b) => <div><p className="font-medium text-gray-700">{formatDate(b.date || b.start)}</p><p className="text-[11px] text-gray-400">{formatTime(b.start)} – {formatTime(b.end)}</p></div> },
    { key: 'fee', header: 'Fee', align: 'right', render: (b) => (b.feePaise ? formatINR(b.feePaise) : 'Free') },
    { key: 'purpose', header: 'Purpose', className: 'max-w-[200px] truncate', render: (b) => b.purpose || '—' },
    { key: 'status', header: 'Status', render: (b) => <div><Badge status={b.status} />{b.decisionReason && <p className="mt-0.5 max-w-[180px] truncate text-[10px] text-gray-400" title={b.decisionReason}>{b.decisionReason}</p>}</div> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (b) => (
        <div className="flex justify-end gap-2">
          {b.status === 'pending' && (
            <>
              <Button size="xs" variant="success-outline" icon="fa-solid fa-check" onClick={() => setAct({ b, action: 'approve' })} data-testid="booking-approve">
                Approve
              </Button>
              <Button size="xs" variant="danger-outline" icon="fa-solid fa-xmark" onClick={() => setAct({ b, action: 'reject' })}>
                Reject
              </Button>
            </>
          )}
          {['pending', 'confirmed'].includes(b.status) && new Date(b.end) > new Date() && (
            <Button size="xs" variant="secondary" onClick={() => setAct({ b, action: 'cancel' })}>
              Cancel
            </Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <div className="card">
      <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'booking', 'bookings')}</span>}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="sm:w-40">
          <option value="">All statuses</option>
          {['pending', 'confirmed', 'rejected', 'cancelled'].map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} aria-label="Facility" className="sm:w-48">
          <option value="">All facilities</option>
          {(facilities.data?.items || []).map((f) => (
            <option key={f._id} value={f._id}>
              {f.name}
            </option>
          ))}
        </Select>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="sm:w-44" />
        {date && (
          <Button size="xs" variant="ghost" onClick={() => setDate('')}>
            Clear date
          </Button>
        )}
      </Toolbar>
      <DataTable testId="bookings-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} empty={<EmptyState compact icon="fa-regular fa-calendar" title={status === 'pending' ? 'No bookings waiting for approval' : 'No bookings found'} message="Residents book facilities from the Nivasa app." />} />
      {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      <ConfirmDialog open={act?.action === 'approve'} onClose={() => setAct(null)} onConfirm={() => run()} busy={busy} tone="primary" title="Confirm booking" confirmLabel="Confirm" message={`${act?.b?.facility?.name} for ${act?.b?.user?.name} on ${formatDate(act?.b?.date || act?.b?.start)}, ${formatTime(act?.b?.start)}–${formatTime(act?.b?.end)}.`} />
      <ReasonDialog open={act?.action === 'reject'} onClose={() => setAct(null)} onSubmit={(r) => run(r)} busy={busy} required={false} title="Reject booking" confirmLabel="Reject" message="The resident is notified. Adding a reason helps them rebook." />
      <ReasonDialog open={act?.action === 'cancel'} onClose={() => setAct(null)} onSubmit={(r) => run(r)} busy={busy} title="Cancel booking" confirmLabel="Cancel booking" message="The slot is released and the resident is notified with your reason." />
    </div>
  );
}

export default function Facilities() {
  const { counts, refreshCounts } = useCounts();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'facilities' ? 'facilities' : 'bookings';
  return (
    <div>
      <PageHeader title="Facilities & bookings" subtitle="Amenities residents can book, and the booking queue" />
      <Tabs
        className="mb-4"
        tabs={[
          { value: 'bookings', label: 'Bookings', icon: 'fa-regular fa-calendar', count: counts.pendingBookings || undefined },
          { value: 'facilities', label: 'Facilities', icon: 'fa-regular fa-building' },
        ]}
        value={tab}
        onChange={(v) => setParams({ tab: v })}
      />
      {tab === 'bookings' ? <BookingsTab refreshCounts={refreshCounts} /> : <FacilitiesTab />}
    </div>
  );
}
