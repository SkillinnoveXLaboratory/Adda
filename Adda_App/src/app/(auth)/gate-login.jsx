import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthHeading, AuthShell, FormError, LineField, PrimaryAuthButton } from '../../components/AuthKit';
import { T } from '../../components/Text';
import { Hint } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useAction } from '../../hooks/useApi';
import { colors } from '../../theme';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Clear messages for the gate sign-in refusals (skills/gate-security). */
const MESSAGES = {
  NOT_GATEMAN: 'This account is not a gate staff account. Members and vendors sign in with their mobile number.',
  SOCIETY_SUSPENDED: 'This society is suspended on NIVASA, so the gate screens are not available. Contact your society office.',
  ACCOUNT_DISABLED: 'This gate account has been switched off. Contact your society office.',
};

/**
 * Gate staff (gatemen) sign in with the email and password their society office created for them.
 * The session only opens the gate screens.
 */
export default function GateLogin() {
  const { gateLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const [submit, busy] = useAction(async () => {
    const e = { email: EMAIL_RX.test(email.trim()) ? null : 'Enter the email your society office gave you (e.g. gate1@society.in)', password: password ? null : 'Enter your password' };
    setErrors(e);
    setFormError(null);
    if (e.email || e.password) return;
    try {
      await gateLogin(email, password);
    } catch (err) {
      setFormError(MESSAGES[err.code] || err.message);
    }
  });

  const back = () => router.replace('/login');

  return (
    <AuthShell
      footer={
        <T size={10.5} color="#94a3b8" style={{ textAlign: 'center', lineHeight: 16 }}>
          Gate accounts are created by your society office in the NIVASA society portal.
        </T>
      }
    >
      <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back to member sign-in" hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, alignSelf: 'flex-start', minHeight: 44 }}>
        <Ionicons name="arrow-back" size={18} color={colors.navy} />
        <T weight="semibold" size={13} color={colors.navy}>
          Back
        </T>
      </Pressable>
      <AuthHeading lead="Gate staff" strong="sign-in" sub="For security guards at the society gate." />
      <View style={{ gap: 14, marginTop: 18 }} testID="gate-login-form">
        <LineField
          label="Email"
          icon="mail-outline"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (errors.email) setErrors((x) => ({ ...x, email: null }));
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="username"
          placeholder="gate@yoursociety.in"
          maxLength={160}
          error={errors.email}
          returnKeyType="next"
        />
        <LineField
          label="Password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (errors.password) setErrors((x) => ({ ...x, password: null }));
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
        <FormError message={formError} />
        <PrimaryAuthButton title="Sign in to the gate" onPress={submit} loading={busy} />
        <Hint icon="shield-checkmark-outline">Forgot your password? Ask your society office to set a new one.</Hint>
      </View>
    </AuthShell>
  );
}
