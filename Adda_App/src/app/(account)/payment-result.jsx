import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { TestModeBadge } from '../../components/Checkout';
import { Button, Card, DetailHeader, Screen, T } from '../../components/ui';
import { checkoutOutcome, refreshCheckout } from '../../lib/checkout';
import { money } from '../../lib/format';
import { colors } from '../../theme';

const TITLE = {
  paid: 'Payment successful',
  failed: 'Payment failed',
  pending: 'Still confirming with the bank',
  expired: 'Payment session expired',
  mismatch: 'We couldn’t apply this payment',
};

/**
 * `addaapp://payment-result?order_id=…` — where the hosted checkout sends the member back. Normally the checkout's auth
 * session catches this link and the paying screen shows the result, so we just step back to it. When the app was
 * opened from the link (no screen to go back to), ask the server for the status and show it here.
 */
export default function PaymentResult() {
  const params = useLocalSearchParams();
  const orderId = String(params.order_id || '');
  const [standalone] = useState(() => !router.canGoBack());
  const [state, setState] = useState(() => (orderId ? { loading: true, checkout: null, error: null } : { loading: false, checkout: null, error: 'This payment link is missing its reference.' }));

  const load = useCallback(() => {
    if (!orderId) return;
    refreshCheckout(orderId).then(
      (checkout) => setState({ loading: false, checkout, error: null }),
      (err) => setState({ loading: false, checkout: null, error: err.message }),
    );
  }, [orderId]);
  const check = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    load();
  };

  useEffect(() => {
    if (!standalone) router.back();
    else load();
  }, [standalone, load]);

  const c = state.checkout;
  const outcome = c ? checkoutOutcome(c) : null;
  return (
    <Screen header={<DetailHeader title="Payment" fallback="/" />}>
      {!standalone || state.loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 48, gap: 12 }}>
          <ActivityIndicator color={colors.navy} />
          <T size={13} color={colors.muted}>
            Checking your payment…
          </T>
        </View>
      ) : (
        <Card style={{ gap: 8, alignItems: 'center' }}>
          <T weight="extrabold" size={17} color={colors.navy} style={{ textAlign: 'center' }} accessibilityRole="header">
            {state.error ? 'Couldn’t check the payment' : TITLE[outcome]}
          </T>
          {c?.amountPaise ? (
            <T weight="extrabold" size={20} color={colors.navy}>
              {money(c.amountPaise)}
            </T>
          ) : null}
          <T size={13} color={colors.textSoft} style={{ textAlign: 'center' }}>
            {state.error || (outcome === 'paid' ? 'Thank you — the payment was received.' : outcome === 'failed' ? `${c.lastError}. You can try again from where you started.` : outcome === 'expired' ? 'Start the payment again from where you started.' : 'If you finished paying, the bank may take a minute. Tap Refresh to check again.')}
          </T>
          {c?.mode === 'sandbox' ? <TestModeBadge /> : null}
          {orderId ? (
            <T size={11} color={colors.subtle} selectable>
              Reference: {orderId}
            </T>
          ) : null}
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
            {state.error || outcome === 'pending' ? <Button title="Refresh" icon="refresh" variant="brand" onPress={check} /> : null}
            <Button title="Done" variant="alt" onPress={() => router.replace('/')} />
          </View>
        </Card>
      )}
    </Screen>
  );
}
