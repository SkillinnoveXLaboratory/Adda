import { useCallback, useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api, mediaHref } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAction, useQuery, useTitle } from '../lib/hooks.js';
import { formatDate } from '../lib/format.js';
import { aadhaarProblem, accountProblem, focusFirstError, formatAadhaar, ifscProblem, panProblem } from '../lib/validation.js';
import { Alert, Badge, Button, Card, Icon, KeyValue, PageHeader, PageSkeleton, QueryState } from '../components/ui.jsx';
import { Field, Input, PasswordInput, PhotoUploader, Segmented, Textarea } from '../components/Form.jsx';
import { useToast } from '../components/Toast.jsx';
import { useCounts } from '../layout/counts.js';

const STATUS = {
  not_submitted: ['Not submitted', 'warning', 'Add your details and documents to get verified. Only verified vendors can list properties and services.'],
  pending: ['Under review', 'info', 'NIVASA is checking your documents. You will get a notification when it is done.'],
  approved: ['Verified', 'success', 'Your KYC is approved. You can list properties and services and boost your posts.'],
  rejected: ['Needs changes', 'danger', null],
};
const DOCS = [
  ['panPhoto', 'PAN card photo', 'Front of your PAN card, all text readable'],
  ['aadhaarFront', 'Aadhaar — front', 'Side with your photo and Aadhaar number'],
  ['aadhaarBack', 'Aadhaar — back', 'Side with your address'],
];
const REASON = {
  service: 'Complete your KYC to add a service. Only verified vendors can list services.',
  property: 'Complete your KYC to list a property. Only verified vendors can list properties.',
  boost: 'Complete your KYC to boost a post. Only verified vendors can boost.',
};

/** Vendor KYC: PAN, Aadhaar, bank details and three private document photos. Numbers are stored encrypted and shown masked. */
export default function Kyc() {
  useTitle('KYC & bank');
  const profile = useQuery(() => api.get('/vendor/profile'));
  return (
    <QueryState query={profile} skeleton={<PageSkeleton rows={6} />}>
      {(p) => <KycView profile={p} onSaved={profile.reload} />}
    </QueryState>
  );
}

function KycView({ profile: p, onSaved }) {
  const location = useLocation();
  const [editing, setEditing] = useState(['not_submitted', 'rejected'].includes(p.kycStatus));
  const [label, tone, body] = STATUS[p.kycStatus] || STATUS.not_submitted;
  const reason = p.kycStatus !== 'approved' ? REASON[location.state?.reason] : null;
  return (
    <div>
      <PageHeader title="KYC & bank details" subtitle="Verification lets you list services and properties, take bookings and boost your posts." />
      {reason && (
        <Alert tone="purple" icon="fa-solid fa-lock" className="mb-5" testId="kyc-reason">
          {reason}
        </Alert>
      )}
      <Card className="mb-6" testId="kyc-status">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-azea-purpleLight text-azea-purple">
            <Icon name="fa-solid fa-shield-halved" className="text-lg" />
          </span>
          <div className="min-w-0 flex-1">
            <Badge tone={tone}>{label}</Badge>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">{body || (p.kycNote ? `Not approved: ${p.kycNote}` : 'Please check your details and submit again.')}</p>
          </div>
          {p.kycStatus === 'pending' && !editing && (
            <Button variant="outline" icon="fa-regular fa-pen-to-square" onClick={() => setEditing(true)}>
              Update details
            </Button>
          )}
        </div>
      </Card>
      {editing ? <KycForm profile={p} onDone={() => (setEditing(false), onSaved())} onCancel={p.kycStatus === 'pending' ? () => setEditing(false) : null} /> : <KycSummary profile={p} />}
    </div>
  );
}

function KycSummary({ profile: p }) {
  return (
    <div className="space-y-6" data-testid="kyc-summary">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Business">
          <KeyValue
            items={[
              ['Name', p.businessName],
              ['Type', p.businessType === 'business' ? 'Business' : 'Individual'],
              ['City', p.city],
              p.address ? ['Address', p.address] : null,
              p.submittedAt ? ['Submitted', formatDate(p.submittedAt)] : null,
              p.reviewedAt ? ['Reviewed', formatDate(p.reviewedAt)] : null,
            ]}
          />
        </Card>
        <Card title="Identity & bank (masked)">
          <KeyValue
            items={[
              ['PAN', p.pan],
              ['Aadhaar', p.aadhaar],
              ['Account holder', p.bankAccountHolder],
              ['Account number', p.bankAccount],
              ['IFSC', p.bankIfsc],
              p.bankName ? ['Bank', p.bankName] : null,
            ]}
          />
        </Card>
      </div>
      <Card title="Documents">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {DOCS.map(([key, title]) => {
            const doc = p.documents?.[key];
            return (
              <figure key={key} className="min-w-0">
                {doc?.mimeType?.startsWith('image/') ? (
                  <img src={mediaHref(doc.url)} alt={title} className="aspect-[1.4] w-full rounded-lg bg-gray-100 object-cover" />
                ) : (
                  <div className="flex aspect-[1.4] w-full items-center justify-center rounded-lg bg-azea-purpleLight text-azea-purple">
                    <Icon name={doc ? 'fa-regular fa-file-pdf' : 'fa-solid fa-circle-exclamation'} className="text-2xl" />
                  </div>
                )}
                <figcaption className="mt-1.5 text-center text-[11px] font-semibold text-gray-600">{title}</figcaption>
              </figure>
            );
          })}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-azea-muted">Your PAN, Aadhaar and account numbers are stored encrypted. Only NIVASA’s verification team can see them in full, and every view is logged. Document links expire after a few minutes.</p>
      </Card>
    </div>
  );
}

function KycForm({ profile: p, onDone, onCancel }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const { refreshCounts } = useCounts();
  const ids = { businessName: useId(), city: useId(), address: useId(), pan: useId(), aadhaar: useId(), holder: useId(), account: useId(), confirm: useId(), ifsc: useId(), bank: useId() };
  const [f, setF] = useState({ businessName: p.businessName || '', businessType: p.businessType || 'individual', city: p.city || '', address: p.address || '', pan: '', aadhaar: '', bankAccountHolder: p.bankAccountHolder || '', bankAccountNumber: '', confirmAccount: '', bankIfsc: p.bankIfsc || '', bankName: p.bankName || '' });
  const [docs, setDocs] = useState({ panPhoto: [], aadhaarFront: [], aadhaarBack: [] });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const set = (k) => (v) => (setF((x) => ({ ...x, [k]: v })), setErrors((e) => ({ ...e, [k]: undefined })));
  const setDoc = (k) => (v) => (setDocs((d) => ({ ...d, [k]: v })), setErrors((e) => ({ ...e, [k]: undefined })));

  const validate = () => {
    const e = {};
    if (f.businessName.trim().length < 2) e.businessName = f.businessType === 'business' ? 'Enter your business name' : 'Enter your full name as on PAN';
    if (f.city.trim().length < 2) e.city = 'Enter your city';
    e.pan = panProblem(f.pan);
    e.aadhaar = aadhaarProblem(f.aadhaar);
    if (f.bankAccountHolder.trim().length < 2) e.bankAccountHolder = 'Enter the account holder’s name as in the bank';
    e.bankAccountNumber = accountProblem(f.bankAccountNumber);
    if (!e.bankAccountNumber && f.confirmAccount !== f.bankAccountNumber) e.confirmAccount = 'Account numbers don’t match';
    e.bankIfsc = ifscProblem(f.bankIfsc);
    for (const [k, title] of DOCS) if (!docs[k].length) e[k] = `Upload the ${title.toLowerCase()}`;
    if (new Set(DOCS.map(([k]) => docs[k][0]?._id).filter(Boolean)).size !== DOCS.filter(([k]) => docs[k].length).length) e.aadhaarBack = 'Use three different files';
    if (!consent) e.consent = 'Please confirm to continue';
    Object.keys(e).forEach((k) => !e[k] && delete e[k]);
    setErrors(e);
    return e;
  };

  const [submit, busy] = useAction(
    useCallback(async () => {
      const e = validate();
      if (Object.keys(e).length) {
        focusFirstError(e);
        throw new Error('Please fix the highlighted fields');
      }
      setServerError(null);
      try {
        await api.put('/vendor/kyc', {
          businessName: f.businessName.trim(),
          businessType: f.businessType,
          city: f.city.trim(),
          ...(f.address.trim() && { address: f.address.trim() }),
          pan: f.pan.trim().toUpperCase(),
          aadhaar: f.aadhaar.replace(/\s/g, ''),
          bankAccountHolder: f.bankAccountHolder.trim(),
          bankAccountNumber: f.bankAccountNumber,
          bankIfsc: f.bankIfsc.trim().toUpperCase(),
          ...(f.bankName.trim() && { bankName: f.bankName.trim() }),
          panPhoto: docs.panPhoto[0]._id,
          aadhaarFront: docs.aadhaarFront[0]._id,
          aadhaarBack: docs.aadhaarBack[0]._id,
          consent: true,
        });
      } catch (err) {
        setServerError(err);
        throw err;
      }
      await refreshProfile().catch(() => {});
      refreshCounts();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [f, docs, consent]),
    { toast, success: 'KYC submitted for review', onDone },
  );

  const disabled = !p.kycAvailable;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
      className="space-y-6"
      data-testid="kyc-form"
    >
      {!p.kycAvailable && (
        <Alert tone="danger" title="Not set up on the server" testId="kyc-unavailable">
          Vendor verification is not set up on the server yet, so KYC can’t be submitted right now. Please try again later.
        </Alert>
      )}
      {p.kycStatus === 'rejected' && p.kycNote && (
        <Alert tone="danger" title="Not approved" testId="kyc-rejected-note">
          {p.kycNote}
        </Alert>
      )}
      {serverError && (
        <Alert tone="danger" title="Could not submit">
          {serverError.message}
        </Alert>
      )}
      <Alert tone="purple" icon="fa-solid fa-lock">
        Your PAN, Aadhaar and bank account numbers are stored encrypted and shown masked. Re-enter them each time you submit.
      </Alert>

      <Card title="Business details">
        <div className="space-y-4">
          <Segmented
            name="businessType"
            label="Account type"
            options={[
              { value: 'individual', label: 'Individual' },
              { value: 'business', label: 'Business' },
            ]}
            value={f.businessType}
            onChange={set('businessType')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={f.businessType === 'business' ? 'Business name' : 'Full name (as on PAN)'} error={errors.businessName} htmlFor={ids.businessName} required>
              <Input id={ids.businessName} name="businessName" value={f.businessName} onChange={(e) => set('businessName')(e.target.value)} maxLength={120} invalid={Boolean(errors.businessName)} placeholder="e.g. Ravi Plumbing Services" />
            </Field>
            <Field label="City" error={errors.city} htmlFor={ids.city} required>
              <Input id={ids.city} name="city" value={f.city} onChange={(e) => set('city')(e.target.value)} maxLength={80} invalid={Boolean(errors.city)} placeholder="e.g. Pune" />
            </Field>
          </div>
          <Field label="Address (optional)" htmlFor={ids.address}>
            <Textarea id={ids.address} name="address" rows={2} value={f.address} onChange={(e) => set('address')(e.target.value)} maxLength={300} placeholder="Shop / office address" />
          </Field>
        </div>
      </Card>

      <Card title="Identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="PAN number" error={errors.pan} htmlFor={ids.pan} required hint="5 letters, 4 digits, 1 letter">
            <Input id={ids.pan} name="pan" value={f.pan} onChange={(e) => set('pan')(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} maxLength={10} autoCapitalize="characters" autoComplete="off" invalid={Boolean(errors.pan)} placeholder="ABCDE1234F" />
          </Field>
          <Field label="Aadhaar number" error={errors.aadhaar} htmlFor={ids.aadhaar} required hint="12 digits">
            <Input id={ids.aadhaar} name="aadhaar" inputMode="numeric" value={f.aadhaar} onChange={(e) => set('aadhaar')(formatAadhaar(e.target.value))} maxLength={14} autoComplete="off" invalid={Boolean(errors.aadhaar)} placeholder="1234 5678 9012" />
          </Field>
        </div>
      </Card>

      <Card title="Bank account (for payouts)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account holder name" error={errors.bankAccountHolder} htmlFor={ids.holder} required className="sm:col-span-2">
            <Input id={ids.holder} name="bankAccountHolder" value={f.bankAccountHolder} onChange={(e) => set('bankAccountHolder')(e.target.value)} maxLength={120} invalid={Boolean(errors.bankAccountHolder)} placeholder="As printed on your passbook" />
          </Field>
          <Field label="Account number" error={errors.bankAccountNumber} htmlFor={ids.account} required hint="9 to 18 digits">
            <PasswordInput id={ids.account} name="bankAccountNumber" inputMode="numeric" autoComplete="off" value={f.bankAccountNumber} onChange={(e) => set('bankAccountNumber')(e.target.value.replace(/\D/g, '').slice(0, 18))} maxLength={18} invalid={Boolean(errors.bankAccountNumber)} placeholder="e.g. 50100123456789" />
          </Field>
          <Field label="Confirm account number" error={errors.confirmAccount} htmlFor={ids.confirm} required>
            <Input id={ids.confirm} name="confirmAccount" inputMode="numeric" autoComplete="off" value={f.confirmAccount} onChange={(e) => set('confirmAccount')(e.target.value.replace(/\D/g, '').slice(0, 18))} maxLength={18} invalid={Boolean(errors.confirmAccount)} placeholder="Type it again" onPaste={(e) => e.preventDefault()} />
          </Field>
          <Field label="IFSC" error={errors.bankIfsc} htmlFor={ids.ifsc} required hint="11 characters, 5th is 0">
            <Input id={ids.ifsc} name="bankIfsc" value={f.bankIfsc} onChange={(e) => set('bankIfsc')(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))} maxLength={11} autoCapitalize="characters" invalid={Boolean(errors.bankIfsc)} placeholder="SBIN0001234" />
          </Field>
          <Field label="Bank name (optional)" htmlFor={ids.bank}>
            <Input id={ids.bank} name="bankName" value={f.bankName} onChange={(e) => set('bankName')(e.target.value)} maxLength={120} placeholder="e.g. State Bank of India" />
          </Field>
        </div>
      </Card>

      <Card title="Document photos">
        <p className="mb-4 text-xs leading-relaxed text-gray-600">Three clear photos (or PDFs). They are private: only NIVASA’s verification team can open them.</p>
        <div className="grid gap-5 sm:grid-cols-3">
          {DOCS.map(([key, title, hint]) => (
            <div key={key} className="min-w-0" data-testid={`kyc-doc-${key}`}>
              <p className="text-xs font-bold text-gray-700">{title}</p>
              <p className="mb-2 text-[11px] text-azea-muted">{hint}</p>
              <PhotoUploader value={docs[key]} onChange={setDoc(key)} purpose="kyc" max={1} allowPdf label="Upload photo" hint="JPG, PNG, WEBP or PDF · max 8 MB" error={errors[key]} testId={`upload-${key}`} disabled={disabled} />
            </div>
          ))}
        </div>
      </Card>

      <div>
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-gray-100 bg-white p-4 text-xs leading-relaxed text-gray-700">
          <input type="checkbox" name="consent" checked={consent} onChange={(e) => (setConsent(e.target.checked), setErrors((x) => ({ ...x, consent: undefined })))} className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-[#7c3aed]" data-testid="kyc-consent" />
          <span>I confirm these details and documents are mine and correct, and I agree to NIVASA verifying them for vendor KYC.</span>
        </label>
        {errors.consent && (
          <p className="mt-1 text-[11px] font-medium text-rose-600" role="alert">
            {errors.consent}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : p.kycStatus === 'not_submitted' ? (
          <Button variant="ghost" onClick={() => navigate('/dashboard')} disabled={busy}>
            I’ll do this later
          </Button>
        ) : null}
        <Button type="submit" size="lg" icon="fa-solid fa-shield-halved" loading={busy} disabled={disabled} data-testid="kyc-submit">
          Submit for verification
        </Button>
      </div>
    </form>
  );
}
