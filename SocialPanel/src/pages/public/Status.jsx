import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { api } from '../../lib/api.js';
import { formatDateTime } from '../../lib/format.js';
import { Alert, Badge, Button, CopyField, cx, Icon } from '../../components/ui.jsx';
import { Field, Input } from '../../components/Form.jsx';
import { PasswordFields, validatePasswords } from '../../components/PasswordFields.jsx';
import { PublicLayout } from '../../layout/PublicLayout.jsx';

function Timeline({ status, submittedAt, reviewedAt }) {
  const rejected = status === 'rejected';
  const approved = status === 'approved';
  const reviewing = status === 'under_review';
  const steps = [
    { label: status === 'draft' ? 'Draft saved' : 'Submitted', sub: submittedAt ? formatDateTime(submittedAt) : status === 'draft' ? 'Not submitted yet' : '', state: status === 'draft' ? 'current' : 'done' },
    { label: 'Under review', sub: reviewing ? 'The adda team is reviewing your application' : approved || rejected ? 'Review complete' : 'Waiting for a reviewer', state: reviewing ? 'current' : approved || rejected ? 'done' : 'todo' },
    { label: rejected ? 'Rejected' : 'Approved', sub: approved || rejected ? formatDateTime(reviewedAt) : 'Decision pending', state: approved ? 'done' : rejected ? 'failed' : 'todo' },
  ];
  return (
    <ol className="relative grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-3" data-testid="status-timeline">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex items-start gap-3 sm:flex-col sm:items-center sm:text-center">
          {i < steps.length - 1 && <span className={cx('absolute left-4 top-9 h-[calc(100%-4px)] w-0.5 sm:left-[calc(50%+22px)] sm:top-4 sm:h-0.5 sm:w-[calc(100%-44px)]', s.state === 'done' ? 'bg-azea-green' : 'bg-gray-200')} aria-hidden="true" />}
          <span
            className={cx(
              'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
              s.state === 'done' && 'bg-azea-green text-white',
              s.state === 'current' && 'bg-azea-purple text-white ring-4 ring-azea-purpleLight',
              s.state === 'failed' && 'bg-azea-orange text-white',
              s.state === 'todo' && 'bg-white text-gray-400 ring-1 ring-gray-200',
            )}
          >
            {s.state === 'done' ? <Icon name="fa-solid fa-check" /> : s.state === 'failed' ? <Icon name="fa-solid fa-xmark" /> : i + 1}
          </span>
          <span className="min-w-0">
            <span className={cx('block text-xs font-semibold', s.state === 'todo' ? 'text-gray-400' : s.state === 'failed' ? 'text-azea-orange' : 'text-gray-700')}>{s.label}</span>
            {s.sub && <span className="mt-0.5 block text-[11px] text-azea-muted">{s.sub}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Activation({ creds, result, onActivated }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const errs = validatePasswords(password, confirm);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/public/society-registrations/activate', { ...creds, password }, { auth: false });
      onActivated(res);
    } catch (err) {
      if (err.code === 'ALREADY_ACTIVATED') onActivated({ ...result, activation: 'done', email: result.adminEmail });
      else setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-violet-100 bg-azea-purpleLight/40 p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-azea-purple text-white">
          <Icon name="fa-solid fa-key" className="text-xs" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-gray-800">Activate your admin account</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
            Choose a password for <span className="font-semibold">{result.adminEmail}</span>. You’ll use this email and password to sign in.
          </p>
        </div>
      </div>
      {error && (
        <Alert tone="danger" className="mb-4">
          {error.message}
        </Alert>
      )}
      <form onSubmit={submit} noValidate className="space-y-5">
        <PasswordFields password={password} confirm={confirm} onPassword={(v) => (setPassword(v), setErrors((x) => ({ ...x, password: undefined })))} onConfirm={(v) => (setConfirm(v), setErrors((x) => ({ ...x, confirm: undefined })))} errors={errors} />
        <Button type="submit" size="md" className="w-full sm:w-auto" icon="fa-solid fa-unlock" loading={busy} data-testid="activate-submit">
          Activate account
        </Button>
      </form>
    </div>
  );
}

export default function Status() {
  const [params] = useSearchParams();
  const location = useLocation();
  const [referenceCode, setReferenceCode] = useState(location.state?.referenceCode || params.get('ref') || '');
  const [accessKey, setAccessKey] = useState(location.state?.accessKey || '');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [activated, setActivated] = useState(null);

  useEffect(() => {
    document.title = 'Application status · adda';
  }, []);

  const check = async (e) => {
    e?.preventDefault();
    const errs = {};
    if (referenceCode.trim().length < 6) errs.referenceCode = 'Enter the reference code (e.g. SR-2026-ABC123)';
    if (accessKey.trim().length < 8) errs.accessKey = 'Enter the access key you received when you applied';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.post('/public/society-registrations/status', { referenceCode: referenceCode.trim().toUpperCase(), accessKey: accessKey.trim() }, { auth: false }));
    } catch (err) {
      setResult(null);
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const creds = { referenceCode: referenceCode.trim().toUpperCase(), accessKey: accessKey.trim() };
  const activation = activated ? 'done' : result?.activation;
  const signInEmail = activated?.email || result?.adminEmail || '';

  return (
    <PublicLayout variant="wide" title="Application status" subtitle="Enter the reference code and access key you received when you submitted your society registration.">
      <div className="mx-auto max-w-3xl space-y-6">
        {!result && (
          <div className="card mx-auto max-w-lg p-6 sm:p-8">
            <form onSubmit={check} noValidate className="space-y-4">
              {error && (
                <Alert tone={error.status === 404 ? 'warning' : 'danger'} title={error.status === 404 ? 'No match found' : 'Couldn’t check status'}>
                  {error.message}
                </Alert>
              )}
              <Field label="Reference code" error={errors.referenceCode} htmlFor="ref">
                <Input id="ref" name="referenceCode" value={referenceCode} onChange={(e) => (setReferenceCode(e.target.value), setErrors((x) => ({ ...x, referenceCode: undefined })))} invalid={Boolean(errors.referenceCode)} placeholder="SR-2026-XXXXXX" className="font-mono uppercase" autoFocus={!referenceCode} />
              </Field>
              <Field label="Access key" error={errors.accessKey} htmlFor="key">
                <Input id="key" name="accessKey" value={accessKey} onChange={(e) => (setAccessKey(e.target.value), setErrors((x) => ({ ...x, accessKey: undefined })))} invalid={Boolean(errors.accessKey)} placeholder="Shown once after you applied" className="font-mono" autoComplete="off" autoFocus={Boolean(referenceCode) && !accessKey} />
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={busy} icon="fa-solid fa-magnifying-glass" data-testid="status-check">
                Check status
              </Button>
            </form>
            <p className="mt-5 text-center text-[11px] text-azea-muted">
              Haven’t applied yet?{' '}
              <Link to="/register" className="font-semibold text-azea-purple hover:underline">
                Register your society
              </Link>
            </p>
          </div>
        )}

        {result && (
          <div className="card" data-testid="status-result">
            <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{result.referenceCode}</p>
                <h2 className="truncate text-base font-bold text-gray-800">{result.societyName}</h2>
                <p className="text-[11px] text-azea-muted">{result.city}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={result.status} className="px-3 py-1 text-[11px]" />
                <Button variant="secondary" size="xs" icon="fa-solid fa-rotate-right" onClick={check} loading={busy}>
                  Refresh
                </Button>
              </div>
            </div>
            <div className="space-y-6 px-5 py-6 sm:px-8">
              <Timeline status={result.status} submittedAt={result.submittedAt} reviewedAt={result.reviewedAt} />

              {result.status === 'rejected' && (
                <Alert tone="danger" title="Your application was not approved">
                  <span className="block">{result.decisionReason || 'No reason was given.'}</span>
                  <span className="mt-1 block opacity-80">You can submit a new application with corrected details.</span>
                </Alert>
              )}
              {['submitted', 'under_review'].includes(result.status) && (
                <Alert tone="info" title="We’re on it">
                  Reviews usually finish within a few working days. Check back here with the same reference code and access key.
                </Alert>
              )}
              {result.status === 'draft' && <Alert tone="warning">This application is a draft and has not been submitted for review yet.</Alert>}

              {result.status === 'approved' && (
                <>
                  <div className="rounded-xl bg-grad-green p-5 text-white">
                    <p className="text-xs font-medium text-white/85">Approved society</p>
                    <p className="mt-0.5 text-lg font-bold">{result.society?.name || result.societyName}</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Society code</p>
                        <p className="font-mono text-sm font-bold" data-testid="society-code">
                          {result.society?.code}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Admin sign-in email</p>
                        <p className="truncate text-sm font-semibold">{result.adminEmail}</p>
                      </div>
                    </div>
                  </div>
                  {result.society?.code && <CopyField label="Share this code with residents so they can find your society in the app" value={result.society.code} />}
                  {activation === 'required' && <Activation creds={creds} result={result} onActivated={setActivated} />}
                  {activation === 'done' && (
                    <div className="flex flex-col items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{activated ? 'Account activated' : 'Your admin account is active'}</p>
                        <p className="mt-0.5 text-xs text-gray-600">
                          Sign in with <span className="font-semibold">{signInEmail}</span>.
                        </p>
                      </div>
                      <Link to={`/login?email=${encodeURIComponent(signInEmail)}${activated ? '&activated=1' : ''}`} className="inline-flex items-center gap-2 rounded-lg bg-azea-purple px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-azea-purpleDark" data-testid="status-signin">
                        Sign in <Icon name="fa-solid fa-arrow-right" className="text-xs" />
                      </Link>
                    </div>
                  )}
                </>
              )}
              <div className="border-t border-gray-100 pt-4">
                <button type="button" onClick={() => (setResult(null), setActivated(null), setError(null))} className="text-xs font-semibold text-gray-500 hover:text-azea-purple">
                  <Icon name="fa-solid fa-arrow-left" className="mr-1.5" />
                  Check another application
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
