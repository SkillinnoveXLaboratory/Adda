import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction, useDebounced, useQuery } from '../../lib/hooks.js';
import { formatDate, formatDateTime, formatINR, formatPeriod, formatPhone, formatRelative, humanize } from '../../lib/format.js';
import { isIndianMobile, normalizePhone } from '../../lib/validation.js';
import { ROLE_LABELS } from '../../lib/roles.js';
import { Alert, Avatar, Badge, Button, Card, CopyField, EmptyState, Icon, KeyValue, PageHeader, PageSkeleton, QueryState, Tabs } from '../../components/ui.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { Field, Input, Select, Textarea } from '../../components/Form.jsx';
import { Modal, ReasonDialog } from '../../components/Modal.jsx';
import { PasswordFields, validatePasswords } from '../../components/PasswordFields.jsx';
import { MetricCard } from '../../components/Charts.jsx';
import { useToast } from '../../components/Toast.jsx';

const reasonHeader = (reason) => ({ headers: { 'X-Action-Reason': encodeURIComponent(reason) } });
const ReasonField = ({ value, onChange, error }) => (
  <Field label="Reason (saved in the audit log)" error={error}>
    <Textarea rows={2} maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} invalid={Boolean(error)} placeholder="e.g. Resident called the helpline — verified by Aadhaar last 4 digits" />
  </Field>
);

function SetPasswordModal({ open, onClose, user, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ password: '', confirm: '', reason: '' });
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) (setV({ password: '', confirm: '', reason: '' }), setErrors({}));
  }, [open]);
  const [save, busy] = useAction(() => api.post(`/platform/users/${user._id}/password`, { password: v.password, reason: v.reason.trim() }), { toast, success: 'Password set. The member was signed out on every device.', onDone });
  const submit = (e) => {
    e?.preventDefault();
    const errs = validatePasswords(v.password, v.confirm);
    if (v.reason.trim().length < 3) errs.reason = 'A reason is required';
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  return (
    <Modal open={open} onClose={onClose} busy={busy} icon="fa-solid fa-key" title={`Set a new password for ${user?.name || 'this member'}`} subtitle="Share it with the member privately; ask them to change it from the app after signing in." footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} data-testid="set-password-submit">Set password</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <PasswordFields password={v.password} confirm={v.confirm} onPassword={(x) => (setV({ ...v, password: x }), setErrors({}))} onConfirm={(x) => (setV({ ...v, confirm: x }), setErrors({}))} errors={errors} />
        <ReasonField value={v.reason} onChange={(x) => (setV({ ...v, reason: x }), setErrors({}))} error={errors.reason} />
      </form>
    </Modal>
  );
}

function ChangePhoneModal({ open, onClose, user, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ phone: '', reason: '' });
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) (setV({ phone: '', reason: '' }), setErrors({}));
  }, [open]);
  const [save, busy] = useAction(() => api.post(`/platform/users/${user._id}/phone`, { phone: normalizePhone(v.phone), reason: v.reason.trim() }), { toast, success: 'Mobile number updated. The member must sign in again with the new number.', onDone });
  const submit = (e) => {
    e?.preventDefault();
    const errs = {};
    if (!isIndianMobile(v.phone)) errs.phone = 'Enter a valid 10-digit Indian mobile number';
    if (v.reason.trim().length < 3) errs.reason = 'A reason is required';
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  return (
    <Modal open={open} onClose={onClose} busy={busy} icon="fa-solid fa-mobile-screen" title="Correct the mobile number" subtitle="The member is signed out everywhere and signs in with the new number." footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy}>Update number</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="New mobile number" error={errors.phone}>
          <Input prefix="+91" value={v.phone} maxLength={14} onChange={(e) => (setV({ ...v, phone: e.target.value }), setErrors({}))} invalid={Boolean(errors.phone)} />
        </Field>
        <ReasonField value={v.reason} onChange={(x) => (setV({ ...v, reason: x }), setErrors({}))} error={errors.reason} />
      </form>
    </Modal>
  );
}

function MoveMembershipModal({ open, onClose, membership, onDone }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const sid = membership?.society?._id;
  const flats = useQuery(() => (open && sid ? api.get(`/platform/societies/${sid}/manage/flats`, { q, limit: 50 }) : Promise.resolve(null)), [open, sid, q]);
  const [v, setV] = useState({ flatId: '', residentType: '', reason: '' });
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) (setV({ flatId: '', residentType: membership?.residentType || 'owner', reason: '' }), setErrors({}), setSearch(''));
  }, [open, membership]);
  const [save, busy] = useAction(() => api.post(`/platform/memberships/${membership._id}/move`, { flatId: v.flatId, residentType: v.residentType, reason: v.reason.trim() }), { toast, success: 'Membership moved', onDone });
  const submit = (e) => {
    e?.preventDefault();
    const errs = {};
    if (!v.flatId) errs.flatId = 'Choose the flat';
    if (v.reason.trim().length < 3) errs.reason = 'A reason is required';
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  return (
    <Modal open={open} onClose={onClose} busy={busy} icon="fa-solid fa-right-left" title="Move to another flat" subtitle={`${membership?.society?.name || ''} · now ${[membership?.building?.name, membership?.flat?.number].filter(Boolean).join(' ')}`} footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy}>Move</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Find flat (number)">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. A-101" />
        </Field>
        <Field label="Flat" error={errors.flatId}>
          <Select value={v.flatId} onChange={(e) => (setV({ ...v, flatId: e.target.value }), setErrors({}))} invalid={Boolean(errors.flatId)}>
            <option value="">{flats.loading ? 'Loading flats…' : 'Choose a flat'}</option>
            {flats.data?.items
              ?.filter((f) => f._id !== membership?.flat?._id && f.active !== false)
              .map((f) => (
                <option key={f._id} value={f._id}>
                  {[f.building?.name, f.number].filter(Boolean).join(' · ')} {f.residents?.length ? `(${f.residents.length} resident${f.residents.length > 1 ? 's' : ''})` : '(vacant)'}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Resident type">
          <Select value={v.residentType} onChange={(e) => setV({ ...v, residentType: e.target.value })}>
            <option value="owner">Owner</option>
            <option value="tenant">Tenant</option>
            <option value="family">Family</option>
          </Select>
        </Field>
        <ReasonField value={v.reason} onChange={(x) => (setV({ ...v, reason: x }), setErrors({}))} error={errors.reason} />
      </form>
    </Modal>
  );
}

const MEMBERSHIP_ACTIONS = {
  pending: [['approve', 'Approve', 'success-outline', 'fa-solid fa-check'], ['reject', 'Reject', 'danger-outline', 'fa-solid fa-xmark']],
  approved: [['suspend', 'Suspend', 'danger-outline', 'fa-solid fa-pause'], ['remove', 'Remove', 'danger-outline', 'fa-solid fa-user-minus']],
  suspended: [['approve', 'Reinstate', 'success-outline', 'fa-solid fa-play'], ['remove', 'Remove', 'danger-outline', 'fa-solid fa-user-minus']],
};

export default function MemberProfile() {
  const { id } = useParams();
  const toast = useToast();
  const { user: me } = useAuth();
  const q = useQuery(() => api.get(`/platform/users/${id}/profile`), [id]);
  const [modal, setModal] = useState(null);
  const [revealed, setRevealed] = useState(null);
  const [tab, setTab] = useState('activity');
  useEffect(() => setRevealed(null), [id]);
  const done = () => (setModal(null), q.reload());

  const [reveal, revealing] = useAction((reason) => api.post(`/platform/users/${id}/reveal`, { reason }), { toast, onDone: (r) => (setRevealed(r), setModal(null), q.reload()) });
  const [signOut, signingOut] = useAction((reason) => api.post(`/platform/users/${id}/sign-out-all`, { reason }), { toast, success: (r) => `Signed out of ${r.sessionsEnded} session${r.sessionsEnded === 1 ? '' : 's'}`, onDone: done });
  const [setStatus, settingStatus] = useAction((to, reason) => api.post(`/platform/users/${id}/${to}`, reason ? { reason } : {}), { toast, success: 'Account updated', onDone: done });
  const [decide, deciding] = useAction((reason) => api.post(`/platform/societies/${modal.m.society._id}/manage/memberships/${modal.m._id}/${modal.action}`, { reason }, reasonHeader(reason)), { toast, success: 'Membership updated', onDone: done });

  return (
    <QueryState query={q} skeleton={<PageSkeleton cards={4} rows={6} />}>
      {(p) => {
        const u = p.user;
        const isOwner = u.platformRole === 'super_admin';
        const self = u._id === me?._id;
        const locked = self || isOwner;
        const paidPaise = p.payments.filter((x) => x.status === 'captured').reduce((a, x) => a + (x.amountPaise || 0), 0);
        const duePaise = p.invoices.filter((i) => ['unpaid', 'partially_paid'].includes(i.status)).reduce((a, i) => a + ((i.totalPaise || 0) - (i.paidPaise || 0)), 0);

        const membershipCols = [
          { key: 'society', header: 'Society', render: (m) => <div><p className="font-semibold text-gray-700">{m.society?.name}</p><p className="text-[11px] text-gray-400">{m.society?.code}</p></div> },
          { key: 'flat', header: 'Flat', render: (m) => [m.building?.name, m.flat?.number].filter(Boolean).join(' · ') },
          { key: 'type', header: 'Type', render: (m) => humanize(m.residentType) },
          { key: 'status', header: 'Status', render: (m) => <div><Badge status={m.status === 'cancelled' ? 'removed' : m.status} />{m.decisionReason && <p className="mt-0.5 max-w-[180px] truncate text-[10px] text-gray-400" title={m.decisionReason}>{m.decisionReason}</p>}</div> },
          { key: 'when', header: 'Requested / decided', render: (m) => <div className="text-[11px]"><p>{formatDate(m.createdAt)}</p>{m.decidedAt && <p className="text-gray-400">{formatDate(m.decidedAt)}{m.decidedBy?.name ? ` · ${m.decidedBy.name}` : ''}</p>}</div> },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (m) => (
              <div className="flex justify-end gap-1.5">
                {(MEMBERSHIP_ACTIONS[m.status] || []).map(([action, label, variant, icon]) => (
                  <Button key={action} size="xs" variant={variant} icon={icon} onClick={() => setModal({ type: 'decide', m, action, label })} data-testid={`m-${action}`}>
                    {label}
                  </Button>
                ))}
                {['pending', 'approved', 'suspended'].includes(m.status) && (
                  <Button size="xs" variant="outline" icon="fa-solid fa-right-left" onClick={() => setModal({ type: 'move', m })} data-testid="m-move">
                    Move
                  </Button>
                )}
              </div>
            ),
          },
        ];

        const activity = {
          activity: (
            <DataTable
              columns={[
                { key: 'when', header: 'When', render: (a) => formatDateTime(a.createdAt) },
                { key: 'action', header: 'Action', render: (a) => <code className="text-[11px] text-gray-700">{a.action}</code> },
                { key: 'by', header: 'By', render: (a) => (String(a.actor?._id || a.actor) === u._id ? 'This member' : a.actor?.name || '—') },
                { key: 'summary', header: 'Details', render: (a) => <span className="block max-w-[320px] truncate" title={a.summary}>{a.summary || '—'}</span> },
              ]}
              rows={p.audit}
              maxHeight="max-h-[420px]"
              empty={<EmptyState compact icon="fa-solid fa-clock-rotate-left" title="No audit entries" />}
            />
          ),
          complaints: (
            <DataTable
              columns={[
                { key: 't', header: 'Ticket', render: (c) => <span className="font-mono">{c.ticketNumber}</span> },
                { key: 'title', header: 'Title', render: (c) => <span className="block max-w-[260px] truncate">{c.title}</span> },
                { key: 'society', header: 'Society', render: (c) => c.society?.name },
                { key: 'status', header: 'Status', render: (c) => <Badge status={c.status} /> },
                { key: 'date', header: 'Raised', render: (c) => formatDate(c.createdAt) },
              ]}
              rows={p.complaints}
              maxHeight="max-h-[420px]"
              empty={<EmptyState compact icon="fa-solid fa-screwdriver-wrench" title="No complaints" />}
            />
          ),
          money: (
            <div className="grid grid-cols-1 gap-0 xl:grid-cols-2">
              <DataTable
                columns={[
                  { key: 'n', header: 'Invoice', render: (i) => <div><p className="font-mono">{i.invoiceNumber}</p><p className="text-[11px] text-gray-400">{formatPeriod(i.period)} · {i.flat?.number}</p></div> },
                  { key: 'total', header: 'Total', align: 'right', render: (i) => formatINR(i.totalPaise) },
                  { key: 'status', header: 'Status', render: (i) => <Badge status={i.status} /> },
                ]}
                rows={p.invoices}
                maxHeight="max-h-[420px]"
                empty={<EmptyState compact icon="fa-solid fa-file-invoice" title="No invoices for their flats" />}
              />
              <DataTable
                columns={[
                  { key: 'date', header: 'Paid on', render: (x) => formatDate(x.createdAt) },
                  { key: 'amt', header: 'Amount', align: 'right', render: (x) => formatINR(x.amountPaise) },
                  { key: 'ch', header: 'Channel', render: (x) => humanize(x.channel || x.method) },
                  { key: 'status', header: 'Status', render: (x) => <Badge status={x.status} /> },
                ]}
                rows={p.payments}
                maxHeight="max-h-[420px]"
                empty={<EmptyState compact icon="fa-solid fa-indian-rupee-sign" title="No payments" />}
              />
            </div>
          ),
          bookings: (
            <DataTable
              columns={[
                { key: 'f', header: 'Facility', render: (b) => b.facility?.name || '—' },
                { key: 'when', header: 'When', render: (b) => formatDateTime(b.start) },
                { key: 'status', header: 'Status', render: (b) => <Badge status={b.status} /> },
              ]}
              rows={p.bookings}
              maxHeight="max-h-[420px]"
              empty={<EmptyState compact icon="fa-regular fa-calendar-check" title="No bookings" />}
            />
          ),
          sessions: (
            <DataTable
              columns={[
                { key: 'client', header: 'App', render: (s) => <Badge tone={s.client === 'panel' ? 'purple' : 'info'}>{s.client === 'panel' ? 'Admin panel' : 'Mobile app'}</Badge> },
                { key: 'device', header: 'Device', render: (s) => <span className="block max-w-[240px] truncate" title={s.userAgent}>{s.deviceName || s.userAgent || '—'}</span> },
                { key: 'ip', header: 'IP', render: (s) => <span className="font-mono">{s.ip || '—'}</span> },
                { key: 'last', header: 'Last used', render: (s) => formatRelative(s.lastUsedAt || s.createdAt) },
                { key: 'exp', header: 'Expires', render: (s) => formatDate(s.expiresAt) },
              ]}
              rows={p.sessions}
              maxHeight="max-h-[420px]"
              empty={<EmptyState compact icon="fa-solid fa-mobile-screen" title="Not signed in anywhere" />}
            />
          ),
          notifications: (
            <DataTable
              columns={[
                { key: 'when', header: 'Sent', render: (n) => formatDateTime(n.createdAt) },
                { key: 'type', header: 'Type', render: (n) => humanize(n.type) },
                { key: 'title', header: 'Title', render: (n) => <span className="block max-w-[320px] truncate">{n.title}</span> },
                { key: 'read', header: 'Read', render: (n) => (n.readAt ? formatRelative(n.readAt) : <span className="text-gray-300">Unread</span>) },
              ]}
              rows={p.notifications}
              maxHeight="max-h-[420px]"
              empty={<EmptyState compact icon="fa-regular fa-bell" title="No notifications" />}
            />
          ),
        };

        return (
          <div>
            <PageHeader
              back={
                <Link to="/admin/members" className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-brand">
                  <Icon name="fa-solid fa-arrow-left" /> Members directory
                </Link>
              }
              title={u.name || 'Unnamed member'}
              subtitle={`Account created ${formatDate(u.createdAt)} · last sign-in ${u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'never'}`}
              actions={
                !locked && (
                  <>
                    <Button variant="outline" icon="fa-solid fa-key" onClick={() => setModal({ type: 'password' })} data-testid="action-password">
                      Set password
                    </Button>
                    <Button variant="outline" icon="fa-solid fa-mobile-screen" onClick={() => setModal({ type: 'phone' })}>
                      Change mobile
                    </Button>
                    <Button variant="outline" icon="fa-solid fa-right-from-bracket" disabledReason={p.sessions.length ? null : 'No active sessions'} onClick={() => setModal({ type: 'signout' })} data-testid="action-signout">
                      Sign out everywhere
                    </Button>
                    {u.status === 'disabled' ? (
                      <Button variant="success" icon="fa-solid fa-play" loading={settingStatus} onClick={() => setStatus('active')}>
                        Enable account
                      </Button>
                    ) : (
                      <Button variant="danger" icon="fa-solid fa-ban" onClick={() => setModal({ type: 'disable' })} disabledReason={u.status === 'pending_setup' ? 'Account setup not finished' : null}>
                        Disable
                      </Button>
                    )}
                  </>
                )
              }
            />
            {locked && (
              <Alert tone="info" className="mb-5">
                {self ? 'This is your own account. Manage it from My security.' : 'Platform owner accounts are managed from the server console.'}
              </Alert>
            )}
            {u.status === 'disabled' && (
              <Alert tone="danger" className="mb-5" title="Account disabled">
                {u.disabledReason || 'No reason recorded.'}
              </Alert>
            )}

            <div className="mb-6 grid grid-cols-12 gap-6">
              <Card className="col-span-12 xl:col-span-5" title="Contact & account">
                <div className="mb-4 flex items-center gap-3">
                  <Avatar name={u.name} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-800">{u.name || 'Unnamed'}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge status={u.status} />
                      {isOwner && <Badge tone="purple">Platform owner</Badge>}
                      {p.staff.length > 0 && <Badge tone="info">Society staff</Badge>}
                      {u.phone && !u.phoneVerifiedAt && <Badge tone="warning">Mobile not OTP-verified</Badge>}
                    </div>
                  </div>
                </div>
                {revealed ? (
                  <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3" data-testid="revealed">
                    <p className="text-[11px] font-semibold text-amber-700">
                      <Icon name="fa-solid fa-eye" className="mr-1" /> Revealed — this view was logged
                    </p>
                    <CopyField label="Mobile" value={revealed.phone ? formatPhone(revealed.phone) : '—'} />
                    <CopyField label="Email" value={revealed.email || '—'} />
                    <Button size="xs" variant="secondary" icon="fa-solid fa-eye-slash" onClick={() => setRevealed(null)}>
                      Hide again
                    </Button>
                  </div>
                ) : (
                  <KeyValue
                    cols={1}
                    items={[
                      ['Mobile', <span key="p" className="font-mono" data-testid="masked-phone">{u.phone || '—'}</span>],
                      ['Email', <span key="e" className="font-mono">{u.email || '—'}</span>],
                    ]}
                  />
                )}
                {!revealed && (u.phone || u.email) && (
                  <Button size="sm" variant="outline" icon="fa-solid fa-eye" className="mt-4" onClick={() => setModal({ type: 'reveal' })} data-testid="reveal">
                    Reveal contact details
                  </Button>
                )}
                <div className="mt-5 border-t border-gray-100 pt-4">
                  <KeyValue
                    items={[
                      ['City', u.city || '—'],
                      ['Password changed', u.passwordChangedAt ? formatRelative(u.passwordChangedAt) : '—'],
                      ['Active sessions', p.sessions.length],
                      ['Posts / listings / services', `${p.counts.posts} / ${p.counts.propertyListings + p.counts.marketListings} / ${p.counts.serviceOffers ?? 0}`],
                    ]}
                  />
                </div>
              </Card>
              <div className="col-span-12 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:col-span-7">
                <MetricCard tone="purple" label="Memberships" value={p.memberships.length} footer={`${p.memberships.filter((m) => m.status === 'approved').length} approved`} icon="fa-solid fa-house-user" />
                <MetricCard tone="cyan" label="Complaints" value={p.complaints.length} footer={`${p.complaints.filter((c) => ['pending', 'assigned', 'in_progress'].includes(c.status)).length} open`} icon="fa-solid fa-screwdriver-wrench" />
                <MetricCard tone="green" label="Paid (recent)" value={formatINR(paidPaise, { whole: true })} footer={`${p.payments.length} payments`} icon="fa-solid fa-indian-rupee-sign" />
                <MetricCard tone="orange" label="Dues on their flats" value={formatINR(duePaise, { whole: true })} footer={`${p.invoices.length} invoices`} icon="fa-solid fa-hourglass-half" />
              </div>
            </div>

            <Card title="Memberships & flats" padded={false} className="mb-6">
              <DataTable testId="profile-memberships" columns={membershipCols} rows={p.memberships} empty={<EmptyState compact icon="fa-solid fa-house-user" title="No society memberships" />} />
            </Card>

            {p.staff.length > 0 && (
              <Card title="Society staff roles" padded={false} className="mb-6">
                <DataTable
                  columns={[
                    { key: 's', header: 'Society', render: (s) => <Link className="link" to={`/admin/societies/${s.society?._id}`}>{s.society?.name}</Link> },
                    { key: 'r', header: 'Role', render: (s) => <Badge tone={s.role === 'admin' ? 'purple' : 'info'}>{ROLE_LABELS[s.role] || s.role}</Badge> },
                    { key: 'st', header: 'Access', render: (s) => <Badge status={s.status} /> },
                  ]}
                  rows={p.staff}
                />
              </Card>
            )}

            <Tabs
              className="mb-4"
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'activity', label: 'Audit trail', count: p.audit.length },
                { value: 'complaints', label: 'Complaints', count: p.complaints.length },
                { value: 'money', label: 'Invoices & payments' },
                { value: 'bookings', label: 'Bookings', count: p.bookings.length },
                { value: 'sessions', label: 'Sessions', count: p.sessions.length },
                { value: 'notifications', label: 'Notifications', count: p.notifications.length },
              ]}
            />
            <div className="card overflow-hidden">{activity[tab]}</div>

            <ReasonDialog open={modal?.type === 'reveal'} onClose={() => setModal(null)} onSubmit={(r) => reveal(r)} busy={revealing} tone="primary" title="Reveal contact details" confirmLabel="Reveal" message="Personal data is masked by default. Your reason is saved in the audit log (who viewed whose data, when and why)." />
            <ReasonDialog open={modal?.type === 'signout'} onClose={() => setModal(null)} onSubmit={(r) => signOut(r)} busy={signingOut} title="Sign out on every device" confirmLabel="Sign out everywhere" message="The member must sign in again on the app and any panel." />
            <ReasonDialog open={modal?.type === 'disable'} onClose={() => setModal(null)} onSubmit={(r) => setStatus('disabled', r)} busy={settingStatus} title={`Disable ${u.name || 'account'}`} confirmLabel="Disable account" message="They are signed out everywhere and can’t sign in until re-enabled." />
            <ReasonDialog open={modal?.type === 'decide'} onClose={() => setModal(null)} onSubmit={(r) => decide(r)} busy={deciding} tone={['approve'].includes(modal?.action) ? 'primary' : 'danger'} title={`${modal?.label || ''} membership`} confirmLabel={modal?.label} message={`${modal?.m?.society?.name || ''} · ${[modal?.m?.building?.name, modal?.m?.flat?.number].filter(Boolean).join(' ')}. The member is notified.`} />
            <SetPasswordModal open={modal?.type === 'password'} onClose={() => setModal(null)} user={u} onDone={done} />
            <ChangePhoneModal open={modal?.type === 'phone'} onClose={() => setModal(null)} user={u} onDone={done} />
            <MoveMembershipModal open={modal?.type === 'move'} onClose={() => setModal(null)} membership={modal?.m} onDone={done} />
          </div>
        );
      }}
    </QueryState>
  );
}
