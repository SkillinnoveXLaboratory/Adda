import { useCallback, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAction, useTitle } from '../lib/hooks.js';
import { formatPhone } from '../lib/format.js';
import { focusFirstError, nameError } from '../lib/validation.js';
import { Avatar, Badge, Button, Card, KeyValue, PageHeader } from '../components/ui.jsx';
import { Field, Input, PasswordInput } from '../components/Form.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import { PasswordFields, validatePasswords } from '../components/PasswordFields.jsx';
import { useToast } from '../components/Toast.jsx';

const KYC_BADGE = { approved: ['success', 'Verified vendor'], pending: ['warning', 'KYC under review'], rejected: ['danger', 'KYC needs changes'], not_submitted: ['warning', 'KYC not submitted'] };

/** Profile & security: name / email / city (PATCH /me), business name (from KYC), password, sign out everywhere. */
export default function Profile() {
  useTitle('Profile & security');
  const { user, vendor, kycStatus } = useAuth();
  const [tone, label] = KYC_BADGE[kycStatus] || KYC_BADGE.not_submitted;
  return (
    <div>
      <PageHeader title="Profile & security" subtitle="Your account details, password and signed-in devices." />
      <div className="card mb-6 flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
        <Avatar name={vendor?.businessName || user?.name} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-lg font-bold text-gray-800">{vendor?.businessName || user?.name}</p>
          {vendor?.businessName && vendor.businessName !== user?.name && <p className="text-xs text-gray-500">{user?.name}</p>}
          <p className="text-xs text-gray-500">{formatPhone(user?.phone)}</p>
          <Badge tone={tone} className="mt-1.5">
            {label}
          </Badge>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <AccountCard />
          <Card title="Business">
            <KeyValue
              items={[
                ['Business name', vendor?.businessName || '—'],
                ['Sign-in mobile', formatPhone(user?.phone)],
              ]}
            />
            <p className="mt-4 text-[11px] leading-relaxed text-azea-muted">
              The business name comes from your KYC.{' '}
              {kycStatus === 'approved' ? (
                'After approval it can only be changed by NIVASA support.'
              ) : (
                <>
                  Change it on the{' '}
                  <Link to="/kyc" className="link">
                    KYC page
                  </Link>{' '}
                  when you submit.
                </>
              )}{' '}
              To change your sign-in mobile number, contact NIVASA support.
            </p>
          </Card>
        </div>
        <div className="space-y-6">
          <PasswordCard />
          <SessionsCard />
        </div>
      </div>
    </div>
  );
}

function AccountCard() {
  const { user, refreshProfile } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: user?.name || '', email: user?.email || '', city: user?.city || '' });
  const [errors, setErrors] = useState({});
  const ids = { name: useId(), email: useId(), city: useId() };
  const set = (k) => (e) => (setF((x) => ({ ...x, [k]: e.target.value })), setErrors((x) => ({ ...x, [k]: undefined })));
  const dirty = f.name.trim() !== (user?.name || '') || f.email.trim() !== (user?.email || '') || f.city.trim() !== (user?.city || '');
  const [save, busy] = useAction(
    useCallback(async () => {
      const e = { name: nameError(f.name), email: f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim()) ? 'Enter a valid email address, e.g. ravi@example.com' : null };
      Object.keys(e).forEach((k) => !e[k] && delete e[k]);
      setErrors(e);
      if (Object.keys(e).length) {
        focusFirstError(e);
        throw new Error('Please fix the highlighted fields');
      }
      await api.patch('/me', { name: f.name.trim(), ...(f.email.trim() ? { email: f.email.trim().toLowerCase() } : {}), ...(f.city.trim() ? { city: f.city.trim() } : {}) });
      await refreshProfile();
    }, [f, refreshProfile]),
    { toast, success: 'Profile saved' },
  );
  return (
    <Card title="Your details">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
        className="space-y-4"
      >
        <Field label="Full name" error={errors.name} htmlFor={ids.name} required>
          <Input id={ids.name} name="name" value={f.name} onChange={set('name')} maxLength={120} invalid={Boolean(errors.name)} autoComplete="name" placeholder="e.g. Ravi Kumar" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email (optional)" error={errors.email} htmlFor={ids.email}>
            <Input id={ids.email} name="email" type="email" value={f.email} onChange={set('email')} maxLength={160} invalid={Boolean(errors.email)} autoComplete="email" placeholder="ravi@example.com" />
          </Field>
          <Field label="City (optional)" htmlFor={ids.city}>
            <Input id={ids.city} name="city" value={f.city} onChange={set('city')} maxLength={80} placeholder="e.g. Pune" />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={busy} disabled={!dirty} data-testid="profile-save">
            Save details
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const currentId = useId();
  const [save, busy] = useAction(
    useCallback(async () => {
      const e = { ...(current ? {} : { current: 'Enter your current password' }), ...validatePasswords(password, confirm) };
      if (!e.password && current && password === current) e.password = 'Choose a password different from the current one';
      setErrors(e);
      if (Object.keys(e).length) {
        focusFirstError(e);
        throw new Error('Please fix the highlighted fields');
      }
      try {
        await api.post('/me/password', { currentPassword: current, newPassword: password });
      } catch (err) {
        if (err.code === 'PASSWORD_INCORRECT') setErrors({ current: err.message });
        throw err;
      }
      setCurrent('');
      setPassword('');
      setConfirm('');
    }, [current, password, confirm]),
    { toast, success: 'Password changed. Other devices were signed out.' },
  );
  return (
    <Card title="Change password">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
        className="space-y-4"
      >
        <Field label="Current password" error={errors.current} htmlFor={currentId}>
          <PasswordInput id={currentId} name="current" autoComplete="current-password" value={current} onChange={(e) => (setCurrent(e.target.value), setErrors((x) => ({ ...x, current: undefined })))} invalid={Boolean(errors.current)} maxLength={200} placeholder="Your current password" />
        </Field>
        <PasswordFields label="New password" password={password} confirm={confirm} onPassword={(v) => (setPassword(v), setErrors((x) => ({ ...x, password: undefined })))} onConfirm={(v) => (setConfirm(v), setErrors((x) => ({ ...x, confirm: undefined })))} errors={errors} />
        <div className="flex justify-end">
          <Button type="submit" loading={busy} data-testid="password-save">
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const { logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [ask, setAsk] = useState(false);
  const [out, busy] = useAction(
    useCallback(async () => {
      await logout({ everywhere: true });
      navigate('/login', { replace: true });
    }, [logout, navigate]),
    { toast },
  );
  return (
    <Card title="Signed-in devices">
      <p className="text-xs leading-relaxed text-gray-600">Lost a device, or used a shared computer? Sign out everywhere, including this browser. You’ll need your mobile number and password to sign in again.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="danger-outline" icon="fa-solid fa-right-from-bracket" onClick={() => setAsk(true)} data-testid="logout-all">
          Sign out everywhere
        </Button>
      </div>
      <ConfirmDialog open={ask} onClose={() => !busy && setAsk(false)} busy={busy} title="Sign out everywhere?" message="Every session of this account ends, including this one." confirmLabel="Sign out everywhere" onConfirm={() => out()} />
    </Card>
  );
}
