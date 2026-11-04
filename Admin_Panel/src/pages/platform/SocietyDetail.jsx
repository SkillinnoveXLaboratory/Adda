import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../../lib/auth.jsx';
import { api } from '../../lib/api.js';
import { useAction, useQuery } from '../../lib/hooks.js';
import { formatDate, formatINR, formatNumber, formatPhone, formatRelative } from '../../lib/format.js';
import { emailRule, maxLen, minLen, normalizePhone, phoneRule, req, runRules } from '../../lib/validation.js';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../lib/roles.js';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Icon, KeyValue, PageHeader, PageSkeleton, QueryState } from '../../components/ui.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { Field, Input, Select, Toggle } from '../../components/Form.jsx';
import { ConfirmDialog, Modal, ReasonDialog } from '../../components/Modal.jsx';
import { MetricCard } from '../../components/Charts.jsx';
import { useToast } from '../../components/Toast.jsx';
import { SetupLinkModal } from '../../components/SetupLinkModal.jsx';

function PaymentsConfig({ society, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [error, setError] = useState(null);
  useEffect(() => {
    setV({ onlineEnabled: Boolean(society.payments?.onlineEnabled), settlementMode: society.payments?.settlementMode || 'none', linkedAccountId: society.payments?.linkedAccountId || '' });
  }, [society]);
  const [save, busy] = useAction(() => api.patch(`/platform/societies/${society._id}/payments`, { onlineEnabled: v.onlineEnabled, settlementMode: v.settlementMode, linkedAccountId: v.linkedAccountId.trim() || undefined }), { toast, success: 'Online payment settings saved', onDone: onSaved });
  const submit = (e) => {
    e.preventDefault();
    if (v.onlineEnabled && v.settlementMode === 'none') return setError('Choose a verified settlement mode before enabling online collection');
    if (v.settlementMode === 'razorpay_route' && !/^acc_[A-Za-z0-9]+$/.test(v.linkedAccountId.trim())) return setError('Razorpay Route needs the society’s linked account id (acc_…)');
    setError(null);
    save();
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-xs leading-relaxed text-gray-600">
        Residents can pay maintenance online only when (1) the server has payment-gateway keys configured, and (2) you have verified where this society’s money settles and enabled it here. Until then residents see “online payment unavailable” and the society records payments offline.
      </p>
      <Toggle label="Enable online collection" description="Turn on only after verifying the society’s bank / Razorpay account." checked={v.onlineEnabled} onChange={(x) => (setV({ ...v, onlineEnabled: x }), setError(null))} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Settlement mode">
          <Select value={v.settlementMode || 'none'} onChange={(e) => (setV({ ...v, settlementMode: e.target.value }), setError(null))}>
            <option value="none">None (not verified)</option>
            <option value="razorpay_route">Razorpay Route (linked account)</option>
            <option value="society_merchant">Society’s own merchant account</option>
          </Select>
        </Field>
        {v.settlementMode === 'razorpay_route' && (
          <Field label="Linked account id">
            <Input value={v.linkedAccountId || ''} onChange={(e) => (setV({ ...v, linkedAccountId: e.target.value }), setError(null))} placeholder="acc_XXXXXXXXXXXX" className="font-mono" />
          </Field>
        )}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {society.payments?.verifiedAt && (
        <p className="text-[11px] text-brand-muted">
          Last changed {formatRelative(society.payments.verifiedAt)}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={busy} icon="fa-regular fa-floppy-disk">
          Save payment settings
        </Button>
      </div>
    </form>
  );
}

function AddAdminModal({ open, onClose, societyId, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({ name: '', email: '', phone: '', role: 'admin' });
      setErrors({});
    }
  }, [open]);
  const [save, busy] = useAction(() => api.post(`/platform/societies/${societyId}/admins`, { name: v.name.trim(), email: v.email.trim().toLowerCase(), phone: v.phone ? normalizePhone(v.phone) : undefined, role: v.role }), { toast, success: 'Staff member added', onDone: (r) => onDone(r, v.email.trim().toLowerCase()) });
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, { name: [req('Enter the name'), minLen(2), maxLen(120)], email: [req('Enter the email'), emailRule()], phone: [phoneRule()] });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Add society admin / staff" icon="fa-solid fa-user-plus" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy}>Add</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>
            <Input name="name" value={v.name || ''} onChange={set('name')} invalid={Boolean(errors.name)} />
          </Field>
          <Field label="Email" required error={errors.email}>
            <Input name="email" type="email" value={v.email || ''} onChange={set('email')} invalid={Boolean(errors.email)} />
          </Field>
          <Field label="Mobile" error={errors.phone}>
            <Input name="phone" prefix="+91" value={v.phone || ''} onChange={set('phone')} invalid={Boolean(errors.phone)} maxLength={14} />
          </Field>
          <Field label="Role">
            <Select name="role" value={v.role || 'admin'} onChange={set('role')}>
              {Object.keys(ROLE_LABELS).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="rounded-lg bg-brand-bg px-3 py-2 text-[11px] text-gray-600">{ROLE_DESCRIPTIONS[v.role || 'admin']}</p>
      </form>
    </Modal>
  );
}

/** Society 360°: each tile opens the society workspace on that module. */
const WORKSPACE = [
  ['', 'Overview', 'fa-solid fa-gauge-high'],
  ['residents', 'Residents', 'fa-solid fa-user-group'],
  ['structure', 'Buildings & flats', 'fa-regular fa-building'],
  ['billing', 'Billing', 'fa-solid fa-file-invoice'],
  ['payments', 'Payments', 'fa-solid fa-indian-rupee-sign'],
  ['ledger', 'Ledger', 'fa-solid fa-book'],
  ['complaints', 'Complaints', 'fa-solid fa-screwdriver-wrench'],
  ['community', 'Community', 'fa-regular fa-comments'],
  ['facilities', 'Bookings', 'fa-regular fa-calendar-check'],
  ['services', 'Services', 'fa-solid fa-toolbox'],
  ['reports', 'Reports', 'fa-regular fa-chart-bar'],
  ['audit', 'Audit', 'fa-solid fa-clock-rotate-left'],
];

export default function SocietyDetail() {
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const { enterSociety } = useAuth();
  const q = useQuery(() => api.get(`/platform/societies/${id}`), [id]);
  const [modal, setModal] = useState(null);
  const [suspend, suspending] = useAction((reason) => api.post(`/platform/societies/${id}/suspend`, { reason }), { toast, success: 'Society suspended', onDone: () => (setModal(null), q.reload()) });
  const [reactivate, reactivating] = useAction(() => api.post(`/platform/societies/${id}/reactivate`, {}), { toast, success: 'Society reactivated', onDone: () => (setModal(null), q.reload()) });
  const [reset, resetting] = useAction(() => api.post(`/platform/staff/${modal.item._id}/reset-link`), { toast, onDone: (r) => setModal({ type: 'link', email: modal.item.user?.email, link: r.setupLink, emailed: false, hours: r.expiresInHours || 24 }) });

  return (
    <QueryState query={q} skeleton={<PageSkeleton cards={3} rows={6} />}>
      {(s) => {
        const fs = s.financeSummary || {};
        const open = (section = '') => (enterSociety(s), navigate(`/society${section ? `/${section}` : ''}`));
        const staffCols = [
          { key: 'name', header: 'Name', render: (st) => <div className="flex items-center gap-3"><Avatar name={st.user?.name} size="sm" /><div><Link to={`/admin/members/${st.user?._id}`} className="link">{st.user?.name}</Link><p className="text-[11px] text-gray-400">{[st.user?.email, st.user?.phone && formatPhone(st.user.phone)].filter(Boolean).join(' · ')}</p></div></div> },
          { key: 'role', header: 'Role', render: (st) => <Badge tone={st.role === 'admin' ? 'purple' : 'info'}>{ROLE_LABELS[st.role]}</Badge> },
          { key: 'status', header: 'Access', render: (st) => (st.status === 'disabled' ? <Badge status="disabled" /> : st.user?.status === 'pending_setup' ? <Badge tone="warning">Setup pending</Badge> : st.user?.status === 'disabled' ? <Badge status="disabled">Account disabled</Badge> : <Badge status="active" />) },
          { key: 'last', header: 'Last sign-in', render: (st) => (st.user?.lastLoginAt ? formatRelative(st.user.lastLoginAt) : <span className="text-gray-300">Never</span>) },
          { key: 'actions', header: '', align: 'right', render: (st) => <Button size="xs" variant="outline" icon="fa-solid fa-key" onClick={() => setModal({ type: 'reset', item: st })}>Reset link</Button> },
        ];
        return (
          <div>
            <PageHeader
              back={
                <Link to="/admin/societies" className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-brand">
                  <Icon name="fa-solid fa-arrow-left" /> Societies
                </Link>
              }
              title={s.name}
              subtitle={`${s.code} · ${[s.area, s.city, s.state].filter(Boolean).join(', ')}`}
              actions={
                <>
                  <Button icon="fa-solid fa-arrow-right-to-bracket" onClick={() => open()} data-testid="open-workspace">
                    Open workspace
                  </Button>
                  <Button variant="outline" icon="fa-solid fa-user-plus" onClick={() => setModal({ type: 'admin' })}>
                    Add admin
                  </Button>
                  {s.status === 'active' ? (
                    <Button variant="danger" icon="fa-solid fa-ban" onClick={() => setModal({ type: 'suspend' })} data-testid="suspend-society">
                      Suspend
                    </Button>
                  ) : (
                    <Button variant="success" icon="fa-solid fa-play" onClick={() => setModal({ type: 'reactivate' })} data-testid="reactivate-society">
                      Reactivate
                    </Button>
                  )}
                </>
              }
            />
            {s.status === 'suspended' && (
              <Alert tone="danger" className="mb-5" title="Suspended">
                {s.suspendedReason || 'No reason recorded.'} Staff can view records but can’t make changes; residents can’t use society features.
              </Alert>
            )}
            <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard tone="purple" label="Residents" value={formatNumber(s.residentCount)} footer={`${formatNumber(s.staff?.length || 0)} staff accounts`} footerIcon="fa-solid fa-user-shield" icon="fa-solid fa-user-group" />
              <MetricCard tone="cyan" label="Invoices" value={formatNumber(fs.invoices || 0)} footer="Raised to date" footerIcon="fa-solid fa-file-invoice" icon="fa-solid fa-file-invoice" />
              <MetricCard tone="green" label="Collected" value={formatINR(fs.collectedPaise || 0, { whole: true })} title={formatINR(fs.collectedPaise || 0)} footer={fs.billedPaise ? `${Math.round(((fs.collectedPaise || 0) / fs.billedPaise) * 100)}% of billed` : 'Nothing billed yet'} footerIcon="fa-solid fa-chart-line" icon="fa-solid fa-indian-rupee-sign" />
              <MetricCard tone="orange" label="Outstanding" value={formatINR((fs.billedPaise || 0) - (fs.collectedPaise || 0), { whole: true })} footer={`Billed ${formatINR(fs.billedPaise || 0, { whole: true })}`} footerIcon="fa-solid fa-hourglass-half" icon="fa-solid fa-hourglass-half" />
            </div>
            <Card title="Manage this society" className="mb-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="workspace-tiles">
                {WORKSPACE.map(([section, label, icon]) => (
                  <button key={label} type="button" onClick={() => open(section)} className="flex flex-col items-center gap-2 rounded-lg border border-gray-100 px-2 py-3 text-center text-xs font-semibold text-gray-600 transition-colors hover:border-brand/40 hover:bg-brand-light hover:text-brand">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-brand">
                      <Icon name={icon} className="text-sm" />
                    </span>
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-brand-muted">Opens the same screens the society admin uses, for this society. Every change asks you for a reason and is logged.</p>
            </Card>
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 space-y-6 xl:col-span-8">
                <Card title="Staff" padded={false}>
                  <DataTable columns={staffCols} rows={s.staff} empty={<EmptyState compact icon="fa-solid fa-user-shield" title="No staff" action={<Button size="xs" onClick={() => setModal({ type: 'admin' })}>Add admin</Button>} />} />
                </Card>
                <Card title="Online payments">
                  <PaymentsConfig society={s} onSaved={q.reload} />
                </Card>
              </div>
              <Card className="col-span-12 self-start xl:col-span-4" title="Profile">
                <KeyValue
                  cols={1}
                  items={[
                    ['Status', <Badge key="s" status={s.status} />],
                    ['Address', [s.addressLine, s.area, s.city, s.state, s.pincode].filter(Boolean).join(', ')],
                    ['Phone', formatPhone(s.phone)],
                    ['Email', s.email],
                    ['Joined', formatDate(s.createdAt)],
                    ['Listings need approval', s.settings?.listingsRequireApproval ? 'Yes' : 'No'],
                    ['Bookings need approval', s.settings?.bookingsRequireApproval ? 'Yes' : 'No'],
                  ]}
                />
              </Card>
            </div>
            <ReasonDialog open={modal?.type === 'suspend'} onClose={() => setModal(null)} onSubmit={(r) => suspend(r)} busy={suspending} title={`Suspend ${s.name}`} confirmLabel="Suspend society" message="Staff keep read-only access; all changes and resident features are blocked until you reactivate it." />
            <ConfirmDialog open={modal?.type === 'reactivate'} onClose={() => setModal(null)} onConfirm={() => reactivate()} busy={reactivating} tone="primary" title={`Reactivate ${s.name}`} confirmLabel="Reactivate" message="Staff and residents regain full access." />
            <ConfirmDialog open={modal?.type === 'reset'} onClose={() => setModal(null)} onConfirm={() => reset()} busy={resetting} tone="danger" title="Issue password reset link" confirmLabel="Issue link" message={`${modal?.item?.user?.name} will be signed out everywhere and gets a link (valid 24 hours) to set a new password.`} />
            <AddAdminModal open={modal?.type === 'admin'} societyId={id} onClose={() => setModal(null)} onDone={(r, email) => (q.reload(), setModal({ type: 'link', email, link: r.setupLink, emailed: r.emailed }))} />
            <SetupLinkModal open={modal?.type === 'link'} onClose={() => setModal(null)} email={modal?.email} link={modal?.link} emailed={modal?.emailed} hours={modal?.hours || 72} />
          </div>
        );
      }}
    </QueryState>
  );
}
