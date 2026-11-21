import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { checkoutOf, checkoutOutcome, openCheckout, payErrorCopy, refreshCheckout } from '../lib/checkout';
import { formatDateTime, money } from '../lib/format';
import { colors } from '../theme';
import { Badge, Button, T } from './ui';

// ------------------------------------------------------------------ gateway config (GET /public/config → payments)
let paymentsCache = null;
let paymentsInFlight = null;
function loadPayments() {
  if (!paymentsInFlight) {
    paymentsInFlight = api('/public/config', { auth: false }).then(
      (d) => {
        paymentsCache = d?.payments || { gatewayConfigured: false, provider: null, mode: null };
        return paymentsCache;
      },
      (err) => {
        paymentsInFlight = null;
        throw err;
      },
    );
  }
  return paymentsInFlight;
}

/** `{ loaded, configured, mode, testMode }` — testMode when Cashfree runs in sandbox (no real money). */
export function usePaymentsConfig() {
  const [cfg, setCfg] = useState(paymentsCache);
  useEffect(() => {
    if (paymentsCache) return undefined;
    let alive = true;
    loadPayments()
      .then((p) => alive && setCfg(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return { loaded: !!cfg, configured: !!cfg?.gatewayConfigured, mode: cfg?.mode || null, testMode: cfg?.mode === 'sandbox' };
}

/** Shown on every pay button / sheet while the gateway is in sandbox. */
export function TestModeBadge({ style }) {
  return <Badge tone="warning" label="Test mode · no real money" style={style} />;
}

/** Gold pay button + the "Test mode" badge under it in sandbox. */
export function PayButton({ title, onPress, loading, disabled, icon = 'card-outline', variant = 'gold', testID, style, small }) {
  const { testMode } = usePaymentsConfig();
  return (
    <View style={[{ gap: 6 }, style]} testID={testID}>
      <Button title={title} icon={icon} variant={variant} onPress={onPress} loading={loading} disabled={disabled} small={small} />
      {testMode ? (
        <View style={styles.testRow} testID={testID ? `${testID}-test-mode` : undefined}>
          <TestModeBadge />
          <T size={11} color={colors.muted} style={{ flex: 1, minWidth: 0 }}>
            Cashfree sandbox — use test cards/UPI.
          </T>
        </View>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ checkout flow + result sheet
/**
 * Runs an online payment and shows the server's verdict in a sheet.
 *   const pay = useCheckout({ onResult: reload });
 *   pay.start('/resident/invoices/ID/pay')                  // POST the pay endpoint, open checkout, refresh, show
 *   pay.start('/product-orders/ID/pay', { checkout })       // checkout already returned (place order); path = retries
 *   {pay.sheet}                                             // render once in the screen
 * `onResult(outcome)` after every server answer; `onClose(outcome)` when the member closes the sheet.
 */
export function useCheckout({ onResult, onClose } = {}) {
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pathRef = useRef(null);
  const handlers = useRef({ onResult, onClose });
  useEffect(() => {
    handlers.current = { onResult, onClose };
  }, [onResult, onClose]);

  const show = useCallback((checkout) => {
    const state = checkoutOutcome(checkout);
    setSheet({ state, checkout });
    handlers.current.onResult?.(state);
  }, []);

  const start = useCallback(
    async (path, { checkout: initial } = {}) => {
      if (busyRef.current) return; // no double taps
      busyRef.current = true;
      setBusy(true);
      pathRef.current = path;
      try {
        const checkout = initial || checkoutOf(await api(path, { method: 'POST' }));
        if (!checkout?.orderId) throw Object.assign(new Error('The payment could not be started. Please try again.'), { code: 'NO_CHECKOUT' });
        try {
          setSheet({ state: 'opening', checkout });
          show(await openCheckout(checkout));
        } catch (err) {
          // The checkout exists; we just couldn't ask the server — let the member refresh.
          setSheet({ state: 'pending', checkout, note: err?.message });
        }
      } catch (err) {
        setSheet({ state: 'error', error: payErrorCopy(err) });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [show],
  );

  const refresh = useCallback(async () => {
    const c = sheet?.checkout;
    if (!c || busyRef.current) return;
    busyRef.current = true;
    setSheet((s) => ({ ...s, refreshing: true, note: null }));
    try {
      show(await refreshCheckout(c.orderId));
    } catch (err) {
      setSheet((s) => ({ ...s, refreshing: false, note: err?.message }));
    } finally {
      busyRef.current = false;
    }
  }, [sheet, show]);

  const retry = useCallback(() => {
    if (pathRef.current) start(pathRef.current);
  }, [start]);

  const close = useCallback(() => {
    const state = sheet?.state;
    setSheet(null);
    handlers.current.onClose?.(state);
  }, [sheet]);

  const element = <PaymentSheet sheet={sheet} onRefresh={refresh} onRetry={retry} onClose={close} />;
  return { start, busy, sheet: element, state: sheet?.state || null };
}

const COPY = {
  opening: { icon: null, title: 'Checking your payment…', tone: colors.navy },
  paid: { icon: 'checkmark-circle', title: 'Payment successful', tone: colors.green },
  failed: { icon: 'close-circle', title: 'Payment failed', tone: colors.danger },
  pending: { icon: 'time-outline', title: 'Still confirming with the bank', tone: colors.amber },
  expired: { icon: 'hourglass-outline', title: 'Payment session expired', tone: colors.muted },
  mismatch: { icon: 'alert-circle', title: 'We couldn’t apply this payment', tone: colors.danger },
  error: { icon: 'alert-circle', title: 'Couldn’t start the payment', tone: colors.danger },
};

function PaymentSheet({ sheet, onRefresh, onRetry, onClose }) {
  const insets = useSafeAreaInsets();
  if (!sheet) return null;
  const { state, checkout: c, error } = sheet;
  const copy = COPY[state] || COPY.pending;
  const title = state === 'error' ? error?.title || copy.title : copy.title;
  const amount = c?.amountPaise ? money(c.amountPaise) : null;
  let message;
  if (state === 'opening') message = 'Asking the payment gateway for the result. This takes a few seconds.';
  else if (state === 'paid') message = `${amount || 'The amount'} was received${c.paidAt ? ` on ${formatDateTime(c.paidAt)}` : ''}.`;
  else if (state === 'failed') message = `${c.lastError}. You can try again.`;
  else if (state === 'pending') message = 'If you finished paying, the bank may take a minute to confirm. Tap Refresh to check again. If you closed the page without paying, you can pay again.';
  else if (state === 'expired') message = 'This payment page has expired. Start again to pay.';
  else if (state === 'mismatch') message = 'The amount paid did not match, so nothing was applied. Please contact support with the reference below.';
  else message = error?.message;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={state === 'opening' ? undefined : onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: 18 + insets.bottom }]} accessibilityViewIsModal testID="payment-sheet">
          <View style={[styles.icon, { backgroundColor: state === 'paid' ? colors.greenBg : state === 'pending' ? colors.amberBg : state === 'opening' || state === 'expired' ? colors.goldLight : colors.dangerBg }]}>
            {copy.icon ? <Ionicons name={copy.icon} size={34} color={copy.tone} /> : <ActivityIndicator color={colors.navy} />}
          </View>
          <T weight="extrabold" size={17} color={colors.navy} style={{ textAlign: 'center' }} accessibilityRole="header" testID={`payment-${state}`}>
            {title}
          </T>
          {amount && state !== 'error' ? (
            <T weight="extrabold" size={20} color={colors.navy} style={{ textAlign: 'center' }}>
              {amount}
            </T>
          ) : null}
          <T size={13} color={colors.textSoft} style={{ textAlign: 'center', lineHeight: 19 }} accessibilityLiveRegion="polite">
            {message}
          </T>
          {sheet.note ? (
            <T size={12} color={colors.amber} style={{ textAlign: 'center' }}>
              {sheet.note}
            </T>
          ) : null}
          {c?.mode === 'sandbox' ? <TestModeBadge style={{ alignSelf: 'center' }} /> : null}
          {c?.orderId && state !== 'opening' ? (
            <T size={11} color={colors.subtle} style={{ textAlign: 'center' }} selectable>
              Reference: {c.orderId}
            </T>
          ) : null}

          {state === 'opening' ? null : (
            <View style={{ gap: 10, marginTop: 6, alignSelf: 'stretch' }}>
              {state === 'pending' ? <Button title="Refresh" icon="refresh" variant="brand" onPress={onRefresh} loading={!!sheet.refreshing} testID="payment-refresh" /> : null}
              {state === 'failed' ? <Button title="Try again" icon="card-outline" variant="gold" onPress={onRetry} testID="payment-retry" /> : null}
              {state === 'expired' ? <Button title="Start again" icon="card-outline" variant="gold" onPress={onRetry} testID="payment-restart" /> : null}
              {state === 'pending' ? <Button title="Pay again" variant="alt" onPress={onRetry} /> : null}
              {state === 'error' && error?.action ? (
                <Button
                  title={error.action.title}
                  variant="brand"
                  onPress={() => {
                    onClose();
                    router.push(error.action.href);
                  }}
                />
              ) : null}
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={state === 'paid' ? 'Done' : 'Close'} style={styles.close} testID="payment-close">
                <T weight="bold" size={14} color={colors.navy}>
                  {state === 'paid' ? 'Done' : 'Close'}
                </T>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  testRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 22, gap: 8, alignItems: 'center' },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  close: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder },
});
