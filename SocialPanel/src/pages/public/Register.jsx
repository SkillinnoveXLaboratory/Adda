import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, saveBlob } from '../../lib/api.js';
import { formatBytes, formatDateTime } from '../../lib/format.js';
import { contactPhoneRule, emailRule, intRange, maxLen, minLen, normalizePhone, phoneRule, pinRule, req, runRules } from '../../lib/validation.js';
import { Alert, Button, CopyField, cx, Icon } from '../../components/ui.jsx';
import { Checkbox, Field, FileUploader, Input, Select } from '../../components/Form.jsx';
import { PublicLayout } from '../../layout/PublicLayout.jsx';
import { INDIAN_STATES } from '../../lib/india.js';

export { INDIAN_STATES };

const STEPS = [
  { key: 'society', title: 'Society details', icon: 'fa-regular fa-building' },
  { key: 'address', title: 'Address', icon: 'fa-solid fa-location-dot' },
  { key: 'rep', title: 'Representative', icon: 'fa-regular fa-user' },
  { key: 'docs', title: 'Documents', icon: 'fa-regular fa-file-lines' },
  { key: 'review', title: 'Review & submit', icon: 'fa-solid fa-check-double' },
];

const EMPTY = { societyName: '', totalUnits: '', phone: '', email: '', addressLine: '', area: '', city: '', state: '', pincode: '', repName: '', repDesignation: '', repPhone: '', repEmail: '' };

const RULES = {
  society: {
    societyName: [req('Enter the society name'), minLen(3), maxLen(160)],
    totalUnits: [intRange(1, 100000, 'Enter a whole number of units (1–100000)')],
    phone: [req('Enter the society contact number'), contactPhoneRule()],
    email: [req('Enter the society email address'), emailRule()],
  },
  address: {
    addressLine: [req('Enter the street address'), minLen(5, 'Address must be at least 5 characters'), maxLen(300)],
    area: [maxLen(120)],
    city: [req('Enter the city'), minLen(2), maxLen(80)],
    state: [req('Choose the state')],
    pincode: [req('Enter the PIN code'), pinRule()],
  },
  rep: {
    repName: [req('Enter the representative’s full name'), minLen(2), maxLen(120)],
    repDesignation: [maxLen(80)],
    repPhone: [req('Enter the representative’s mobile number'), phoneRule()],
    repEmail: [req('Enter the representative’s email'), emailRule()],
  },
};

const DRAFT_KEY = 'adda.register.draft';
const readDraft = () => {
  try {
    return { ...EMPTY, ...JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || '{}') };
  } catch {
    return EMPTY;
  }
};

function Stepper({ step, onJump, maxReached }) {
  return (
    <ol className="mb-6 flex items-center gap-1 sm:gap-2" aria-label="Registration steps">
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        const reachable = i <= maxReached;
        return (
          <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <button type="button" disabled={!reachable || active} onClick={() => onJump(i)} className="flex min-w-0 items-center gap-2 disabled:cursor-default" aria-current={active ? 'step' : undefined}>
              <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors', done ? 'bg-azea-green text-white' : active ? 'bg-azea-purple text-white ring-4 ring-azea-purpleLight' : 'bg-white text-gray-400 ring-1 ring-gray-200')}>
                {done ? <Icon name="fa-solid fa-check" /> : i + 1}
              </span>
              <span className={cx('hidden truncate text-[11px] font-semibold lg:block', active ? 'text-azea-purple' : done ? 'text-gray-700' : 'text-gray-400')}>{s.title}</span>
            </button>
            {i < STEPS.length - 1 && <span className={cx('h-0.5 min-w-[8px] flex-1 rounded-full', i < step ? 'bg-azea-green' : 'bg-gray-200')} />}
          </li>
        );
      })}
    </ol>
  );
}

function TextField({ label, name, values, errors, onChange, required, hint, className, ...rest }) {
  return (
    <Field label={label} required={required} error={errors[name]} hint={hint} htmlFor={`f-${name}`} className={className}>
      <Input id={`f-${name}`} name={name} value={values[name]} onChange={(e) => onChange(name, e.target.value)} invalid={Boolean(errors[name])} {...rest} />
    </Field>
  );
}

function ReviewSection({ title, onEdit, rows }) {
  return (
    <div className="rounded-xl border border-gray-100 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</p>
        <button type="button" onClick={onEdit} className="text-[11px] font-semibold text-azea-purple hover:underline">
          <Icon name="fa-regular fa-pen-to-square" className="mr-1" />
          Edit
        </button>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{k}</dt>
            <dd className="break-words text-xs font-medium text-gray-700">{v || <span className="text-gray-300">Not provided</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Success({ result, onDone }) {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const text = [
    'adda — Society registration',
    '============================',
    `Society: ${result.societyName}`,
    `Submitted: ${formatDateTime(result.submittedAt)}`,
    '',
    `Reference code: ${result.referenceCode}`,
    `Access key:     ${result.accessKey}`,
    '',
    'Keep these safe. The access key is shown only once and is needed to check status',
    'and to activate your admin account after approval.',
    `Status page: ${window.location.origin}/status`,
  ].join('\n');
  return (
    <div className="mx-auto max-w-2xl">
      <div className="card overflow-hidden">
        <div className="bg-grad-green px-6 py-8 text-center text-white sm:px-10">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <Icon name="fa-solid fa-check" className="text-2xl" />
          </span>
          <h1 className="text-xl font-bold">Application submitted</h1>
          <p className="mt-1 text-xs text-white/90">{result.societyName} is now in the review queue.</p>
        </div>
        <div className="space-y-5 p-6 sm:p-8">
          <Alert tone="warning" title="Save these details now — they are shown only once">
            You need both the reference code and the access key to check your status and to activate your admin account. We don’t store the access key in a readable form, so it can’t be recovered.
          </Alert>
          <CopyField label="Reference code" value={result.referenceCode} testId="reference-code" />
          <CopyField label="Access key" value={result.accessKey} testId="access-key" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="md"
              icon="fa-solid fa-download"
              className="flex-1"
              onClick={() => {
                saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `adda-registration-${result.referenceCode}.txt`);
                setSaved(true);
              }}
            >
              Download as text
            </Button>
            <Button
              size="md"
              icon="fa-regular fa-clock"
              className="flex-1"
              onClick={() => {
                onDone();
                navigate(`/status?ref=${encodeURIComponent(result.referenceCode)}`, { state: { referenceCode: result.referenceCode, accessKey: result.accessKey } });
              }}
            >
              Go to status page
            </Button>
          </div>
          {saved && (
            <p className="text-center text-[11px] text-emerald-600">
              <Icon name="fa-solid fa-circle-check" className="mr-1" />
              Saved to your downloads.
            </p>
          )}
          <div className="rounded-xl bg-azea-bg p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">What happens next</p>
            <ol className="mt-2 space-y-1.5 text-xs text-gray-600">
              <li>1. The adda team reviews your application and documents.</li>
              <li>2. Once approved you receive a society code.</li>
              <li>3. Activate your admin account from the status page (or the email link, if email is set up) and sign in.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Register() {
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [values, setValues] = useState(readDraft);
  const [errors, setErrors] = useState({});
  const [docs, setDocs] = useState([]);
  const [agree, setAgree] = useState(false);
  const [agreeError, setAgreeError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    document.title = 'Register your society · adda';
  }, []);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } catch {
      /* convenience only */
    }
  }, [values]);

  const onChange = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const validateStep = (i) => {
    const rules = RULES[STEPS[i].key];
    if (!rules) return true;
    const errs = runRules(values, rules);
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) document.getElementById(`f-${first}`)?.focus();
    return !first;
  };

  const next = () => {
    if (!validateStep(step)) return;
    const n = Math.min(step + 1, STEPS.length - 1);
    setStep(n);
    setMaxReached((m) => Math.max(m, n));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const back = () => setStep((s) => Math.max(0, s - 1));
  const jump = (i) => {
    // Moving forward requires every step before the target to be valid.
    for (let k = 0; k < i; k += 1) {
      const errs = RULES[STEPS[k].key] ? runRules(values, RULES[STEPS[k].key]) : {};
      if (Object.keys(errs).length) {
        setStep(k);
        setErrors(errs);
        return;
      }
    }
    setErrors({});
    setStep(i);
  };

  const payload = useMemo(
    () => ({
      societyName: values.societyName.trim(),
      addressLine: values.addressLine.trim(),
      area: values.area.trim() || undefined,
      city: values.city.trim(),
      state: values.state,
      pincode: values.pincode.trim(),
      phone: normalizePhone(values.phone),
      email: values.email.trim().toLowerCase(),
      totalUnits: values.totalUnits ? Number(values.totalUnits) : undefined,
      representative: { name: values.repName.trim(), designation: values.repDesignation.trim() || undefined, phone: normalizePhone(values.repPhone), email: values.repEmail.trim().toLowerCase() },
      documents: docs.map((d) => d._id),
      submit: true,
    }),
    [values, docs],
  );

  const submit = async () => {
    for (let k = 0; k < 3; k += 1) {
      const errs = runRules(values, RULES[STEPS[k].key]);
      if (Object.keys(errs).length) {
        setStep(k);
        setErrors(errs);
        return;
      }
    }
    if (!agree) return setAgreeError('Please confirm the declaration to submit');
    setBusy(true);
    setSubmitError(null);
    try {
      const res = await api.post('/public/society-registrations', payload, { auth: false });
      setResult({ ...res, societyName: res.societyName || payload.societyName });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setSubmitError(err);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <PublicLayout variant="wide">
        <Success
          result={result}
          onDone={() => {
            try {
              window.sessionStorage.removeItem(DRAFT_KEY);
            } catch {
              /* ignore */
            }
          }}
        />
      </PublicLayout>
    );
  }

  const f = { values, errors, onChange };
  return (
    <PublicLayout variant="wide" title="Register your society" subtitle="Tell us about your society. It takes about 5 minutes — the adda team reviews every application before it goes live.">
      <div className="mx-auto max-w-3xl">
        <Stepper step={step} onJump={jump} maxReached={maxReached} />
        <div className="card">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 sm:px-8">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-azea-purpleLight text-azea-purple">
              <Icon name={STEPS[step].icon} className="text-sm" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Step {step + 1} of {STEPS.length}
              </p>
              <h2 className="text-sm font-bold text-gray-800">{STEPS[step].title}</h2>
            </div>
          </div>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (step < STEPS.length - 1) next();
              else submit();
            }}
            className="px-5 py-6 sm:px-8"
          >
            {step === 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField {...f} label="Society name" name="societyName" required className="sm:col-span-2" placeholder="e.g. Green Meadows Co-operative Housing Society" autoComplete="organization" />
                <TextField {...f} label="Total units / flats" name="totalUnits" inputMode="numeric" placeholder="e.g. 120" hint="Approximate is fine" />
                <div className="hidden sm:block" />
                <TextField {...f} label="Society contact number" name="phone" required inputMode="tel" placeholder="Mobile or landline with STD code" hint="Mobile (starts with 6–9) or landline, e.g. 033 2234 5678" prefix="+91" maxLength={14} />
                <TextField {...f} label="Society email" name="email" required type="email" placeholder="office@society.org" />
              </div>
            )}
            {step === 1 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <TextField {...f} label="Street address" name="addressLine" required placeholder="Building / street / landmark" autoComplete="street-address" />
                </div>
                <TextField {...f} label="Area / locality" name="area" placeholder="e.g. Baner" />
                <TextField {...f} label="City" name="city" required placeholder="e.g. Pune" autoComplete="address-level2" />
                <Field label="State" required error={errors.state} htmlFor="f-state">
                  <Select id="f-state" name="state" value={values.state} onChange={(e) => onChange('state', e.target.value)} invalid={Boolean(errors.state)}>
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </Field>
                <TextField {...f} label="PIN code" name="pincode" required inputMode="numeric" maxLength={6} placeholder="6 digits" autoComplete="postal-code" />
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <Alert tone="purple">This person becomes the first society admin. After approval they activate the account with the access key and sign in with this email.</Alert>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField {...f} label="Full name" name="repName" required autoComplete="name" />
                  <TextField {...f} label="Designation" name="repDesignation" placeholder="e.g. Secretary" />
                  <TextField {...f} label="Mobile number" name="repPhone" required inputMode="tel" placeholder="10-digit mobile" hint="Indian mobile numbers start with 6, 7, 8 or 9" prefix="+91" maxLength={14} />
                  <TextField {...f} label="Email address" name="repEmail" required type="email" autoComplete="email" hint="Used to sign in to the admin portal" />
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-gray-600">Optional but recommended: upload your registration certificate, a society letterhead authorising the representative, or similar proof. This speeds up review.</p>
                <FileUploader files={docs} onChange={setDocs} max={6} label="Upload documents" onUpload={(file) => api.upload('/public/society-registrations/documents', file, {}, { auth: false })} />
                {docs.length === 0 && <p className="text-[11px] text-azea-muted">No documents yet — you can continue without them.</p>}
              </div>
            )}
            {step === 4 && (
              <div className="space-y-4">
                <ReviewSection
                  title="Society"
                  onEdit={() => setStep(0)}
                  rows={[
                    ['Name', values.societyName],
                    ['Units', values.totalUnits],
                    ['Phone', values.phone && `+91 ${normalizePhone(values.phone)}`],
                    ['Email', values.email],
                  ]}
                />
                <ReviewSection
                  title="Address"
                  onEdit={() => setStep(1)}
                  rows={[
                    ['Street', values.addressLine],
                    ['Area', values.area],
                    ['City', values.city],
                    ['State / PIN', [values.state, values.pincode].filter(Boolean).join(' – ')],
                  ]}
                />
                <ReviewSection
                  title="Representative"
                  onEdit={() => setStep(2)}
                  rows={[
                    ['Name', values.repName],
                    ['Designation', values.repDesignation],
                    ['Mobile', values.repPhone && `+91 ${normalizePhone(values.repPhone)}`],
                    ['Email', values.repEmail],
                  ]}
                />
                <ReviewSection title="Documents" onEdit={() => setStep(3)} rows={[['Uploaded', docs.length ? docs.map((d) => `${d.originalName} (${formatBytes(d.size)})`).join(', ') : '']]} />
                <div className="rounded-xl bg-azea-bg p-4">
                  <Checkbox checked={agree} onChange={(v) => (setAgree(v), setAgreeError(null))} name="agree" label="I confirm these details are accurate and that I am authorised to register this society." />
                  {agreeError && <p className="mt-1.5 text-[11px] font-medium text-rose-500">{agreeError}</p>}
                </div>
                {submitError && (
                  <Alert tone="danger" title="Couldn’t submit the application">
                    {submitError.message}
                  </Alert>
                )}
              </div>
            )}

            <div className="mt-8 flex flex-col-reverse gap-2 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              {step > 0 ? (
                <Button variant="secondary" size="md" icon="fa-solid fa-arrow-left" onClick={back} disabled={busy}>
                  Back
                </Button>
              ) : (
                <Link to="/login" className="text-center text-xs font-semibold text-gray-500 hover:text-azea-purple sm:text-left">
                  Cancel
                </Link>
              )}
              {step < STEPS.length - 1 ? (
                <Button type="submit" size="md" iconRight="fa-solid fa-arrow-right" data-testid="wizard-next">
                  Continue
                </Button>
              ) : (
                <Button type="submit" size="md" icon="fa-solid fa-paper-plane" loading={busy} data-testid="wizard-submit">
                  Submit application
                </Button>
              )}
            </div>
          </form>
        </div>
        <p className="mt-5 text-center text-[11px] text-azea-muted">
          Already applied?{' '}
          <Link to="/status" className="font-semibold text-azea-purple hover:underline">
            Check application status
          </Link>
        </p>
      </div>
    </PublicLayout>
  );
}
