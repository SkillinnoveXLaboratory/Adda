import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction, useQuery } from '../../lib/hooks.js';
import { formatDate, formatPhone, formatRelative } from '../../lib/format.js';
import { emailRule, maxLen, minLen, normalizePhone, phoneRule, req, runRules } from '../../lib/validation.js';
import { noPermissionReason, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../lib/roles.js';
import { Avatar, Badge, Button, Card, cx, EmptyState, PageHeader } from '../../components/ui.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { Field, Input, Select } from '../../components/Form.jsx';
import { ConfirmDialog, Modal } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';
import { SetupLinkModal } from '../../components/SetupLinkModal.jsx';

const ROLES = ['admin', 'secretary', 'treasurer', 'manager', 'committee'];

function InviteModal({ open, onClose, onInvited }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({ name: '', email: '', phone: '', role: 'committee', title: '' });
      setErrors({});
    }
  }, [open]);
  const [save, busy] = useAction(
    () => api.post('/society/staff', { name: v.name.trim(), email: v.email.trim().toLowerCase(), phone: v.phone ? normalizePhone(v.phone) : undefined, role: v.role, title: v.title.trim() || undefined }),
    { toast, success: 'Staff member added', onDone: (r) => onInvited(r, v.email.trim().toLowerCase()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, { name: [req('Enter their name'), minLen(2), maxLen(120)], email: [req('Enter their email'), emailRule()], phone: [phoneRule()], title: [maxLen(80)] });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} size="lg" title="Invite staff member" subtitle="They get a one-time link to set a password" icon="fa-solid fa-user-plus" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} data-testid="invite-submit">Send invite</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>
            <Input name="name" value={v.name || ''} onChange={set('name')} invalid={Boolean(errors.name)} />
          </Field>
          <Field label="Email" required error={errors.email} hint="Used to sign in">
            <Input name="email" type="email" value={v.email || ''} onChange={set('email')} invalid={Boolean(errors.email)} />
          </Field>
          <Field label="Mobile" error={errors.phone}>
            <Input name="phone" prefix="+91" inputMode="tel" value={v.phone || ''} onChange={set('phone')} invalid={Boolean(errors.phone)} maxLength={14} />
          </Field>
          <Field label="Title" error={errors.title} hint="e.g. Treasurer, Facility manager">
            <Input name="title" value={v.title || ''} onChange={set('title')} invalid={Boolean(errors.title)} />
          </Field>
        </div>
        <div>
          <p className="form-label">Role</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <label key={r} className={cx('flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors', v.role === r ? 'border-brand bg-brand-light/50' : 'border-gray-100 hover:border-gray-200')}>
                <input type="radio" name="role" value={r} checked={v.role === r} onChange={set('role')} className="mt-0.5 accent-[#2563eb]" />
                <span>
                  <span className="block text-xs font-semibold text-gray-700">{ROLE_LABELS[r]}</span>
                  <span className="block text-[11px] leading-relaxed text-gray-500">{ROLE_DESCRIPTIONS[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

function RoleModal({ open, onClose, staff, onSaved }) {
  const toast = useToast();
  const [role, setRole] = useState('');
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (open && staff) {
      setRole(staff.role);
      setTitle(staff.title || '');
    }
  }, [open, staff]);
  const [save, busy] = useAction(() => api.patch(`/society/staff/${staff._id}`, { role, title: title.trim() || undefined }), { toast, success: 'Role updated', onDone: () => (onSaved(), onClose()) });
  return (
    <Modal open={open} onClose={onClose} busy={busy} title={`Change role · ${staff?.user?.name || ''}`} icon="fa-solid fa-user-shield" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => save()} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Role">
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <p className="rounded-lg bg-brand-bg px-3 py-2 text-[11px] leading-relaxed text-gray-600">{ROLE_DESCRIPTIONS[role]}</p>
        <Field label="Title">
          <Input name="title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function Staff() {
  const { can, role, user } = useAuth();
  const toast = useToast();
  const q = useQuery(() => api.get('/society/staff'), []);
  const [modal, setModal] = useState(null);
  const canManage = can('staff');
  const reason = canManage ? null : noPermissionReason(role);

  const [toggle, toggling] = useAction(
    () => api.patch(`/society/staff/${modal.item._id}`, { status: modal.item.status === 'active' ? 'disabled' : 'active' }),
    { toast, success: () => (modal.item.status === 'active' ? 'Access disabled' : 'Access restored'), onDone: () => (setModal(null), q.reload()) },
  );
  const [relink, relinking] = useAction(() => api.post(`/society/staff/${modal.item._id}/setup-link`), {
    toast,
    onDone: (r) => setModal({ type: 'link', email: modal.item.user?.email, link: r.setupLink, emailed: r.emailed }),
  });

  const columns = [
    {
      key: 'name',
      header: 'Staff member',
      render: (s) => (
        <div className="flex items-center gap-3">
          <Avatar name={s.user?.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-700">
              {s.user?.name || '—'} {s.user?._id === user?._id && <span className="ml-1 text-[10px] font-semibold text-brand">(you)</span>}
            </p>
            <p className="truncate text-[11px] text-gray-400">{[s.user?.email, s.user?.phone && formatPhone(s.user.phone)].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (s) => <Badge tone={s.role === 'admin' ? 'purple' : 'info'}>{ROLE_LABELS[s.role] || s.role}</Badge> },
    { key: 'title', header: 'Title', render: (s) => s.title || '—' },
    { key: 'status', header: 'Access', render: (s) => (s.status === 'disabled' ? <Badge status="disabled" /> : s.user?.status === 'pending_setup' ? <Badge tone="warning">Invite pending</Badge> : <Badge status="active" />) },
    { key: 'last', header: 'Last sign-in', render: (s) => (s.user?.lastLoginAt ? <span title={formatDate(s.user.lastLoginAt)}>{formatRelative(s.user.lastLoginAt)}</span> : <span className="text-gray-300">Never</span>) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => {
        const self = s.user?._id === user?._id;
        const selfReason = self ? 'You can’t change your own access' : null;
        return (
          <div className="flex justify-end gap-2">
            {s.user?.status === 'pending_setup' && s.status === 'active' && (
              <Button size="xs" variant="outline" icon="fa-solid fa-link" disabledReason={reason} onClick={() => setModal({ type: 'relink', item: s })}>
                New link
              </Button>
            )}
            <Button size="xs" variant="secondary" icon="fa-solid fa-user-pen" disabledReason={reason || selfReason} onClick={() => setModal({ type: 'role', item: s })}>
              Role
            </Button>
            <Button size="xs" variant={s.status === 'active' ? 'danger-outline' : 'success-outline'} icon={s.status === 'active' ? 'fa-solid fa-ban' : 'fa-solid fa-play'} disabledReason={reason || selfReason} onClick={() => setModal({ type: 'toggle', item: s })}>
              {s.status === 'active' ? 'Disable' : 'Enable'}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Staff & roles" subtitle="People who can sign in to this portal for your society" actions={<Button icon="fa-solid fa-user-plus" disabledReason={reason} onClick={() => setModal({ type: 'invite' })} data-testid="invite-staff">Invite staff</Button>} />
      <div className="space-y-6">
        <div className="card min-w-0">
          <DataTable testId="staff-table" columns={columns} rows={q.data?.items} loading={q.loading} error={q.error} onRetry={q.reload} dim={q.reloading} empty={<EmptyState compact icon="fa-solid fa-user-shield" title="No staff yet" />} />
        </div>
        <Card title="What each role can do">
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {ROLES.map((r) => (
              <li key={r}>
                <p className="text-xs font-semibold text-gray-700">{ROLE_LABELS[r]}</p>
                <p className="text-[11px] leading-relaxed text-gray-500">{ROLE_DESCRIPTIONS[r]}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <InviteModal open={modal?.type === 'invite'} onClose={() => setModal(null)} onInvited={(r, email) => (q.reload(), setModal({ type: 'link', email, link: r.setupLink, emailed: r.emailed }))} />
      <RoleModal open={modal?.type === 'role'} staff={modal?.item} onClose={() => setModal(null)} onSaved={q.reload} />
      <ConfirmDialog
        open={modal?.type === 'toggle'}
        onClose={() => setModal(null)}
        onConfirm={() => toggle()}
        busy={toggling}
        tone={modal?.item?.status === 'active' ? 'danger' : 'primary'}
        title={modal?.item?.status === 'active' ? 'Disable access' : 'Restore access'}
        confirmLabel={modal?.item?.status === 'active' ? 'Disable' : 'Enable'}
        message={modal?.item?.status === 'active' ? `${modal?.item?.user?.name} will no longer be able to manage this society. Their account is not deleted.` : `${modal?.item?.user?.name} will regain ${ROLE_LABELS[modal?.item?.role]} access.`}
      />
      <ConfirmDialog open={modal?.type === 'relink'} onClose={() => setModal(null)} onConfirm={() => relink()} busy={relinking} tone="primary" title="Generate a new setup link" confirmLabel="Generate link" message={`Any earlier link sent to ${modal?.item?.user?.email} stops working.`} />
      <SetupLinkModal open={modal?.type === 'link'} onClose={() => setModal(null)} email={modal?.email} link={modal?.link} emailed={modal?.emailed} />
    </div>
  );
}
