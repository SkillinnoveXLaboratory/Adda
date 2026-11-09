import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAction, useQuery } from '../../lib/hooks.js';
import { formatDate, formatDateTime, formatRelative, plural } from '../../lib/format.js';
import { emailRule, maxLen, minLen, passwordProblems, req, runRules } from '../../lib/validation.js';
import { allPermissions, orderedPermissions, togglePermission } from '../../lib/permissions.js';
import { Alert, Avatar, Badge, Button, cx, EmptyState, Icon, PageHeader } from '../../components/ui.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { Field, Input } from '../../components/Form.jsx';
import { ConfirmDialog, Modal } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';

const passwordError = (pw) => {
  const problems = passwordProblems(pw);
  return problems.length ? `Password needs: ${problems.join(', ').toLowerCase()}` : null;
};

/** Password input with show / hide. */
function PasswordInput({ id, value, onChange, invalid, testId }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name="password" type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={onChange} invalid={invalid} className="pr-10" placeholder="At least 10 characters, letters and numbers" data-testid={testId} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 hover:text-brand" aria-label={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} className="text-xs" />
      </button>
    </div>
  );
}

/**
 * One row per area: View + Manage. Ticking Manage ticks View; unticking View unticks Manage.
 * View-only areas show "—" for Manage.
 */
function PermissionGrid({ catalogue, value, onChange, error }) {
  const total = allPermissions(catalogue).length;
  const box = (area, level, label) => (
    <input
      type="checkbox"
      checked={value.has(`${area}.${level}`)}
      onChange={(e) => onChange(togglePermission(value, area, level, e.target.checked))}
      className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-[#2563eb] focus:ring-brand/30"
      aria-label={label}
      data-testid={`perm-${area}-${level}`}
    />
  );
  return (
    <fieldset>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <legend className="form-label !mb-0">
          Permissions <span className="text-brand-danger">*</span>
        </legend>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[11px] text-brand-muted" data-testid="perm-count">
            {value.size} of {total} ticked
          </span>
          <Button size="xs" variant="ghost" onClick={() => onChange(new Set(allPermissions(catalogue)))} data-testid="perm-all">
            Select all
          </Button>
          <Button size="xs" variant="ghost" onClick={() => onChange(new Set())} data-testid="perm-clear">
            Clear
          </Button>
        </div>
      </div>
      <div className={cx('overflow-hidden rounded-xl border', error ? 'border-rose-300' : 'border-gray-100')}>
        <table className="w-full border-separate border-spacing-0 text-xs" data-testid="perm-grid">
          <thead>
            <tr className="bg-gray-50/80">
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Area</th>
              <th className="w-16 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:w-20">View</th>
              <th className="w-16 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 sm:w-20">Manage</th>
            </tr>
          </thead>
          <tbody>
            {catalogue.map((c) => (
              <tr key={c.area} className="align-top [&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-gray-50">
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-gray-700">{c.label}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-gray-400">
                    {c.view}
                    {c.manage && <span className="hidden sm:inline"> · Manage: {c.manage}</span>}
                  </p>
                </td>
                <td className="px-2 py-2.5 text-center">{box(c.area, 'view', `${c.label}: view`)}</td>
                <td className="px-2 py-2.5 text-center">
                  {c.viewOnly ? (
                    <span className="text-gray-300" title="View only — this page has no buttons to manage" aria-label="Not applicable">
                      —
                    </span>
                  ) : (
                    box(c.area, 'manage', `${c.label}: manage`)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-500" role="alert" data-testid="perm-error">
          <Icon name="fa-solid fa-circle-exclamation" className="text-[10px]" />
          {error}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-brand-muted">Manage includes View. The Sub-admins page is never grantable — only you can manage sub-admins.</p>
      )}
    </fieldset>
  );
}

/** Create (name, email, password, permissions) or edit (name, permissions). */
function SubAdminModal({ open, item, catalogue, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(item);
  const [v, setV] = useState({ name: '', email: '', password: '' });
  const [perms, setPerms] = useState(new Set());
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  useEffect(() => {
    if (!open) return;
    setV({ name: item?.name || '', email: item?.email || '', password: '' });
    setPerms(new Set(item?.permissions || []));
    setErrors({});
    setFormError(null);
  }, [open, item]);
  const set = (k) => (e) => (setV((x) => ({ ...x, [k]: e.target.value })), setErrors((x) => ({ ...x, [k]: undefined })), setFormError(null));

  const [save, busy] = useAction(
    async (body) => {
      try {
        return await (editing ? api.patch(`/platform/subadmins/${item._id}`, body) : api.post('/platform/subadmins', body));
      } catch (err) {
        // Show server errors next to the field they belong to.
        if (err?.code === 'EMAIL_TAKEN') setErrors((x) => ({ ...x, email: err.message }));
        else if (/password/i.test(err?.message || '')) setErrors((x) => ({ ...x, password: err.message }));
        else if (/permission/i.test(err?.message || '')) setErrors((x) => ({ ...x, permissions: err.message }));
        else setFormError(err?.message || 'Something went wrong. Please try again.');
        return undefined;
      }
    },
    { toast, onDone: (r) => r && (toast.success(editing ? `${r.name}’s permissions saved` : `Sub-admin ${r.name} created`), onSaved(r), onClose()) },
  );

  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, { name: [req('Enter the name'), minLen(2), maxLen(120)], ...(editing ? {} : { email: [req('Enter the email'), emailRule()] }) });
    if (!editing) {
      const pw = passwordError(v.password);
      if (pw) errs.password = pw;
    }
    if (!perms.size) errs.permissions = 'Tick at least one permission';
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    const permissions = orderedPermissions(perms, catalogue);
    save(editing ? { name: v.name.trim(), permissions } : { name: v.name.trim(), email: v.email.trim().toLowerCase(), password: v.password, permissions });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon="fa-solid fa-user-gear"
      title={editing ? `Edit ${item.name}` : 'New sub-admin'}
      subtitle={editing ? `${item.email} · changes apply at once, without signing in again` : 'They sign in at this Master Admin login and see only the pages you tick.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} data-testid="subadmin-save">
            {editing ? 'Save changes' : 'Create sub-admin'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4" data-testid="subadmin-form">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name} htmlFor="sa-name">
            <Input id="sa-name" name="name" value={v.name} onChange={set('name')} invalid={Boolean(errors.name)} maxLength={120} autoComplete="off" data-testid="subadmin-name" />
          </Field>
          <Field label="Email" required={!editing} error={errors.email} hint={editing ? 'The sign-in email can’t be changed' : 'Used to sign in'} htmlFor="sa-email">
            <Input id="sa-email" name="email" type="email" value={v.email} onChange={set('email')} invalid={Boolean(errors.email)} disabled={editing} autoComplete="off" data-testid="subadmin-email" />
          </Field>
        </div>
        {!editing && (
          <Field label="Password" required error={errors.password} hint="At least 10 characters with letters and numbers. Share it privately; they can change it from My security." htmlFor="sa-password">
            <PasswordInput id="sa-password" value={v.password} onChange={set('password')} invalid={Boolean(errors.password)} testId="subadmin-password" />
          </Field>
        )}
        <PermissionGrid catalogue={catalogue} value={perms} onChange={(p) => (setPerms(p), setErrors((x) => ({ ...x, permissions: undefined })))} error={errors.permissions} />
      </form>
    </Modal>
  );
}

function SetPasswordModal({ item, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => {
    setPassword('');
    setError(null);
  }, [item]);
  const [save, busy] = useAction(
    async (pw) => {
      try {
        return await api.post(`/platform/subadmins/${item._id}/password`, { password: pw });
      } catch (err) {
        setError(err?.message || 'Something went wrong. Please try again.');
        return undefined;
      }
    },
    { onDone: (r) => r && (toast.success(`New password set for ${item.name}. They were signed out everywhere.`), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const problem = passwordError(password);
    setError(problem);
    if (!problem) save(password);
  };
  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      busy={busy}
      size="sm"
      icon="fa-solid fa-key"
      title={`Set a new password for ${item?.name || 'this sub-admin'}`}
      subtitle="They are signed out at once and sign in again with the new password."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} data-testid="subadmin-password-save">
            Set password
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <Field label="New password" required error={error} hint="At least 10 characters with letters and numbers." htmlFor="sa-new-password">
          <PasswordInput id="sa-new-password" value={password} onChange={(e) => (setPassword(e.target.value), setError(null))} invalid={Boolean(error)} testId="subadmin-new-password" />
        </Field>
      </form>
    </Modal>
  );
}

/** Sub-admins (platform owner only): GET/POST/PATCH /platform/subadmins, status and password. */
export default function SubAdmins() {
  const toast = useToast();
  const q = useQuery(() => api.get('/platform/subadmins'), []);
  const [modal, setModal] = useState(null); // { item? }
  const [pwFor, setPwFor] = useState(null);
  const [statusFor, setStatusFor] = useState(null);
  const catalogue = q.data?.catalogue || [];
  const [setStatus, settingStatus] = useAction((u) => api.post(`/platform/subadmins/${u._id}/status`, { status: u.status === 'disabled' ? 'active' : 'disabled' }), {
    toast,
    success: (r) => (r.status === 'disabled' ? `${r.name} disabled and signed out` : `${r.name} enabled — they can sign in again`),
    onDone: () => (setStatusFor(null), q.reload()),
  });

  const columns = [
    {
      key: 'name',
      header: 'Sub-admin',
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.name || u.email} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-700">{u.name}</p>
            <p className="truncate text-[11px] text-gray-400">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (u) => <Badge status={u.status} /> },
    {
      key: 'perms',
      header: 'Permissions',
      render: (u) => (
        <span className="whitespace-nowrap" title={u.permissions.join(', ')} data-testid="subadmin-perm-count">
          {plural(u.permissions.length, 'permission')}
        </span>
      ),
    },
    { key: 'last', header: 'Last sign-in', render: (u) => (u.lastLoginAt ? <span title={formatDateTime(u.lastLoginAt)}>{formatRelative(u.lastLoginAt)}</span> : <span className="text-gray-300">Never</span>) },
    { key: 'created', header: 'Added', render: (u) => <span className="whitespace-nowrap">{formatDate(u.createdAt)}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <div className="flex justify-end gap-1.5">
          <Button size="xs" variant="secondary" icon="fa-regular fa-pen-to-square" onClick={() => setModal({ item: u })} aria-label={`Edit ${u.name}`} data-testid="subadmin-edit">
            Edit
          </Button>
          <Button size="xs" variant="secondary" icon="fa-solid fa-key" onClick={() => setPwFor(u)} aria-label={`Set password for ${u.name}`} data-testid="subadmin-password-open">
            Password
          </Button>
          {u.status === 'disabled' ? (
            <Button size="xs" variant="success-outline" icon="fa-solid fa-play" onClick={() => setStatusFor(u)} aria-label={`Enable ${u.name}`} data-testid="subadmin-enable">
              Enable
            </Button>
          ) : (
            <Button size="xs" variant="danger-outline" icon="fa-solid fa-ban" onClick={() => setStatusFor(u)} aria-label={`Disable ${u.name}`} data-testid="subadmin-disable">
              Disable
            </Button>
          )}
        </div>
      ),
    },
  ];
  const disabling = statusFor?.status !== 'disabled';
  return (
    <div data-testid="subadmins-page">
      <PageHeader
        title="Sub-admins"
        subtitle="People who help you run Nivasa. Each one signs in here and sees only the pages and buttons you tick."
        actions={
          <Button icon="fa-solid fa-plus" onClick={() => setModal({})} disabled={!q.data} data-testid="subadmin-new">
            New sub-admin
          </Button>
        }
      />
      <div className="card">
        <DataTable
          testId="subadmins-table"
          columns={columns}
          rows={q.data?.items}
          loading={q.loading}
          error={q.error}
          onRetry={q.reload}
          dim={q.reloading}
          empty={<EmptyState compact icon="fa-solid fa-user-gear" title="No sub-admins yet" message="Add a sub-admin to share the work — for example, someone who reviews vendor KYC or manages coupons." action={<Button icon="fa-solid fa-plus" onClick={() => setModal({})}>New sub-admin</Button>} />}
        />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-brand-muted">
        <Icon name="fa-solid fa-circle-info" className="mr-1" />
        Permission changes apply at once. Every change here and every action a sub-admin takes is written to the audit log.
      </p>
      <SubAdminModal open={Boolean(modal)} item={modal?.item} catalogue={catalogue} onClose={() => setModal(null)} onSaved={q.reload} />
      <SetPasswordModal item={pwFor} onClose={() => setPwFor(null)} />
      <ConfirmDialog
        open={Boolean(statusFor)}
        onClose={() => setStatusFor(null)}
        onConfirm={() => setStatus(statusFor)}
        busy={settingStatus}
        tone={disabling ? 'danger' : 'primary'}
        title={disabling ? `Disable ${statusFor?.name}?` : `Enable ${statusFor?.name}?`}
        confirmLabel={disabling ? 'Disable' : 'Enable'}
        message={disabling ? 'They are signed out at once and can’t sign in until you enable them again. Their permissions are kept.' : 'They can sign in again with their current password and permissions.'}
      />
    </div>
  );
}
