import { useState } from 'react';
import { Button, DetailHeader, Field, Hint, Screen, returnTo } from '../../components/ui';
import { useToast } from '../../context/toast';
import { useAction } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { passwordError } from '../../lib/validation';

/** POST /me/password — also used after the society office / platform sets a temporary password. */
export default function ChangePassword() {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const set = (k) => (v) => (setForm((f) => ({ ...f, [k]: v })), setErrors((e) => ({ ...e, [k]: null })));

  const [save, busy] = useAction(async () => {
    const e = {
      current: form.current ? null : 'Enter your current password',
      next: passwordError(form.next) || (form.next && form.next === form.current ? 'Choose a password different from your current one' : null),
      confirm: form.confirm !== form.next ? 'Passwords do not match' : null,
    };
    setErrors(e);
    if (e.current || e.next || e.confirm) return;
    try {
      await api('/me/password', { method: 'POST', body: { currentPassword: form.current, newPassword: form.next } });
      toast.success('Password changed. Other devices were signed out.');
      returnTo('/profile');
    } catch (err) {
      if (err.code === 'PASSWORD_INCORRECT') setErrors({ current: err.message });
      else toast.error(err.message);
    }
  });

  return (
    <Screen header={<DetailHeader title="Change password" fallback="/profile" />} footer={<Button title="Change password" onPress={save} loading={busy} />}>
      <Field label="Current password" value={form.current} onChangeText={set('current')} secure autoCapitalize="none" autoComplete="current-password" textContentType="password" error={errors.current} />
      <Field label="New password" value={form.next} onChangeText={set('next')} secure autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" placeholder="At least 10 characters, letters and numbers" error={errors.next} />
      <Field label="Confirm new password" value={form.confirm} onChangeText={set('confirm')} secure autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" error={errors.confirm} />
      <Hint>If the society office gave you a temporary password, change it here. You stay signed in on this phone; other devices are signed out.</Hint>
    </Screen>
  );
}
