import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { useToast } from '../context/toast';
import { useAction } from '../hooks/useApi';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { colors, shadow } from '../theme';
import { Badge, Button, Field, T } from './ui';

const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Vendor's Cashfree payout account (skills/cashfree-payments → "Vendor payout account"), from GET /vendor/profile → payout.
 * Members can pay this vendor online only when it is `active`; cash (COD / mark-paid) always works.
 * The account is created by the server on KYC approval and needs the vendor's email (added here via PATCH /me).
 */
export function PayoutStatusCard({ payout: initial, kycStatus }) {
  const toast = useToast();
  const { user, refreshProfile } = useAuth();
  const [payout, setPayout] = useState(initial || null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(null);
  const st = payout?.status || 'not_created';
  const available = !!payout && payout.available !== false;
  const askEmail = !user?.email && available && st !== 'active';

  const [refresh, refreshing] = useAction(async () => {
    try {
      const p = await api('/vendor/payout/refresh', { method: 'POST', body: {} });
      setPayout(p);
      toast.success(p.status === 'active' ? 'Online payments are on' : p.status === 'pending' ? 'Still being verified. Check again later.' : 'Status updated');
    } catch (err) {
      toast.error(err.message);
    }
  });

  const [saveEmail, saving] = useAction(async () => {
    const v = email.trim().toLowerCase();
    if (!EMAIL_RX.test(v)) return setEmailError('Enter a valid email address, e.g. name@example.com');
    setEmailError(null);
    try {
      await api('/me', { method: 'PATCH', body: { email: v } });
      await refreshProfile().catch(() => {});
      toast.success('Email saved');
    } catch (err) {
      if (err.details?.length) setEmailError(err.details.map((d) => d.message).join(' '));
      toast.error(err.message);
    }
    return undefined;
  });

  let view;
  if (!available) {
    view = { icon: 'card-outline', tone: 'neutral', badge: 'Not available', title: 'Online payments are not available yet', body: 'NIVASA has not switched on online payments yet. Members pay you in cash on delivery, at pickup or after the job.' };
  } else if (st === 'active') {
    view = { icon: 'checkmark-circle', tone: 'success', badge: 'Active', title: 'Online payments on (Cashfree)', body: 'Members can pay you online. Cashfree settles your share to your bank account. Cash still works too.' };
  } else if (st === 'pending') {
    view = { icon: 'time-outline', tone: 'warning', badge: 'Verifying', title: 'Bank verification in progress', body: 'Cashfree is verifying your bank account. Members can pay you in cash until it is active.', refresh: true };
  } else if (st === 'failed') {
    view = {
      icon: 'alert-circle-outline',
      tone: 'danger',
      badge: 'Needs attention',
      title: 'Payout account could not be set up',
      body: `${payout.message || 'Cashfree could not create your payout account.'} ${askEmail ? 'Add your email below, then ask NIVASA support to retry.' : 'Check your KYC bank details, then ask NIVASA support to retry.'}`,
    };
  } else if (st === 'blocked') {
    view = { icon: 'ban-outline', tone: 'danger', badge: 'Blocked', title: 'Payout account blocked', body: `${payout.message ? `${payout.message} ` : ''}Contact NIVASA support. Members can still pay you in cash.` };
  } else {
    const approved = kycStatus === 'approved';
    view = {
      icon: 'hourglass-outline',
      tone: 'neutral',
      badge: 'Not set up',
      title: approved ? 'Payout account not set up yet' : 'Will be set up after KYC approval',
      body: approved ? 'NIVASA sets up your Cashfree payout account from your approved KYC. Ask NIVASA support if this takes more than a day.' : 'Once NIVASA approves your KYC, your bank account is registered with Cashfree so members can pay you online.',
    };
  }
  const fg = { success: colors.green, warning: colors.amber, danger: colors.danger, neutral: colors.muted }[view.tone];

  return (
    <View style={styles.card} testID="payout-status">
      <View style={styles.head}>
        <Ionicons name={view.icon} size={22} color={fg} />
        <T weight="extrabold" size={13.5} color={colors.navy} style={{ flex: 1, minWidth: 0 }}>
          {view.title}
        </T>
        <Badge label={view.badge} tone={view.tone} style={{ flexShrink: 0 }} />
      </View>
      <T size={12} color={colors.textSoft} style={{ lineHeight: 18 }}>
        {view.body}
      </T>
      {payout?.updatedAt && available ? (
        <T size={11} color={colors.muted}>
          Last checked {formatDateTime(payout.updatedAt)}
        </T>
      ) : null}
      {view.refresh ? <Button small title="Refresh status" icon="refresh" variant="brand" loading={refreshing} onPress={refresh} style={{ minHeight: 44 }} /> : null}
      {askEmail ? (
        <View style={styles.email}>
          <T size={12} color={colors.amber} style={{ lineHeight: 17 }}>
            Cashfree needs an email address for your payout account. Your account has none yet.
          </T>
          <Field label="Email" value={email} onChangeText={(v) => (setEmail(v), setEmailError(null))} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={200} placeholder="name@example.com" error={emailError} testID="payout-email" />
          <Button small title="Save email" icon="mail-outline" variant="outline" loading={saving} onPress={saveEmail} style={{ minHeight: 44 }} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8, ...shadow.card },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  email: { gap: 8, backgroundColor: colors.amberBg, borderRadius: 12, padding: 10 },
});
