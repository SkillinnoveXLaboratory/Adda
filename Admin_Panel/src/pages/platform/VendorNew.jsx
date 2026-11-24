import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../lib/api.js';
import { parseRate } from '../../lib/pricing.js';
import { focusFirstError } from '../../lib/validation.js';
import { emptyKyc, emptyVendor, serverErrors, vendorPayload } from '../../lib/vendorOnboarding.js';
import { Alert, Button, Card, Icon, PageHeader } from '../../components/ui.jsx';
import { Field, Input, Toggle } from '../../components/Form.jsx';
import { PasswordFields } from '../../components/PasswordFields.jsx';
import { PricingExample } from '../../components/VendorPricing.jsx';
import { KycDetailsForm } from '../../components/KycDetailsForm.jsx';
import { LocationFields } from '../../components/LocationFields.jsx';
import { UploadTile } from '../../components/UploadTile.jsx';
import { useToast } from '../../components/Toast.jsx';

function Section({ step, title, subtitle, children, actions }) {
  return (
    <Card
      className="mb-6"
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-light text-[10px] font-bold text-brand">{step}</span>
          {title}
        </span>
      }
      actions={actions}
    >
      {subtitle && <p className="-mt-1 mb-4 text-[11px] leading-relaxed text-brand-muted">{subtitle}</p>}
      {children}
    </Card>
  );
}

/**
 * Master Admin → Vendors → Add vendor (vendors.manage). POST /platform/vendors with account, shop, rates and,
 * optionally, KYC typed on the vendor's behalf (skills/admin-vendor-onboarding).
 */
export default function VendorNew() {
  const navigate = useNavigate();
  const toast = useToast();
  const ids = { name: useId(), phone: useId(), email: useId(), shop: useId(), c: useId(), d: useId() };
  const [v, setV] = useState(emptyVendor);
  const [kycOn, setKycOn] = useState(false);
  const [kyc, setKyc] = useState(emptyKyc);
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState(null);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);

  const clear = (keys) => setErrors((e) => (keys.some((k) => e[k]) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e));
  const set = (patch) => (setV((x) => ({ ...x, ...patch })), clear(Object.keys(patch)));
  const setK = (k, val) => (setKyc((x) => ({ ...x, [k]: val })), clear([k, ...(['panPhoto', 'aadhaarFront', 'aadhaarBack'].includes(k) ? ['documents'] : [])]));
  const bind = (k) => ({ name: k, value: v[k], onChange: (e) => set({ [k]: e.target.value }), invalid: Boolean(errors[k]) });
  const onBusyChange = (b) => setUploading((n) => Math.max(0, n + (b ? 1 : -1)));
  const toggleKyc = (on) => {
    setKycOn(on);
    if (!on) setKyc(emptyKyc()); // don't keep typed PAN / Aadhaar / account around once the section is closed
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy || uploading) return;
    setGeneral(null);
    const { errors: errs, body } = vendorPayload(v, kycOn ? kyc : null);
    setErrors(errs);
    if (!body) {
      setTimeout(() => focusFirstError(errs), 0);
      return;
    }
    setBusy(true);
    try {
      const r = await api.post('/platform/vendors', body);
      setKyc(emptyKyc());
      toast.success(`${r.name} added as a vendor${body.kyc ? (r.profile?.kycStatus === 'approved' ? ' · KYC approved' : ' · KYC waiting for review') : ''}`);
      if (r.passwordLoginEnabled === false) toast.info('App password sign-in is turned off on the server, so the vendor can’t sign in with this password until it is turned on.', 9000);
      navigate(`/admin/vendors/${r._id}`, { state: { created: true, passwordLoginEnabled: r.passwordLoginEnabled } });
    } catch (err) {
      const { fields, general: msg } = serverErrors(err);
      setErrors(fields);
      setGeneral(msg);
      if (Object.keys(fields).length) setTimeout(() => focusFirstError(fields), 0);
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  const errorCount = Object.keys(errors).length;
  return (
    <form onSubmit={submit} noValidate data-testid="vendor-new" className="mx-auto max-w-4xl">
      <PageHeader
        back={
          <Link to="/admin/vendors" className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-brand">
            <Icon name="fa-solid fa-arrow-left" /> Vendors
          </Link>
        }
        title="Add vendor"
        subtitle="Create a vendor account for someone who can’t sign up themselves. Every vendor you add is recorded with your name."
      />
      {general && (
        <Alert tone="danger" className="mb-5" title="The vendor was not added">
          {general}
        </Alert>
      )}

      <Section step="1" title="Account" subtitle="The vendor signs in to the NIVASA app with this mobile number and password, choosing “Vendor” on the sign-in screen. Share the password with them privately.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" required htmlFor={ids.name} error={errors.name}>
            <Input id={ids.name} {...bind('name')} maxLength={120} autoComplete="off" placeholder="e.g. Priya Sen" data-testid="vendor-name" />
          </Field>
          <Field label="Mobile number" required htmlFor={ids.phone} error={errors.phone} hint="10 digits, starts with 6, 7, 8 or 9">
            <Input id={ids.phone} {...bind('phone')} prefix="+91" inputMode="tel" maxLength={14} autoComplete="off" placeholder="98765 43210" data-testid="vendor-phone" />
          </Field>
          <Field label="Email" required htmlFor={ids.email} error={errors.email} hint="Needed for Cashfree payouts" className="sm:col-span-2">
            <Input id={ids.email} type="email" {...bind('email')} maxLength={200} autoComplete="off" placeholder="name@example.com" data-testid="vendor-email" />
          </Field>
        </div>
        <div className="mt-4">
          <PasswordFields password={v.password} confirm={v.confirm} onPassword={(x) => set({ password: x })} onConfirm={(x) => set({ confirm: x })} errors={errors} />
        </div>
      </Section>

      <Section step="2" title="Shop" subtitle="Optional — the vendor can change all of this later in the app (Shop settings).">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Shop name" htmlFor={ids.shop} error={errors.shopName} hint="Shown to members with the vendor’s services and products">
            <Input id={ids.shop} {...bind('shopName')} maxLength={80} placeholder="e.g. Sen Electricals" data-testid="vendor-shop-name" />
          </Field>
          <UploadTile label="Shop logo" name="logo" purpose="vendor_logo" allowPdf={false} value={v.logo} onChange={(x) => set({ logo: x })} error={errors.logo} onBusyChange={onBusyChange} testId="vendor-logo" />
        </div>
        <div className="mt-5 border-t border-gray-100 pt-5">
          <p className="form-label">Shop location</p>
          <LocationFields value={{ lat: v.lat, lng: v.lng, label: v.label }} onChange={set} errors={errors} />
        </div>
      </Section>

      <Section step="3" title="NIVASA rates" subtitle="Members see and pay the vendor’s own prices. NIVASA’s commission is taken out of the vendor’s share; the member discount is a share of that commission, paid by NIVASA. You can change both later on the vendor page.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="NIVASA commission (%)" htmlFor={ids.c} error={errors.commissionPercent} hint="0 to 100, up to 2 decimals — e.g. 20">
            <Input id={ids.c} {...bind('commissionPercent')} inputMode="decimal" maxLength={6} placeholder="20" suffix="%" data-testid="vendor-commission" />
          </Field>
          <Field label="Member discount (% of commission)" htmlFor={ids.d} error={errors.memberDiscountPercent} hint="0 to 100 — 0 = no discount">
            <Input id={ids.d} {...bind('memberDiscountPercent')} inputMode="decimal" maxLength={6} placeholder="50" suffix="%" data-testid="vendor-discount" />
          </Field>
        </div>
        <div className="mt-4">
          <PricingExample commissionPercent={parseRate(v.commissionPercent)} memberDiscountPercent={parseRate(v.memberDiscountPercent)} />
        </div>
      </Section>

      <Section step="4" title="KYC & Cashfree payout details" subtitle="Optional. Without KYC the vendor can sign in but can’t list services or products until they submit it in the app (or you add it later from the vendor page).">
        <Toggle checked={kycOn} onChange={toggleKyc} name="kycOn" label="Add KYC now" description="PAN, Aadhaar, bank account and the three document photos the vendor gave you." />
        {kycOn && (
          <div className="mt-5 border-t border-gray-100 pt-5">
            <KycDetailsForm value={kyc} onChange={setK} errors={errors} onBusyChange={onBusyChange} />
          </div>
        )}
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-2 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-end sm:rounded-xl sm:border">
        {errorCount > 0 && (
          <p className="mr-auto text-[11px] font-medium text-rose-500" role="status">
            {errorCount === 1 ? '1 field needs attention' : `${errorCount} fields need attention`}
          </p>
        )}
        <Button variant="ghost" onClick={() => navigate('/admin/vendors')} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" icon="fa-solid fa-user-plus" loading={busy} disabledReason={uploading ? 'Wait for the upload to finish' : null} data-testid="vendor-create">
          {kycOn && kyc.approve ? 'Add vendor & approve KYC' : 'Add vendor'}
        </Button>
      </div>
    </form>
  );
}
