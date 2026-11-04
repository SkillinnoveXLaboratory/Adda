import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction } from '../../lib/hooks.js';
import { formatRelative } from '../../lib/format.js';
import { Button, Card, KeyValue, PageHeader } from '../../components/ui.jsx';
import { Field, Input } from '../../components/Form.jsx';
import { PasswordFields, validatePasswords } from '../../components/PasswordFields.jsx';
import { useToast } from '../../components/Toast.jsx';

function ChangePassword() {
  const toast = useToast();
  const [v, setV] = useState({ current: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [save, busy] = useAction(() => api.post('/me/password', { currentPassword: v.current, newPassword: v.password }), {
    toast,
    success: 'Password changed. Your other sessions were signed out.',
    onDone: () => setV({ current: '', password: '', confirm: '' }),
  });
  const submit = (e) => {
    e.preventDefault();
    const errs = validatePasswords(v.password, v.confirm);
    if (!v.current) errs.current = 'Enter your current password';
    else if (v.current === v.password) errs.password = 'Choose a password different from your current one';
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Current password" error={errors.current} htmlFor="current-password">
        <Input id="current-password" type="password" autoComplete="current-password" value={v.current} onChange={(e) => (setV({ ...v, current: e.target.value }), setErrors({}))} invalid={Boolean(errors.current)} />
      </Field>
      <PasswordFields password={v.password} confirm={v.confirm} onPassword={(x) => (setV({ ...v, password: x }), setErrors({}))} onConfirm={(x) => (setV({ ...v, confirm: x }), setErrors({}))} errors={errors} />
      <div className="flex justify-end">
        <Button type="submit" loading={busy} icon="fa-solid fa-key">
          Change password
        </Button>
      </div>
    </form>
  );
}

export default function Security() {
  const { user } = useAuth();
  return (
    <div>
      <PageHeader title="My security" subtitle="Your platform-owner account" />
      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-12 xl:col-span-4 self-start" title="Account">
          <KeyValue
            cols={1}
            items={[
              ['Name', user?.name],
              ['Email', user?.email],
              ['Last sign-in', user?.lastLoginAt ? formatRelative(user.lastLoginAt) : '—'],
            ]}
          />
          <p className="mt-5 rounded-lg bg-brand-bg px-3 py-2 text-[11px] leading-relaxed text-gray-600">
            Forgot your password? On the server run <code className="rounded bg-white px-1">node server.js create-super-admin --email {user?.email}</code> to set a new one.
          </p>
        </Card>
        <div className="col-span-12 space-y-6 xl:col-span-8">
          <Card title="Change password">
            <ChangePassword />
          </Card>
        </div>
      </div>
    </div>
  );
}
