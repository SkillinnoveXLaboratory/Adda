import { useId } from 'react';
import { CF_LINES_OF_BUSINESS, KYC_DOC_FIELDS, lineOfBusinessLabel } from '../lib/vendorOnboarding.js';
import { Alert, Icon } from './ui.jsx';
import { Field, Input, Select, Textarea } from './Form.jsx';
import { UploadTile } from './UploadTile.jsx';

function SubHeading({ children }) {
  return <h3 className="mb-3 mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{children}</h3>;
}

/** Text input bound to one KYC field. */
function KycInput({ k, label, hint, required = true, value, errors, set, className = '', ...rest }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={errors[k]} required={required} htmlFor={id} className={className}>
      <Input id={id} name={k} value={value[k] ?? ''} onChange={(e) => set(k, e.target.value)} invalid={Boolean(errors[k])} autoComplete="off" spellCheck={false} data-testid={`kyc-${k}`} {...rest} />
    </Field>
  );
}

/**
 * KYC + Cashfree split details typed by an admin on the vendor's behalf (same rules as the vendor's own form).
 * Controlled: `value` (see emptyKyc), `onChange(key, val)`, `errors` keyed by field. Used by "Add vendor" and by
 * "Enter / edit KYC details" on the vendor page. Full numbers live only in this form's state until submit.
 */
export function KycDetailsForm({ value, onChange, errors = {}, onBusyChange, cashfreeNote = true }) {
  const ids = { type: useId(), address: useId(), lob: useId() };
  const set = (k, v) => onChange(k, v);
  const p = { value, errors, set };
  return (
    <div className="space-y-6" data-testid="kyc-form">
      <section>
        <SubHeading>Business</SubHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KycInput {...p} k="businessName" label="Business / legal name" hint="As on the PAN card" maxLength={120} placeholder="e.g. Sen Electricals" />
          <Field label="Type" required htmlFor={ids.type} error={errors.businessType}>
            <Select id={ids.type} name="businessType" value={value.businessType} onChange={(e) => set('businessType', e.target.value)} data-testid="kyc-businessType">
              <option value="individual">Individual / proprietor</option>
              <option value="business">Registered business</option>
            </Select>
          </Field>
          <Field label="Line of business" required htmlFor={ids.lob} error={errors.lineOfBusiness} hint="Sent to Cashfree for payouts" className="sm:col-span-2">
            <Select id={ids.lob} name="lineOfBusiness" value={value.lineOfBusiness || ''} onChange={(e) => set('lineOfBusiness', e.target.value)} invalid={Boolean(errors.lineOfBusiness)} data-testid="kyc-lineOfBusiness">
              <option value="">Choose what this vendor does…</option>
              {CF_LINES_OF_BUSINESS.map((v) => (
                <option key={v} value={v}>
                  {lineOfBusinessLabel(v)}
                </option>
              ))}
            </Select>
          </Field>
          <KycInput {...p} k="gstin" label="GSTIN" required={false} hint="Optional · needed above ₹20 lakh a year" maxLength={15} placeholder="27ABCDE1234F1Z5" className="font-mono" onChange={(e) => set('gstin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <KycInput {...p} k="city" label="City" maxLength={80} placeholder="e.g. Kolkata" />
          <Field label="Address" hint="Optional" htmlFor={ids.address} error={errors.address} className="sm:col-span-2">
            <Textarea id={ids.address} name="address" rows={2} maxLength={300} value={value.address} onChange={(e) => set('address', e.target.value)} invalid={Boolean(errors.address)} placeholder="Shop / office address" data-testid="kyc-address" />
          </Field>
        </div>
      </section>

      <section>
        <SubHeading>Identity</SubHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KycInput {...p} k="pan" label="PAN" hint="5 letters, 4 digits, 1 letter" maxLength={10} placeholder="ABCDE1234F" className="font-mono" onChange={(e) => set('pan', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <KycInput {...p} k="aadhaar" label="Aadhaar number" hint="12 digits — checked for typos before saving" maxLength={14} inputMode="numeric" placeholder="1234 5678 9012" onChange={(e) => set('aadhaar', e.target.value.replace(/[^\d ]/g, ''))} />
        </div>
      </section>

      <section>
        <SubHeading>Bank account for payouts</SubHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KycInput {...p} k="bankAccountHolder" label="Account holder name" maxLength={120} placeholder="As printed on the passbook" className="sm:col-span-2" />
          <KycInput {...p} k="bankAccountNumber" label="Account number" hint="9 to 18 digits" maxLength={18} inputMode="numeric" placeholder="e.g. 123456789012" onChange={(e) => set('bankAccountNumber', e.target.value.replace(/\D/g, ''))} />
          <KycInput {...p} k="bankAccountConfirm" label="Confirm account number" maxLength={18} inputMode="numeric" placeholder="Type it again" onChange={(e) => set('bankAccountConfirm', e.target.value.replace(/\D/g, ''))} />
          <KycInput {...p} k="bankIfsc" label="IFSC" hint="11 characters, 5th is 0" maxLength={11} placeholder="SBIN0001234" onChange={(e) => set('bankIfsc', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <KycInput {...p} k="bankName" label="Bank name" required={false} hint="Optional" maxLength={120} placeholder="e.g. State Bank of India" />
        </div>
      </section>

      <section>
        <SubHeading>Documents</SubHeading>
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
          {KYC_DOC_FIELDS.map(([k, label]) => (
            <UploadTile key={k} name={k} label={label} purpose="kyc" value={value[k]} onChange={(v) => set(k, v)} error={errors[k]} onBusyChange={onBusyChange} testId={`kyc-doc-${k}`} />
          ))}
        </div>
        {errors.documents && (
          <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-rose-500" role="alert" data-testid="kyc-documents-error">
            <Icon name="fa-solid fa-circle-exclamation" className="text-[10px]" />
            {errors.documents}
          </p>
        )}
        <p className="mt-2 text-[11px] text-brand-muted">Three different, readable files. They stay private: only admins with the vendor permission can open them.</p>
      </section>

      <section className="space-y-3">
        <label className="flex cursor-pointer items-start gap-2.5 text-xs text-gray-700">
          <input type="checkbox" name="vendorConsent" checked={value.vendorConsent} onChange={(e) => set('vendorConsent', e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-[#2563eb]" data-testid="kyc-consent" />
          <span>
            <b>The vendor agreed to KYC verification</b> — they gave these details and agreed that NIVASA verifies them and shares the bank details, PAN (number and card photo), GSTIN and line of business with Cashfree for payouts.
          </span>
        </label>
        {errors.vendorConsent && (
          <p className="-mt-1 ml-6 text-[11px] font-medium text-rose-500" role="alert">
            {errors.vendorConsent}
          </p>
        )}
        <label className="flex cursor-pointer items-start gap-2.5 text-xs text-gray-700">
          <input type="checkbox" name="approve" checked={value.approve} onChange={(e) => set('approve', e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-[#2563eb]" data-testid="kyc-approve-now" />
          <span>
            <b>Approve KYC now and create the Cashfree payout account</b>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-brand-muted">
              Only tick this if you checked the documents against the numbers. The vendor becomes verified at once (can list services and products) and, when Cashfree is set up on the server, their Easy Split payout account is created from this bank + PAN so members can pay them online. Left unticked, the KYC waits in the “Pending review” queue.
            </span>
          </span>
        </label>
        {cashfreeNote && value.approve && (
          <Alert tone="info">Approved KYC can’t be edited later — you’d have to reject it first. Your name is recorded as the reviewer.</Alert>
        )}
      </section>
    </div>
  );
}
