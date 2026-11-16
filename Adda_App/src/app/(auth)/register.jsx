import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthHeading, AuthShell, FormError, LineField, OutlineAuthButton, PrimaryAuthButton, Steps, StrengthMeter } from '../../components/AuthKit';
import { AccountTypePicker } from '../../components/AccountTypePicker';
import { LocationPicker } from '../../components/LocationPicker';
import { T } from '../../components/Text';
import { Hint } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useAction } from '../../hooks/useApi';
import { toApiLocation } from '../../lib/location';
import { isValidPhone, nameError, passwordError, passwordStrength, PHONE_INPUT_MAX, phoneError, phoneInput } from '../../lib/validation';
import { colors } from '../../theme';

/**
 * Sign-up. Members: 1) account type + name + mobile, 2) password, then they join their society.
 * Vendors: 1) details, 2) shop name + shop location (location optional but prompted — it puts their services in
 * members' "Near me" search), 3) password, then KYC. Vendors never join a society.
 */
export default function Register() {
  const { register } = useAuth();
  const params = useLocalSearchParams();
  const [accountType, setAccountType] = useState(params.type === 'vendor' ? 'vendor' : 'member');
  const vendor = accountType === 'vendor';
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', phone: '', password: '', confirm: '', shopName: '' });
  const [location, setLocation] = useState(null);
  const [skipLocation, setSkipLocation] = useState(false);
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: k === 'phone' ? phoneInput(v) : v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  // Step numbers: members 1 details → 2 password; vendors 1 details → 2 shop → 3 password.
  const passwordStep = vendor ? 3 : 2;
  const labels = vendor ? ['Details', 'Shop', 'Password', 'KYC'] : ['Your details', 'Password', 'Join society'];

  const next = () => {
    if (step === 1) {
      const e = { name: nameError(form.name), phone: phoneError(form.phone) };
      setErrors(e);
      if (e.name || e.phone) return;
      setFormError(null);
      setStep(2);
      return;
    }
    if (vendor && step === 2) {
      const len = form.shopName.trim().length;
      const e = { shopName: len < 2 ? 'Enter your shop or business name (at least 2 characters)' : len > 80 ? 'Keep the shop name under 80 characters' : null };
      setErrors(e);
      if (e.shopName) return;
      if (!location && !skipLocation) {
        setFormError('Add your shop location so members nearby can find you — or tap “Skip for now”.');
        return;
      }
      setFormError(null);
      setStep(3);
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
      await register({ ...form, accountType, ...(vendor && { shopName: form.shopName, location: toApiLocation(location) }) });
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

  const subtitle = step === 1 ? 'Choose how you’ll use NIVASA.' : vendor && step === 2 ? 'Tell members about your shop.' : 'Choose a password to secure it.';

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
      {step > 1 ? (
        <Pressable onPress={() => (setStep(step - 1), setFormError(null))} accessibilityRole="button" hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, alignSelf: 'flex-start', minHeight: 44 }}>
          <Ionicons name="arrow-back" size={18} color={colors.navy} />
          <T weight="semibold" size={13} color={colors.navy}>
            Back
          </T>
        </Pressable>
      ) : null}
      <AuthHeading lead="Create your" strong={vendor ? 'vendor account' : 'account'} sub={subtitle} />
      <View style={{ marginTop: 18, marginBottom: 20 }}>
        <Steps total={labels.length} current={step} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          {labels.map((l, i) => (
            <T key={l} weight={i + 1 === step ? 'bold' : 'medium'} size={11.5} color={i + 1 <= step ? colors.navy : '#94a3b8'} numberOfLines={1} style={{ flex: 1, textAlign: i === 0 ? 'left' : i === labels.length - 1 ? 'right' : 'center' }}>
              {l}
            </T>
          ))}
        </View>
      </View>

      {step === 1 ? (
        <View style={{ gap: 16 }}>
          <AccountTypePicker value={accountType} onChange={setAccountType} />
          <LineField label="Full name" value={form.name} onChangeText={set('name')} placeholder={vendor ? 'As on your PAN card' : 'As per your society records'} autoCapitalize="words" autoComplete="name" textContentType="name" error={errors.name} returnKeyType="next" maxLength={120} />
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
      ) : vendor && step === 2 ? (
        <View style={{ gap: 16 }} testID="register-shop-step">
          <LineField label="Shop name" icon="storefront-outline" value={form.shopName} onChangeText={set('shopName')} placeholder="e.g. Sharma Electricals" autoCapitalize="words" maxLength={80} error={errors.shopName} hint="Members see this name on your services." />
          <LocationPicker
            label="Shop location"
            hint="Members searching “Near me” find services by this location. You can change it later in Shop settings."
            value={location}
            onChange={(l) => {
              setLocation(l);
              if (l) setFormError(null);
            }}
            testID="register-location"
          />
          {!location ? (
            <Pressable onPress={() => setSkipLocation((s) => !s)} accessibilityRole="checkbox" accessibilityState={{ checked: skipLocation }} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44 }} testID="register-skip-location">
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: skipLocation ? colors.primary : '#cbd5e1', backgroundColor: skipLocation ? colors.primary : colors.white, alignItems: 'center', justifyContent: 'center' }}>
                {skipLocation ? <Ionicons name="checkmark" size={15} color={colors.white} /> : null}
              </View>
              <T size={13} color="#64748b" style={{ flex: 1 }}>
                Skip for now — my services won’t appear in “Near me” until I add it
              </T>
            </Pressable>
          ) : null}
          <FormError message={formError} />
          <PrimaryAuthButton title="Continue" onPress={next} />
        </View>
      ) : step === passwordStep ? (
        <View style={{ gap: 16 }}>
          <LineField label="Create password" value={form.password} onChangeText={set('password')} secure autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" placeholder="At least 10 characters" error={errors.password} />
          <StrengthMeter score={form.password ? Math.max(1, passwordStrength(form.password)) : 0} />
          <LineField label="Confirm password" value={form.confirm} onChangeText={set('confirm')} secure autoCapitalize="none" placeholder="Re-enter password" error={errors.confirm} returnKeyType="go" onSubmitEditing={submit} />
          <Hint>Use at least 10 characters with letters and numbers. Never share your password — {vendor ? 'NIVASA' : 'the society office'} will never ask for it.</Hint>
          <Pressable onPress={() => setAgree((a) => !a)} accessibilityRole="checkbox" accessibilityState={{ checked: agree }} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: agree ? colors.primary : '#cbd5e1', backgroundColor: agree ? colors.primary : colors.white, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              {agree ? <Ionicons name="checkmark" size={15} color={colors.white} /> : null}
            </View>
            <T size={13} color="#64748b" style={{ flex: 1 }}>
              {vendor
                ? 'I confirm these details are mine and agree that NIVASA may verify my identity (KYC) before I can list properties or services.'
                : 'I confirm these details are mine and agree that my society may verify them before approving access.'}
            </T>
          </Pressable>
          <FormError message={formError} />
          <PrimaryAuthButton title="Create account" onPress={submit} loading={busy} />
        </View>
      ) : null}
    </AuthShell>
  );
}
