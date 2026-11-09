import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../lib/auth.jsx';
import { normalizePhone, phoneError, phoneInput, PHONE_INPUT_MAX } from '../../lib/validation.js';
import { Alert, Button } from '../../components/ui.jsx';
import { Field, Input, PasswordInput } from '../../components/Form.jsx';
import { PublicCard, PublicLayout } from '../../layout/PublicLayout.jsx';

const REASONS = {
  expired: ['warning', 'Your session ended. Please sign in again.'],
  disabled: ['danger', 'This account has been disabled. Contact NIVASA support.'],
};
const TITLES = { NOT_VENDOR: 'Member account', ACCOUNT_LOCKED: 'Account locked', INVALID_CREDENTIALS: 'Sign-in failed', TOO_MANY_REQUESTS: 'Too many attempts' };

export default function Login() {
  const { login, isAuthenticated, clearEndReason } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const reason = REASONS[params.get('reason')];

  useEffect(() => {
    clearEndReason();
    document.title = 'Sign in · Nivasa Vendor';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isAuthenticated && !busy) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const errs = {};
    const pe = phoneError(phone);
    if (pe) errs.phone = pe;
    if (!password) errs.password = 'Enter your password';
    setErrors(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await login(normalizePhone(phone), password);
      const from = location.state?.from;
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true });
    } catch (err) {
      // The server says it this way too; keep the exact wording for member accounts.
      setError(err.code === 'NOT_VENDOR' ? { ...err, message: 'This is a member account. Members use the NIVASA app.' } : err);
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <PublicCard>
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-gray-800">Vendor sign in</h1>
          <p className="mt-1 text-xs text-azea-muted">Manage your services, properties, bookings and boosts.</p>
        </div>
        {reason && !error && (
          <Alert tone={reason[0]} className="mb-4" testId="session-alert">
            {reason[1]}
          </Alert>
        )}
        {error && (
          <Alert tone={error.status === 423 || error.status === 429 ? 'warning' : 'danger'} className="mb-4" title={TITLES[error.code] || 'Sign-in failed'} testId="login-error">
            {error.message}
            {error.code === 'NOT_VENDOR' && <span className="mt-1 block">To sell or offer services, create a vendor account with another mobile number.</span>}
          </Alert>
        )}
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Mobile number" error={errors.phone} htmlFor="phone">
            <Input id="phone" name="phone" prefix="+91" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} maxLength={PHONE_INPUT_MAX} onChange={(e) => (setPhone(phoneInput(e.target.value)), setErrors((x) => ({ ...x, phone: undefined })))} invalid={Boolean(errors.phone)} placeholder="98765 43210" autoFocus />
          </Field>
          <Field label="Password" error={errors.password} htmlFor="password">
            <PasswordInput id="password" name="password" autoComplete="current-password" value={password} maxLength={200} onChange={(e) => (setPassword(e.target.value), setErrors((x) => ({ ...x, password: undefined })))} invalid={Boolean(errors.password)} placeholder="Your password" />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy} data-testid="login-submit">
            Sign in
          </Button>
        </form>
        <p className="mt-5 text-center text-xs text-gray-500">
          New to NIVASA?{' '}
          <Link to="/register" className="inline-flex min-h-[40px] items-center font-semibold text-azea-purple hover:underline">
            Create a vendor account
          </Link>
        </p>
      </PublicCard>
      <p className="mt-4 text-center text-[11px] leading-relaxed text-azea-muted">Members (residents and customers) use the NIVASA app, not this website.</p>
    </PublicLayout>
  );
}
