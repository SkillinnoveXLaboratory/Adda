import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { homePathFor, useAuth } from '../../lib/auth.jsx';
import { isEmail } from '../../lib/validation.js';
import { Alert, Button, Icon } from '../../components/ui.jsx';
import { Field, Input } from '../../components/Form.jsx';
import { PublicCard, PublicLayout } from '../../layout/PublicLayout.jsx';

const REASONS = {
  expired: ['warning', 'Your session has expired. Please sign in again.'],
  disabled: ['danger', 'This account has been disabled. Contact your platform administrator.'],
};

export default function Login() {
  const { login, isAuthenticated, user, staffRoles, clearEndReason } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const reason = REASONS[params.get('reason')];
  const activated = params.get('activated') === '1';

  useEffect(() => {
    clearEndReason();
    document.title = 'Sign in · adda';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isAuthenticated && !busy) return <Navigate to={homePathFor(user, staffRoles)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!isEmail(email)) errs.email = 'Enter a valid email address';
    if (!password) errs.password = 'Enter your password';
    setErrors(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await login(email.trim().toLowerCase(), password);
      const home = homePathFor(res.user, res.staffRoles);
      const from = location.state?.from;
      const target = from && from.startsWith(home) ? from : home;
      navigate(target, { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <PublicCard>
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-gray-800">Welcome back</h1>
          <p className="mt-1 text-xs text-azea-muted">Sign in to the adda society admin portal.</p>
        </div>
        {reason && !error && (
          <Alert tone={reason[0]} className="mb-4">
            {reason[1]}
          </Alert>
        )}
        {activated && !error && (
          <Alert tone="success" className="mb-4" title="Account ready">
            Your password is set. Sign in to continue.
          </Alert>
        )}
        {error && (
          <Alert tone={error.status === 423 || error.status === 429 ? 'warning' : 'danger'} className="mb-4" title={error.code === 'USE_MASTER_PANEL' ? 'Use the Master Admin panel' : error.code === 'NO_PANEL_ACCESS' ? 'No admin access' : error.status === 423 ? 'Account locked' : 'Sign-in failed'}>
            {error.message}
          </Alert>
        )}
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Email address" error={errors.email} htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => (setEmail(e.target.value), setErrors((x) => ({ ...x, email: undefined })))} invalid={Boolean(errors.email)} placeholder="you@society.org" autoFocus={!email} />
          </Field>
          <Field label="Password" error={errors.password} htmlFor="password">
            <div className="relative">
              <Input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => (setPassword(e.target.value), setErrors((x) => ({ ...x, password: undefined })))} invalid={Boolean(errors.password)} className="pr-10" placeholder="••••••••••" autoFocus={Boolean(email)} />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 hover:text-azea-purple" aria-label={show ? 'Hide password' : 'Show password'}>
                <Icon name={show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} className="text-xs" />
              </button>
            </div>
          </Field>
          <div className="flex justify-end">
            <Link to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`} className="text-[11px] font-semibold text-azea-purple hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" size="lg" className="w-full" loading={busy} data-testid="login-submit">
            Sign in
          </Button>
        </form>
      </PublicCard>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link to="/register" className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-colors hover:border-azea-purple/40">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-azea-purpleLight text-azea-purple">
            <Icon name="fa-regular fa-building" className="text-xs" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-gray-700 group-hover:text-azea-purple">Register your society</span>
            <span className="block text-[11px] text-azea-muted">Apply in 5 short steps</span>
          </span>
        </Link>
        <Link to="/status" className="group flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-colors hover:border-azea-purple/40">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <Icon name="fa-regular fa-clock" className="text-xs" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-gray-700 group-hover:text-azea-purple">Check application status</span>
            <span className="block text-[11px] text-azea-muted">Use your reference code</span>
          </span>
        </Link>
      </div>
    </PublicLayout>
  );
}
