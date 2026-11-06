import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { notify } from '../../lib/dialog';
import { AuthHeading, AuthShell, FormError, LineField, OrDivider, OutlineAuthButton, PrimaryAuthButton } from '../../components/AuthKit';
import { T } from '../../components/Text';
import { AccountTypePicker } from '../../components/AccountTypePicker';
import { TextLink } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useAction } from '../../hooks/useApi';
import { isValidPhone, PHONE_INPUT_MAX, phoneError, phoneInput } from '../../lib/validation';
import { colors } from '../../theme';

export default function Login() {
  const { signIn } = useAuth();
  const [accountType, setAccountType] = useState('member');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const [submit, busy] = useAction(async () => {
    const next = { phone: phoneError(phone), password: password ? null : 'Enter your password' };
    setErrors(next);
    setFormError(null);
    if (next.phone || next.password) return;
    try {
      await signIn(phone, password, accountType);
      // The navigator moves to the right area automatically once the session is set.
    } catch (err) {
      if (err.code === 'WRONG_ACCOUNT_TYPE') {
        // Offer the right switch instead of a dead end.
        setAccountType(err.accountType);
        setFormError(err.message);
      } else {
        setFormError(err.code === 'PASSWORD_LOGIN_DISABLED' ? 'Password sign-in is not enabled on the server yet. Please contact your society office.' : err.message);
      }
    }
  });

  return (
    <AuthShell
      footer={
        <T size={10.5} color="#94a3b8" style={{ textAlign: 'center', lineHeight: 16 }}>
          {accountType === 'vendor' ? 'Vendors are verified by NIVASA (KYC) before they can list properties or services.' : 'Your society office verifies every new resident before access is granted.'}
        </T>
      }
    >
      <AuthHeading lead="Welcome back" strong="" sub="Sign in with your mobile number and password." />
      <View style={{ gap: 14, marginTop: 18 }}>
        <AccountTypePicker compact value={accountType} onChange={(t) => (setAccountType(t), setFormError(null))} />
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
        <FormError message={formError} />
        <PrimaryAuthButton title="Login" onPress={submit} loading={busy} />
        <OrDivider />
        <OutlineAuthButton title={accountType === 'vendor' ? 'Register as a Vendor' : 'Create New Account'} onPress={() => router.replace({ pathname: '/register', params: { type: accountType } })} />
      </View>
    </AuthShell>
  );
}
