import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../lib/auth.jsx';
import { canViewArea } from '../../lib/permissions.js';
import { areaForPath } from '../../layout/nav.js';
import { isEmail } from '../../lib/validation.js';
import { Alert, Button, Icon, Logo } from '../../components/ui.jsx';
import { Field, Input } from '../../components/Form.jsx';

const REASONS = {
  expired: ['warning', 'Your session has expired. Please sign in again.'],
  disabled: ['danger', 'This account has been disabled.'],
};

function Shell({ children }) {
  return (
    <div className="flex min-h-screen bg-brand-bg">
      <aside className="hidden w-[400px] shrink-0 flex-col justify-between bg-sidebar-bg p-10 text-sidebar-text lg:flex">
        <Logo light />
        <div>
          <h2 className="text-2xl font-bold leading-snug text-white">Master control for every society on Nivasa.</h2>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              ['fa-solid fa-building', 'Every society, member and record in one place'],
              ['fa-solid fa-user-lock', 'Personal data masked until you reveal it with a reason'],
              ['fa-solid fa-clock-rotate-left', 'Every change is written to a tamper-evident audit log'],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-blue-400">
                  <Icon name={icon} className="text-xs" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-sidebar-title">For the platform owner only.</p>
      </aside>
      <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <Logo />
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

export default function Login() {
  const { login, isAuthenticated, isPlatformAdmin, clearEndReason } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const reason = REASONS[params.get('reason')];

  useEffect(() => {
    clearEndReason();
    document.title = 'Sign in · Nivasa Master';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isAuthenticated && isPlatformAdmin && !busy) return <Navigate to="/admin" replace />;

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
      const from = location.state?.from;
      // Back to the page they were on — unless this account may not open it (e.g. another admin signed out there).
      const ok = from && from.startsWith('/admin') && canViewArea(res.user, areaForPath(from));
      navigate(ok ? from : '/admin', { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Shell>
      <h1 className="text-xl font-bold text-gray-800">Master Admin sign in</h1>
      <p className="mt-1 text-xs text-brand-muted">Platform owner and sub-admin access.</p>
      <div className="mt-5">
        {reason && !error && (
          <Alert tone={reason[0]} className="mb-4">
            {reason[1]}
          </Alert>
        )}
        {error && (
          <Alert tone={error.status === 423 || error.status === 429 ? 'warning' : 'danger'} className="mb-4" title={error.code === 'NOT_OWNER' ? 'Not the platform owner' : error.status === 423 ? 'Account locked' : 'Sign-in failed'}>
            {error.message}
          </Alert>
        )}
      </div>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Email address" error={errors.email} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => (setEmail(e.target.value), setErrors((x) => ({ ...x, email: undefined })))} invalid={Boolean(errors.email)} placeholder="owner@example.com" autoFocus />
        </Field>
        <Field label="Password" error={errors.password} htmlFor="password">
          <div className="relative">
            <Input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => (setPassword(e.target.value), setErrors((x) => ({ ...x, password: undefined })))} invalid={Boolean(errors.password)} className="pr-10" placeholder="••••••••••" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 hover:text-brand" aria-label={show ? 'Hide password' : 'Show password'}>
              <Icon name={show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} className="text-xs" />
            </button>
          </div>
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy} data-testid="login-submit">
          Sign in
        </Button>
      </form>
      <p className="mt-5 text-center text-[11px] leading-relaxed text-gray-400">
        Forgot your password? Reset it on the server: <code className="rounded bg-gray-100 px-1">node server.js create-super-admin --email …</code>
      </p>
    </Shell>
  );
}
