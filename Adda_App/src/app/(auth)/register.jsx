import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthHeading, AuthShell, FormError, LineField, OutlineAuthButton, PrimaryAuthButton, Steps, StrengthMeter } from '../../components/AuthKit';
import { T } from '../../components/Text';
import { Hint } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useAction } from '../../hooks/useApi';
import { isValidPhone, nameError, passwordError, passwordStrength, PHONE_INPUT_MAX, phoneError, phoneInput } from '../../lib/validation';
import { colors } from '../../theme';

/**
 * Two-step member sign-up: 1) name + mobile, 2) password; then the member joins their society.
 * Vendors sign up on the NIVASA Vendor Panel website, so no account type is sent.
 */
export default function Register() {
  const { register } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', phone: '', password: '', confirm: '' });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: k === 'phone' ? phoneInput(v) : v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  const next = () => {
    const e = { name: nameError(form.name), phone: phoneError(form.phone) };
    setErrors(e);
    if (!e.name && !e.phone) {
      setFormError(null);
      setStep(2);
    }
  };

  const [submit, busy] = useAction(async () => {
    const e = {
      password: passwordError(form.password),
      confirm: form.confirm !== form.password ? 'Passwords do not match' : null,
    };
    setErrors(e);
    setFormError(null);
    if (e.password || e.confirm) return;
    if (!agree) return setFormError('Please accept the terms to continue.');
    try {
      await register(form);
    } catch (err) {
      if (err.code === 'ACCOUNT_EXISTS') {
        setFormError('An account with this mobile number already exists. Sign in instead.');
      } else if (err.code === 'PASSWORD_LOGIN_DISABLED') {
        setFormError('New sign-ups are not open on the server yet. Please contact your society office.');
      } else {
        setFormError(err.message);
      }
    }
  });

  return (
    <AuthShell
      footer={
        <View style={{ alignItems: 'center', gap: 10 }}>
          <T size={12} color={colors.muted}>
            Already have an account?
          </T>
          <View style={{ alignSelf: 'stretch' }}>
            <OutlineAuthButton title="Sign in" onPress={() => router.replace('/login')} />
          </View>
        </View>
      }
    >
      {step === 2 ? (
        <Pressable onPress={() => setStep(1)} accessibilityRole="button" hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, alignSelf: 'flex-start' }}>
          <Ionicons name="arrow-back" size={18} color={colors.navy} />
          <T weight="semibold" size={13} color={colors.navy}>
            Back
          </T>
        </Pressable>
      ) : null}
      <AuthHeading lead="Create your" strong="account" sub={step === 1 ? 'Tell us who you are — your society office will verify it.' : 'Choose a password to secure it.'} />
      <View style={{ marginTop: 18, marginBottom: 20 }}>
        <Steps total={3} current={step} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          {['Your details', 'Password', 'Join society'].map((l, i) => (
            <T key={l} weight={i + 1 === step ? 'bold' : 'medium'} size={11.5} color={i + 1 <= step ? colors.navy : '#94a3b8'} style={{ width: 90, textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center' }}>
              {l}
            </T>
          ))}
        </View>
      </View>

      {step === 1 ? (
        <View style={{ gap: 16 }}>
          <LineField label="Full name" value={form.name} onChangeText={set('name')} placeholder="As per your society records" autoCapitalize="words" autoComplete="name" textContentType="name" error={errors.name} returnKeyType="next" maxLength={120} />
          <LineField
            label="Mobile number"
            prefix="+91"
            value={form.phone}
            onChangeText={set('phone')}
            keyboardType="number-pad"
            maxLength={PHONE_INPUT_MAX}
            autoComplete="tel"
            placeholder="10-digit mobile number"
            valid={isValidPhone(form.phone)}
            error={errors.phone}
            hint="You'll use this number to sign in."
            returnKeyType="next"
            onSubmitEditing={next}
          />
          <FormError message={formError} />
          <PrimaryAuthButton title="Continue" onPress={next} />
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          <LineField label="Create password" value={form.password} onChangeText={set('password')} secure autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" placeholder="At least 10 characters" error={errors.password} />
          <StrengthMeter score={form.password ? Math.max(1, passwordStrength(form.password)) : 0} />
          <LineField label="Confirm password" value={form.confirm} onChangeText={set('confirm')} secure autoCapitalize="none" placeholder="Re-enter password" error={errors.confirm} returnKeyType="go" onSubmitEditing={submit} />
          <Hint>Use at least 10 characters with letters and numbers. Never share your password — the society office will never ask for it.</Hint>
          <Pressable onPress={() => setAgree((a) => !a)} accessibilityRole="checkbox" accessibilityState={{ checked: agree }} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: agree ? colors.primary : '#cbd5e1', backgroundColor: agree ? colors.primary : colors.white, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              {agree ? <Ionicons name="checkmark" size={15} color={colors.white} /> : null}
            </View>
            <T size={13} color="#64748b" style={{ flex: 1 }}>
              I confirm these details are mine and agree that my society may verify them before approving access.
            </T>
          </Pressable>
          <FormError message={formError} />
          <PrimaryAuthButton title="Create account" onPress={submit} loading={busy} />
        </View>
      )}
    </AuthShell>
  );
}
