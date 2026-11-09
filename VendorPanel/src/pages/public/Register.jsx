import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../lib/auth.jsx';
import { focusFirstError, nameError, normalizePhone, phoneError, phoneInput, PHONE_INPUT_MAX } from '../../lib/validation.js';
import { Alert, Button } from '../../components/ui.jsx';
import { Field, Input } from '../../components/Form.jsx';
import { PasswordFields, validatePasswords } from '../../components/PasswordFields.jsx';
import { useToast } from '../../components/Toast.jsx';
import { PublicCard, PublicLayout } from '../../layout/PublicLayout.jsx';

/** Vendor sign-up: POST /auth/vendor/register → signed in, lands on the dashboard (KYC next). */
export default function Register() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ name: '', businessName: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => (setF((x) => ({ ...x, [k]: v })), setErrors((e) => ({ ...e, [k]: undefined })));

  useEffect(() => {
    document.title = 'Create account · Nivasa Vendor';
  }, []);

  if (isAuthenticated && !busy) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const errs = {
      name: nameError(f.name),
      businessName: f.businessName.trim() && f.businessName.trim().length < 2 ? 'Use at least 2 characters, or leave it empty' : null,
      phone: phoneError(f.phone),
      ...validatePasswords(f.password, f.confirm),
    };
    Object.keys(errs).forEach((k) => !errs[k] && delete errs[k]);
    setErrors(errs);
    setError(null);
    if (Object.keys(errs).length) return focusFirstError(errs);
    setBusy(true);
    try {
      await register({ phone: normalizePhone(f.phone), name: f.name.trim(), businessName: f.businessName.trim(), password: f.password });
      toast.success('Account created. Next: complete your KYC.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <PublicCard>
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-gray-800">Create a vendor account</h1>
          <p className="mt-1 text-xs leading-relaxed text-azea-muted">For businesses and professionals who list services or properties on NIVASA. Use a mobile number that is not already a NIVASA member account.</p>
        </div>
        {error && (
          <Alert tone="danger" className="mb-4" title={error.code === 'ACCOUNT_EXISTS' ? 'Number already registered' : 'Could not create the account'} testId="register-error">
            {error.message}
            {error.code === 'ACCOUNT_EXISTS' && (
              <Link to={`/login?phone=${normalizePhone(f.phone)}`} className="mt-1 block font-semibold underline">
                Sign in instead
              </Link>
            )}
          </Alert>
        )}
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Your full name" error={errors.name} htmlFor="name" required>
            <Input id="name" name="name" autoComplete="name" value={f.name} onChange={(e) => set('name')(e.target.value)} invalid={Boolean(errors.name)} maxLength={120} placeholder="e.g. Ravi Kumar" autoFocus />
          </Field>
          <Field label="Business name (optional)" error={errors.businessName} htmlFor="businessName" hint="Shown to customers. Leave empty to use your name.">
            <Input id="businessName" name="businessName" autoComplete="organization" value={f.businessName} onChange={(e) => set('businessName')(e.target.value)} invalid={Boolean(errors.businessName)} maxLength={120} placeholder="e.g. Ravi Plumbing Services" />
          </Field>
          <Field label="Mobile number" error={errors.phone} htmlFor="phone" required hint="You sign in with this number.">
            <Input id="phone" name="phone" prefix="+91" type="tel" inputMode="numeric" autoComplete="tel-national" value={f.phone} maxLength={PHONE_INPUT_MAX} onChange={(e) => set('phone')(phoneInput(e.target.value))} invalid={Boolean(errors.phone)} placeholder="98765 43210" />
          </Field>
          <PasswordFields password={f.password} confirm={f.confirm} onPassword={set('password')} onConfirm={set('confirm')} errors={errors} />
          <Button type="submit" size="lg" className="w-full" loading={busy} data-testid="register-submit">
            Create account
          </Button>
        </form>
        <p className="mt-5 text-center text-xs text-gray-500">
          Already have a vendor account?{' '}
          <Link to="/login" className="inline-flex min-h-[40px] items-center font-semibold text-azea-purple hover:underline">
            Sign in
          </Link>
        </p>
      </PublicCard>
    </PublicLayout>
  );
}
