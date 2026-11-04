import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../lib/api.js';
import { isEmail } from '../../lib/validation.js';
import { Alert, Button, Icon } from '../../components/ui.jsx';
import { Field, Input } from '../../components/Form.jsx';
import { PublicCard, PublicLayout } from '../../layout/PublicLayout.jsx';

/** POST /auth/password/reset-request — the server's message is shown as-is (it says when email is not configured). */
export default function ForgotPassword() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Reset password · adda';
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!isEmail(email)) return setFieldError('Enter a valid email address');
    setBusy(true);
    setError(null);
    try {
      setResult(await api.post('/auth/password/reset-request', { email: email.trim().toLowerCase() }, { auth: false }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <PublicCard>
        <Link to="/login" className="mb-5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-azea-purple">
          <Icon name="fa-solid fa-arrow-left" /> Back to sign in
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-gray-800">Reset your password</h1>
        <p className="mt-1 text-xs leading-relaxed text-azea-muted">Enter the email address you use to sign in. If email delivery is set up, we’ll send you a reset link.</p>
        {result ? (
          <div className="mt-6 space-y-4" data-testid="reset-result">
            <Alert tone={result.emailDelivery ? 'success' : 'warning'} title={result.emailDelivery ? 'Check your inbox' : 'Email is not available'}>
              {result.message}
            </Alert>
            {!result.emailDelivery && <p className="text-[11px] leading-relaxed text-azea-muted">A society admin can regenerate your access link from Staff &amp; roles, or the platform administrator can issue a reset link from the Societies page.</p>}
            <Link to="/login" className="inline-flex w-full items-center justify-center rounded-lg bg-azea-purple px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-azea-purpleDark">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            {error && <Alert tone="danger">{error.message}</Alert>}
            <Field label="Email address" error={fieldError} htmlFor="reset-email">
              <Input id="reset-email" name="email" type="email" value={email} autoFocus onChange={(e) => (setEmail(e.target.value), setFieldError(null))} invalid={Boolean(fieldError)} placeholder="you@society.org" />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Send reset link
            </Button>
          </form>
        )}
      </PublicCard>
    </PublicLayout>
  );
}
