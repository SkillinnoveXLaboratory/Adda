import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../lib/api.js';
import { Alert, Button, EmptyState, Icon } from '../../components/ui.jsx';
import { PasswordFields, validatePasswords } from '../../components/PasswordFields.jsx';
import { PublicCard, PublicLayout } from '../../layout/PublicLayout.jsx';

/** Staff invite / reset link landing page: POST /auth/password/setup { token, password }. */
export default function SetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Set password · adda';
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const errs = validatePasswords(password, confirm);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await api.post('/auth/password/setup', { token, password }, { auth: false }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <PublicCard>
        {!token || token.length < 20 ? (
          <EmptyState
            icon="fa-solid fa-link-slash"
            title="This link is incomplete"
            message="Open the full link from your invitation, or ask your society admin to generate a new one."
            action={
              <Link to="/login" className="text-xs font-semibold text-azea-purple hover:underline">
                Go to sign in
              </Link>
            }
          />
        ) : done ? (
          <div className="text-center" data-testid="setup-done">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
              <Icon name="fa-solid fa-check" className="text-xl" />
            </span>
            <h1 className="text-lg font-bold text-gray-800">Password set</h1>
            <p className="mt-1 text-xs text-azea-muted">
              You can now sign in as <span className="font-semibold text-gray-700">{done.email}</span>.
            </p>
            <Link to={`/login?email=${encodeURIComponent(done.email || '')}&activated=1`} className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-azea-purple px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-azea-purpleDark">
              Sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold tracking-tight text-gray-800">Set your password</h1>
            <p className="mt-1 text-xs leading-relaxed text-azea-muted">Choose a password for your adda admin account. Links expire, so finish this now.</p>
            {error && (
              <Alert tone="danger" className="mt-4" title="Couldn’t set the password">
                {error.message}
                {error.status === 400 && /expired|invalid/i.test(error.message) && <span className="mt-1 block">Ask your society admin or platform administrator for a new link.</span>}
              </Alert>
            )}
            <form onSubmit={submit} noValidate className="mt-6 space-y-5">
              <PasswordFields password={password} confirm={confirm} onPassword={(v) => (setPassword(v), setErrors((x) => ({ ...x, password: undefined })))} onConfirm={(v) => (setConfirm(v), setErrors((x) => ({ ...x, confirm: undefined })))} errors={errors} />
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                Save password
              </Button>
            </form>
          </>
        )}
      </PublicCard>
    </PublicLayout>
  );
}
