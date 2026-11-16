import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../lib/api.js';
import { useAction, useDebounced, usePaged, useQuery } from '../../lib/hooks.js';
import { formatDate, formatPhone, formatRelative, formatTime, todayIST } from '../../lib/format.js';
import { passwordProblems } from '../../lib/validation.js';
import { addedByText, expectedText, flatText, gatemanApiErrors, gatemanBody, validateGateman, VISITOR_STATUS_OPTIONS, VISITOR_TONE } from '../../lib/gate.js';
import { Alert, Avatar, Badge, Button, cx, EmptyState, Icon, PageHeader, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Field, Input, SearchInput, Select } from '../../components/Form.jsx';
import { ConfirmDialog, Modal } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';

const RULES = [
  ['At least 10 characters', (p) => p.length >= 10],
  ['Contains a letter', (p) => /[A-Za-z]/.test(p)],
  ['Contains a number', (p) => /\d/.test(p)],
];

/** Password input with show/hide and the server's rules ticked as you type. */
function PasswordInput({ value, onChange, error, label = 'Password', id = 'gateman-password' }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <Field label={label} required error={error} htmlFor={id}>
        <div className="relative">
          <Input id={id} name="password" type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} invalid={Boolean(error)} className="pr-10" maxLength={128} />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 hover:text-azea-purple" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
            <Icon name={show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} className="text-xs" />
          </button>
        </div>
      </Field>
      <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-3">
        {RULES.map(([label, test]) => {
          const ok = test(value || '');
          return (
            <li key={label} className={cx('flex items-center gap-1.5 text-[11px]', ok ? 'text-emerald-600' : 'text-gray-400')}>
              <Icon name={ok ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'} className="text-[10px]" />
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GatemanModal({ open, onClose, item, onSaved }) {
  const toast = useToast();
  const create = !item;
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({ name: item?.name || '', email: item?.email || '', phone: item?.phone || '', password: '' });
      setErrors({});
    }
  }, [open, item]);
  const [save, busy] = useAction(async () => {
    try {
      const body = gatemanBody(v, { create });
      const r = create ? await api.post('/society/gatemen', body) : await api.patch(`/society/gatemen/${item._id}`, body);
      toast.success(create ? `Gateman ${r?.name || v.name.trim()} added` : 'Gateman updated');
      onSaved();
      onClose();
    } catch (err) {
      setErrors(gatemanApiErrors(err));
    }
  });
  const submit = (e) => {
    e?.preventDefault();
    const errs = validateGateman(v, { create });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV((x) => ({ ...x, [k]: e.target.value })), setErrors((x) => ({ ...x, [k]: undefined, form: undefined })));
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      title={create ? 'New gateman' : `Edit ${item?.name || 'gateman'}`}
      subtitle={create ? 'They sign in from the NIVASA app with this email and password' : 'The email can’t be changed. Use Set password to change the password.'}
      icon={create ? 'fa-solid fa-user-plus' : 'fa-solid fa-user-pen'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} data-testid="gateman-submit">
            {create ? 'Create gateman' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4" data-testid="gateman-form">
        {errors.form && <Alert tone="danger">{errors.form}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name} htmlFor="gm-name">
            <Input id="gm-name" name="name" value={v.name || ''} onChange={set('name')} invalid={Boolean(errors.name)} maxLength={120} placeholder="e.g. Ramesh Kumar" autoComplete="off" />
          </Field>
          <Field label="Mobile (optional)" error={errors.phone} htmlFor="gm-phone" hint="10-digit mobile, shown to staff only">
            <Input id="gm-phone" name="phone" prefix="+91" inputMode="tel" value={v.phone || ''} onChange={set('phone')} invalid={Boolean(errors.phone)} maxLength={14} placeholder="98765 43210" />
          </Field>
          {create ? (
            <Field label="Email" required error={errors.email} htmlFor="gm-email" hint="Used to sign in. It must not belong to another account." className="sm:col-span-2">
              <Input id="gm-email" name="email" type="email" value={v.email || ''} onChange={set('email')} invalid={Boolean(errors.email)} maxLength={160} placeholder="gate1@yoursociety.in" autoComplete="off" />
            </Field>
          ) : (
            <Field label="Email" className="sm:col-span-2">
              <Input name="email" value={v.email || ''} readOnly disabled />
            </Field>
          )}
        </div>
        {create && (
          <>
            <PasswordInput value={v.password || ''} onChange={(p) => (setV((x) => ({ ...x, password: p })), setErrors((x) => ({ ...x, password: undefined, form: undefined })))} error={errors.password} />
            <p className="rounded-lg bg-azea-bg px-3 py-2 text-[11px] leading-relaxed text-gray-600">
              <Icon name="fa-solid fa-mobile-screen" className="mr-1.5 text-azea-purple" />
              Share the email and password with the gateman in person. In the NIVASA app they tap <b>Gate staff sign-in</b>.
            </p>
          </>
        )}
      </form>
    </Modal>
  );
}

function PasswordModal({ open, onClose, item }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) (setPw(''), setError(null));
  }, [open]);
  const [save, busy] = useAction(async () => {
    try {
      await api.post(`/society/gatemen/${item._id}/password`, { password: pw });
      toast.success(`New password set for ${item.name}`);
      onClose();
    } catch (err) {
      setError(err?.details?.find?.((d) => String(d.path || '').startsWith('password'))?.message || err?.message || 'Couldn’t set the password');
    }
  });
  const submit = (e) => {
    e?.preventDefault();
    const p = passwordProblems(pw);
    if (!pw) return setError('Enter the new password');
    if (p.length) return setError(`Password needs: ${p.join(', ').toLowerCase()}`);
    save();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={`Set password · ${item?.name || ''}`}
      subtitle="They are signed out of the app at once and sign in again with the new password"
      icon="fa-solid fa-key"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} data-testid="password-submit">
            Set password
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <PasswordInput value={pw} onChange={(p) => (setPw(p), setError(null))} error={error} label="New password" id="gateman-new-password" />
      </form>
    </Modal>
  );
}

function GatemenTab() {
  const toast = useToast();
  const q = useQuery(() => api.get('/society/gatemen'), []);
  const [modal, setModal] = useState(null);
  const item = modal?.item;
  const disabling = item?.status === 'active';
  const [toggle, toggling] = useAction(async () => {
    try {
      await api.post(`/society/gatemen/${item._id}/status`, { status: disabling ? 'disabled' : 'active' });
      toast.success(disabling ? `${item.name} is disabled and signed out` : `${item.name} can sign in again`);
      setModal(null);
    } catch (err) {
      toast.error(err?.message || 'Couldn’t change the status');
    }
    q.reload();
  });

  const columns = [
    {
      key: 'name',
      header: 'Gateman',
      render: (g) => (
        <div className="flex min-w-[160px] items-center gap-3">
          <Avatar name={g.name} size="sm" />
          <p className="truncate font-semibold text-gray-700">{g.name}</p>
        </div>
      ),
    },
    { key: 'email', header: 'Email (sign-in)', render: (g) => <span className="break-all">{g.email}</span> },
    { key: 'phone', header: 'Mobile', render: (g) => (g.phone ? <span className="whitespace-nowrap">{formatPhone(g.phone)}</span> : <span className="text-gray-300">—</span>) },
    { key: 'status', header: 'Status', render: (g) => <Badge status={g.status} /> },
    { key: 'last', header: 'Last sign-in', render: (g) => (g.lastLoginAt ? <span title={formatDate(g.lastLoginAt)} className="whitespace-nowrap">{formatRelative(g.lastLoginAt)}</span> : <span className="text-gray-300">Never</span>) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (g) => (
        <div className="flex justify-end gap-2">
          <Button size="xs" variant="secondary" icon="fa-solid fa-user-pen" onClick={() => setModal({ type: 'edit', item: g })} aria-label={`Edit ${g.name}`}>
            Edit
          </Button>
          <Button size="xs" variant="outline" icon="fa-solid fa-key" onClick={() => setModal({ type: 'password', item: g })} aria-label={`Set password for ${g.name}`}>
            Set password
          </Button>
          <Button size="xs" variant={g.status === 'active' ? 'danger-outline' : 'success-outline'} icon={g.status === 'active' ? 'fa-solid fa-ban' : 'fa-solid fa-play'} onClick={() => setModal({ type: 'toggle', item: g })} aria-label={`${g.status === 'active' ? 'Disable' : 'Enable'} ${g.name}`}>
            {g.status === 'active' ? 'Disable' : 'Enable'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="card min-w-0">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="card-title">Gate staff accounts</h2>
            <p className="mt-0.5 text-[11px] text-azea-muted">{q.data?.items ? `${q.data.items.length} account${q.data.items.length === 1 ? '' : 's'} · ${q.data.items.filter((g) => g.status === 'active').length} active` : 'Loading…'}</p>
          </div>
          <Button icon="fa-solid fa-user-plus" onClick={() => setModal({ type: 'new' })} data-testid="new-gateman">
            New gateman
          </Button>
        </div>
        <div className={cx(q.data?.items?.length ? 'hidden md:block' : '')}>
          <DataTable
            testId="gatemen-table"
            columns={columns}
            rows={q.data?.items}
            loading={q.loading}
            error={q.error}
            onRetry={q.reload}
            dim={q.reloading}
            empty={<EmptyState compact icon="fa-solid fa-shield-halved" title="No gatemen yet" message="Add the security guards who work at your gate. They manage guests from the NIVASA app." action={<Button icon="fa-solid fa-user-plus" onClick={() => setModal({ type: 'new' })}>New gateman</Button>} />}
          />
        </div>
        {/* Phones: one card per gateman instead of a wide table. */}
        {q.data?.items?.length > 0 && (
          <ul className={cx('divide-y divide-gray-100 md:hidden', q.reloading && 'opacity-60')} data-testid="gatemen-cards">
            {q.data.items.map((g) => (
              <li key={g._id} className="space-y-3 px-5 py-4">
                <div className="flex items-start gap-3">
                  <Avatar name={g.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs font-semibold text-gray-700">{g.name}</p>
                    <p className="break-all text-[11px] text-gray-500">{g.email}</p>
                    <p className="text-[11px] text-gray-400">
                      {g.phone ? formatPhone(g.phone) : 'No mobile'} · {g.lastLoginAt ? `signed in ${formatRelative(g.lastLoginAt)}` : 'never signed in'}
                    </p>
                  </div>
                  <Badge status={g.status} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button size="sm" variant="secondary" icon="fa-solid fa-user-pen" className="min-h-[40px]" onClick={() => setModal({ type: 'edit', item: g })}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" icon="fa-solid fa-key" className="min-h-[40px]" onClick={() => setModal({ type: 'password', item: g })}>
                    Password
                  </Button>
                  <Button size="sm" variant={g.status === 'active' ? 'danger-outline' : 'success-outline'} icon={g.status === 'active' ? 'fa-solid fa-ban' : 'fa-solid fa-play'} className="min-h-[40px]" onClick={() => setModal({ type: 'toggle', item: g })}>
                    {g.status === 'active' ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <GatemanModal open={modal?.type === 'new' || modal?.type === 'edit'} item={modal?.type === 'edit' ? item : null} onClose={() => setModal(null)} onSaved={q.reload} />
      <PasswordModal open={modal?.type === 'password'} item={item} onClose={() => setModal(null)} />
      <ConfirmDialog
        open={modal?.type === 'toggle'}
        onClose={() => setModal(null)}
        onConfirm={() => toggle()}
        busy={toggling}
        tone={disabling ? 'danger' : 'primary'}
        title={disabling ? `Disable ${item?.name}?` : `Enable ${item?.name}?`}
        confirmLabel={disabling ? 'Disable' : 'Enable'}
        message={disabling ? 'They are signed out at once and can’t sign in to the gate app until you enable them again. Their guest history is kept.' : 'They can sign in to the gate app again with their current password.'}
      />
    </>
  );
}

function VisitorLogTab() {
  const [date, setDate] = useState(todayIST());
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 350);
  const list = usePaged((p) => api.get('/society/visitors', p), { date: date || undefined, status, q: q || undefined }, 20);
  const columns = [
    {
      key: 'guest',
      header: 'Guest',
      render: (v) => (
        <div className="min-w-[140px]">
          <p className="font-semibold text-gray-700">{v.name}</p>
          {v.purpose && <p className="max-w-[220px] truncate text-[11px] text-gray-400" title={v.purpose}>{v.purpose}</p>}
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (v) => <span className="whitespace-nowrap">{formatPhone(v.phone)}</span> },
    { key: 'flat', header: 'Flat', render: (v) => <span className="whitespace-nowrap">{flatText(v)}</span> },
    { key: 'host', header: 'Host', render: (v) => v.host?.name || <span className="text-gray-400">Flat</span> },
    {
      key: 'expected',
      header: 'Expected',
      render: (v) => {
        const e = expectedText(v);
        return (
          <div className="whitespace-nowrap">
            <p>{e.date}</p>
            {e.time && <p className="text-[11px] text-gray-400">{e.time}</p>}
          </div>
        );
      },
    },
    { key: 'entry', header: 'Entry', render: (v) => (v.entryAt ? <span className="whitespace-nowrap" title={formatDate(v.entryAt)}>{formatTime(v.entryAt)}</span> : <span className="text-gray-300">—</span>) },
    { key: 'exit', header: 'Exit', render: (v) => (v.exitAt ? <span className="whitespace-nowrap" title={formatDate(v.exitAt)}>{formatTime(v.exitAt)}</span> : <span className="text-gray-300">—</span>) },
    { key: 'status', header: 'Status', render: (v) => <Badge tone={VISITOR_TONE[v.status]} status={v.status} /> },
    { key: 'by', header: 'Added by', render: (v) => <span className="whitespace-nowrap text-gray-500">{addedByText(v.createdByRole)}</span> },
  ];
  const items = list.data?.items;
  const filtered = Boolean(q) || status !== 'all';
  return (
    <div className="card min-w-0">
      <Toolbar
        right={
          <span className="text-[11px] text-azea-muted">
            <Icon name="fa-regular fa-eye" className="mr-1" />
            Read only — the gate team records entries in the app
          </span>
        }
      >
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-gray-500 sm:flex-none">
            <span className="whitespace-nowrap font-semibold">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="form-input min-w-0 flex-1 sm:w-auto" aria-label="Expected date" data-testid="visitor-date" />
          </label>
          {date ? (
            <Button size="sm" variant="secondary" onClick={() => setDate('')}>
              All dates
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setDate(todayIST())}>
              Today
            </Button>
          )}
        </div>
        <div className="sm:w-52">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" data-testid="visitor-status">
            {VISITOR_STATUS_OPTIONS.map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search guest, phone or flat" className="sm:w-64" />
      </Toolbar>
      <div className={cx(items?.length ? 'hidden md:block' : '')}>
        <DataTable
          testId="visitor-table"
          columns={columns}
          rows={items}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          dim={list.reloading}
          empty={<EmptyState compact icon="fa-solid fa-person-walking-arrow-right" title={filtered ? 'No guests match these filters' : date ? `No guests on ${formatDate(date)}` : 'No guests yet'} message={filtered ? 'Try another status or clear the search.' : 'Guests added by members or by the gate appear here.'} />}
        />
      </div>
      {items?.length > 0 && (
        <ul className={cx('divide-y divide-gray-100 md:hidden', list.reloading && 'opacity-60')} data-testid="visitor-cards">
          {items.map((v) => {
            const e = expectedText(v);
            return (
              <li key={v._id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-xs font-semibold text-gray-700">{v.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {formatPhone(v.phone)} · {flatText(v)}
                    </p>
                  </div>
                  <Badge tone={VISITOR_TONE[v.status]} status={v.status} />
                </div>
                {v.purpose && <p className="mt-1 break-words text-[11px] text-gray-400">{v.purpose}</p>}
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <dt className="text-gray-400">Host</dt>
                  <dd className="text-gray-600">{v.host?.name || 'Flat'}</dd>
                  <dt className="text-gray-400">Expected</dt>
                  <dd className="text-gray-600">{[e.date, e.time].filter(Boolean).join(', ')}</dd>
                  <dt className="text-gray-400">Entry / exit</dt>
                  <dd className="text-gray-600">{`${v.entryAt ? formatTime(v.entryAt) : '—'} / ${v.exitAt ? formatTime(v.exitAt) : '—'}`}</dd>
                  <dt className="text-gray-400">Added by</dt>
                  <dd className="text-gray-600">{addedByText(v.createdByRole)}</dd>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={list.page} pages={list.data?.pages || 1} total={list.data?.total || 0} limit={list.limit} onPage={list.setPage} />
    </div>
  );
}

export default function Gatemen() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'visitors' ? 'visitors' : 'gatemen';
  return (
    <div>
      <PageHeader title="Gatemen" subtitle="Security guard accounts for the gate, and the guest log they keep" />
      <Alert tone="purple" icon="fa-solid fa-mobile-screen" className="mb-5">
        Gatemen sign in from the NIVASA app (<b>Gate staff sign-in</b>), not this panel.
      </Alert>
      <Tabs
        className="mb-5 w-fit"
        value={tab}
        onChange={(t) => setParams(t === 'visitors' ? { tab: 'visitors' } : {}, { replace: true })}
        tabs={[
          { value: 'gatemen', label: 'Gatemen', icon: 'fa-solid fa-shield-halved' },
          { value: 'visitors', label: 'Visitor log', icon: 'fa-solid fa-person-walking-arrow-right' },
        ]}
      />
      {tab === 'gatemen' ? <GatemenTab /> : <VisitorLogTab />}
    </div>
  );
}
