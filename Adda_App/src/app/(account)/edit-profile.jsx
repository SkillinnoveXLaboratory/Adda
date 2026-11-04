import { useState } from 'react';
import { Button, DetailHeader, Field, Hint, Screen, returnTo } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useToast } from '../../context/toast';
import { useAction } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { nameError } from '../../lib/validation';

export default function EditProfile() {
  const { user, refreshProfile, isMember } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [city, setCity] = useState(user?.city || '');
  const [errors, setErrors] = useState({});

  const [save, busy] = useAction(async () => {
    const e = { name: nameError(name), email: email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? 'Enter a valid email address' : null };
    setErrors(e);
    if (e.name || e.email) return;
    try {
      await api('/me', { method: 'PATCH', body: { name: name.trim(), ...(email.trim() && { email: email.trim().toLowerCase() }), city: city.trim() } });
      await refreshProfile();
      toast.success('Profile updated');
      returnTo(isMember ? '/profile' : '/society');
    } catch (err) {
      toast.error(err.message);
    }
  });

  return (
    <Screen header={<DetailHeader title="Edit profile" fallback="/" />} footer={<Button title="Save changes" onPress={save} loading={busy} />}>
      <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={120} error={errors.name} />
      <Field label="Mobile number" value={`+91 ${user?.phone || ''}`} editable={false} hint="Your mobile number is your sign-in ID and can't be changed here." />
      <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={200} error={errors.email} />
      <Field label="City (optional)" value={city} onChangeText={setCity} autoCapitalize="words" maxLength={80} />
      <Hint>Your name is shown to your society office and on community posts.</Hint>
    </Screen>
  );
}
