import { useEffect, useRef, useState } from 'react';
import { api, mediaHref } from '../../lib/api.js';
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
import { checkLogoFile } from '../../lib/branding.js';
import { locationPayload, sameLocation } from '../../lib/location.js';
import { LocationPicker } from '../../components/LocationPicker.jsx';
import { SocietyLogo } from '../../components/SocietyBrand.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';

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

function LogoForm({ society, canEdit, onSaved }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [upload, uploading] = useAction(async (file) => {
    try {
      const media = await api.upload('/uploads', file, { purpose: 'society_logo' });
      await api.patch('/society/profile', { logoId: media._id });
      toast.success('Logo updated');
      await onSaved();
    } catch (err) {
      setError(err?.message || 'Couldn’t upload the logo. Please try again.');
    }
  });
  const [remove, removing] = useAction(async () => {
    try {
      await api.patch('/society/profile', { logoId: null });
      toast.success('Logo removed');
      setConfirm(false);
      await onSaved();
    } catch (err) {
      setError(err?.message || 'Couldn’t remove the logo.');
      setConfirm(false);
    }
  });
  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = checkLogoFile(file);
    setError(problem);
    if (!problem) upload(file);
  };
  const busy = uploading || removing;
  const url = society.logo?.url;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          {url ? (
            <img src={mediaHref(url)} alt={`${society.name} logo`} className="h-24 w-24 rounded-xl border border-gray-100 bg-white object-cover shadow-sm" data-testid="logo-preview" />
          ) : (
            <SocietyLogo name={society.name} size={96} className="rounded-xl" />
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-azea-purple border-r-transparent" role="status" aria-label="Saving logo" />
            </span>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] leading-relaxed text-azea-muted">Shown in this portal’s sidebar for everyone on your team. Square images look best. PNG, JPG or WEBP, up to 2 MB.</p>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon="fa-solid fa-upload" loading={uploading} disabled={removing} onClick={() => inputRef.current?.click()} data-testid="logo-upload">
                {url ? 'Replace' : 'Upload logo'}
              </Button>
              {url && (
                <Button size="sm" variant="danger-outline" icon="fa-regular fa-trash-can" disabled={busy} onClick={() => setConfirm(true)} data-testid="logo-remove">
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" onChange={pick} data-testid="logo-input" />
      {error && (
        <p className="text-[11px] font-medium text-rose-500" role="alert" data-testid="logo-error">
          {error}
        </p>
      )}
      {!canEdit && <p className="text-[11px] text-azea-muted">Only society admins can change the logo.</p>}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => remove()} busy={removing} title="Remove the logo?" confirmLabel="Remove" message="The sidebar shows your society’s initials instead. You can upload a new logo any time." />
    </div>
  );
}

function LocationForm({ society, canEdit, onSaved }) {
  const toast = useToast();
  const [loc, setLoc] = useState(society.location || null);
  useEffect(() => setLoc(society.location || null), [society]);
  const dirty = !sameLocation(loc, society.location || null);
  const [save, busy] = useAction(() => api.patch('/society/profile', { location: locationPayload(loc) }), { toast, success: () => (loc ? 'Location saved' : 'Location cleared'), onDone: onSaved });
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-gray-600">Pin your society’s gate on the map. It helps members and service providers find you and lets members see nearby services.</p>
      <LocationPicker value={loc} onChange={setLoc} disabled={!canEdit || busy} />
      {canEdit ? (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {dirty && (
            <Button variant="secondary" disabled={busy} onClick={() => setLoc(society.location || null)}>
              Discard changes
            </Button>
          )}
          <Button icon="fa-regular fa-floppy-disk" loading={busy} disabled={!dirty} onClick={() => save()} data-testid="location-save">
            {loc || !society.location ? 'Save location' : 'Save (remove location)'}
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-azea-muted">Only society admins can change the location.</p>
      )}
    </div>
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
  const { can, role, refreshProfile } = useAuth();
  const q = useQuery(() => api.get('/society/profile'), []);
  // Name or logo changes show in the sidebar header: re-read /me after saving.
  const onBrandSaved = async () => {
    await q.reload();
    await refreshProfile();
  };
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
                <ProfileForm society={s} canEdit={canEdit} reason={canEdit ? null : noPermissionReason(role)} onSaved={onBrandSaved} />
              </Card>
              <Card title="Location on the map">
                <LocationForm society={s} canEdit={canEdit} onSaved={q.reload} />
              </Card>
              <Card title="Billing settings">
                <BillingSettingsForm billing={s.billing} canEdit={canFinance} reason={`${noPermissionReason(role)}. Only the admin and treasurer can change billing settings.`} onSaved={q.reload} />
              </Card>
            </div>
            <div className="col-span-12 space-y-6 xl:col-span-4">
              <Card title="Logo">
                <LogoForm society={s} canEdit={canEdit} onSaved={onBrandSaved} />
              </Card>
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
