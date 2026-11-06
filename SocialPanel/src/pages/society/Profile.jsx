import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction, useQuery } from '../../lib/hooks.js';
import { formatDate } from '../../lib/format.js';
import { contactPhoneRule, emailRule, maxLen, minLen, normalizePhone, pinRule, req, runRules } from '../../lib/validation.js';
import { noPermissionReason } from '../../lib/roles.js';
import { Alert, Badge, Button, Card, CopyField, PageHeader, PageSkeleton, QueryState } from '../../components/ui.jsx';
import { Field, Input, Select, Textarea, Toggle } from '../../components/Form.jsx';
import { BillingSettingsForm } from '../../components/BillingSettings.jsx';
import { useToast } from '../../components/Toast.jsx';
import { INDIAN_STATES } from '../../lib/india.js';

function ProfileForm({ society, canEdit, reason, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    setV({ name: society.name || '', phone: society.phone || '', email: society.email || '', addressLine: society.addressLine || '', area: society.area || '', city: society.city || '', state: society.state || '', pincode: society.pincode || '', description: society.description || '' });
  }, [society]);
  const [save, busy] = useAction(
    () =>
      api.patch('/society/profile', {
        name: v.name.trim(),
        phone: v.phone ? normalizePhone(v.phone) : undefined,
        email: v.email.trim().toLowerCase() || undefined,
        addressLine: v.addressLine.trim(),
        area: v.area.trim(),
        city: v.city.trim(),
        state: v.state,
        pincode: v.pincode.trim() || undefined,
        description: v.description.trim(),
      }),
    { toast, success: 'Society profile saved', onDone: onSaved },
  );
  const submit = (e) => {
    e.preventDefault();
    const errs = runRules(v, { name: [req('Enter the society name'), minLen(3), maxLen(160)], phone: [contactPhoneRule()], email: [emailRule()], pincode: [pinRule()], addressLine: [maxLen(300)], description: [maxLen(2000)] });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  const F = (k, label, props = {}) => (
    <Field label={label} error={errors[k]} className={props.wide ? 'sm:col-span-2' : ''}>
      <Input name={k} value={v[k] ?? ''} onChange={set(k)} invalid={Boolean(errors[k])} {...props} wide={undefined} />
    </Field>
  );
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {!canEdit && <Alert tone="info">{reason} Only society admins can edit the profile.</Alert>}
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {F('name', 'Society name', { wide: true })}
          {F('phone', 'Contact number', { prefix: '+91', inputMode: 'tel', maxLength: 14 })}
          {F('email', 'Email', { type: 'email' })}
          {F('addressLine', 'Street address', { wide: true })}
          {F('area', 'Area / locality')}
          {F('city', 'City')}
          <Field label="State">
            <Select name="state" value={v.state || ''} onChange={set('state')}>
              <option value="">Select state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          {F('pincode', 'PIN code', { inputMode: 'numeric', maxLength: 6 })}
        </div>
        <Field label="About the society" error={errors.description}>
          <Textarea name="description" rows={3} maxLength={2000} value={v.description || ''} onChange={set('description')} />
        </Field>
        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" loading={busy} icon="fa-regular fa-floppy-disk">
              Save profile
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

function SettingsForm({ society, canEdit, onSaved }) {
  const toast = useToast();
  const [s, setS] = useState(society.settings || {});
  useEffect(() => setS(society.settings || {}), [society]);
  const [save, busy] = useAction((next) => api.patch('/society/profile', { settings: next }), { toast, success: 'Setting updated', onDone: onSaved });
  const toggle = async (k, val) => {
    const next = { listingsRequireApproval: Boolean(s.listingsRequireApproval), bookingsRequireApproval: Boolean(s.bookingsRequireApproval), [k]: val };
    setS(next);
    const ok = await save(next);
    if (!ok) setS(society.settings || {});
  };
  return (
    <div className="space-y-5">
      <Toggle label="Listings need approval" description="Marketplace listings linked to the society wait for moderation before residents see them. Property and service listings from vendors are reviewed by the platform." checked={Boolean(s.listingsRequireApproval)} disabled={!canEdit || busy} onChange={(x) => toggle('listingsRequireApproval', x)} />
      <Toggle label="Facility bookings need approval" description="Applies on top of each facility’s own setting." checked={Boolean(s.bookingsRequireApproval)} disabled={!canEdit || busy} onChange={(x) => toggle('bookingsRequireApproval', x)} />
    </div>
  );
}

export default function Profile() {
  const { can, role } = useAuth();
  const q = useQuery(() => api.get('/society/profile'), []);
  const canEdit = can('society.manage');
  const canFinance = can('finance');
  return (
    <QueryState query={q} skeleton={<PageSkeleton rows={8} />}>
      {(s) => (
        <div>
          <PageHeader title="Society settings" subtitle="Profile, preferences and billing configuration" />
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 space-y-6 xl:col-span-8">
              <Card title="Society profile">
                <ProfileForm society={s} canEdit={canEdit} reason={canEdit ? null : noPermissionReason(role)} onSaved={q.reload} />
              </Card>
              <Card title="Billing settings">
                <BillingSettingsForm billing={s.billing} canEdit={canFinance} reason={`${noPermissionReason(role)}. Only the admin and treasurer can change billing settings.`} onSaved={q.reload} />
              </Card>
            </div>
            <div className="col-span-12 space-y-6 xl:col-span-4">
              <Card title="Society code">
                <p className="mb-3 text-xs leading-relaxed text-gray-600">Residents search for this code in the adda app to join your society.</p>
                <CopyField value={s.code} />
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-gray-500">Status</span>
                  <Badge status={s.status} />
                </div>
                {s.status === 'suspended' && s.suspendedReason && <p className="mt-2 text-[11px] text-rose-500">Reason: {s.suspendedReason}</p>}
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-gray-500">On adda since</span>
                  <span className="font-medium text-gray-700">{formatDate(s.createdAt)}</span>
                </div>
              </Card>
              <Card title="Preferences">
                <SettingsForm society={s} canEdit={canEdit} onSaved={q.reload} />
              </Card>
              <Card title="Online payments">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Online collection</span>
                  <Badge tone={s.payments?.onlineEnabled ? 'success' : 'neutral'}>{s.payments?.onlineEnabled ? 'Enabled' : 'Not enabled'}</Badge>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-azea-muted">Online payments are switched on by the adda platform team after they verify where your society’s money is settled. Until then, record payments offline in Billing.</p>
              </Card>
            </div>
          </div>
        </div>
      )}
    </QueryState>
  );
}
