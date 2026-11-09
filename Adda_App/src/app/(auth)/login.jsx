import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { notify } from '../../lib/dialog';
import { AuthHeading, AuthShell, FormError, LineField, OrDivider, OutlineAuthButton, PrimaryAuthButton } from '../../components/AuthKit';
import { T } from '../../components/Text';
import { VendorPanelNotice } from '../../components/VendorPanelNotice';
import { TextLink } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useAction } from '../../hooks/useApi';
import { isValidPhone, PHONE_INPUT_MAX, phoneError, phoneInput } from '../../lib/validation';
import { colors } from '../../theme';

export default function Login() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [vendorAccount, setVendorAccount] = useState(false);

  const [submit, busy] = useAction(async () => {
    const next = { phone: phoneError(phone), password: password ? null : 'Enter your password' };
    setErrors(next);
    setFormError(null);
    setVendorAccount(false);
    if (next.phone || next.password) return;
    try {
      await signIn(phone, password);
      // The navigator moves to the right area automatically once the session is set.
    } catch (err) {
      if (err.code === 'VENDOR_USE_PANEL') setVendorAccount(true);
      else setFormError(err.code === 'PASSWORD_LOGIN_DISABLED' ? 'Password sign-in is not enabled on the server yet. Please contact your society office.' : err.message);
    }
  });

  return (
    <AuthShell
      footer={
        <T size={10.5} color="#94a3b8" style={{ textAlign: 'center', lineHeight: 16 }}>
          Your society office verifies every new resident before access is granted.
        </T>
      }
    >
      <AuthHeading lead="Welcome back" strong="" sub="Sign in with your mobile number and password." />
      <View style={{ gap: 14, marginTop: 18 }}>
        <LineField
          label="Mobile number"
          icon="phone-portrait-outline"
          prefix="+91"
          value={phone}
          onChangeText={(v) => {
            setPhone(phoneInput(v));
            if (errors.phone) setErrors((e) => ({ ...e, phone: null }));
          }}
          keyboardType="number-pad"
          maxLength={PHONE_INPUT_MAX}
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="10-digit mobile number"
          valid={isValidPhone(phone)}
          error={errors.phone}
          returnKeyType="next"
        />
        <LineField
          label="Password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (errors.password) setErrors((e) => ({ ...e, password: null }));
          }}
          secure
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          placeholder="Your password"
          error={errors.password}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <View style={{ alignItems: 'flex-end' }}>
          <TextLink
            title="Forgot Password?"
            color={colors.link}
            size={11.5}
            onPress={() => notify('Forgot your password?', 'Password reset by SMS is not available yet. Contact your society office and they can set a new password for you.')}
          />
        </View>
        {vendorAccount ? <VendorPanelNotice /> : null}
        <FormError message={formError} />
        <PrimaryAuthButton title="Login" onPress={submit} loading={busy} />
        <OrDivider />
        <OutlineAuthButton title="Create New Account" onPress={() => router.replace('/register')} />
      </View>
    </AuthShell>
  );
}
