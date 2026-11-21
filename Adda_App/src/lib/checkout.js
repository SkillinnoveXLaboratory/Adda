import * as WebBrowser from 'expo-web-browser';
import { api } from './api';

/**
 * Online payments (Cashfree, skills/cashfree-payments). One path for every kind of payment:
 *   pay endpoint → checkout object → hosted checkout in an auth session → ALWAYS ask the server
 *   (POST /payments/checkout/:orderId/refresh) → show what the server says. Success is shown only when the server
 *   answers `paid`; the redirect back to the app is just a trigger.
 */
export const PAYMENT_RETURN_URL = 'addaapp://payment-result';

/** Pay endpoints answer the checkout object, product orders `{ order, checkout }`; this picks the checkout. */
export function checkoutOf(res) {
  if (!res) return null;
  if (res.checkout !== undefined) return res.checkout;
  return res.orderId ? res : null;
}

export const refreshCheckout = (orderId) => api(`/payments/checkout/${orderId}/refresh`, { method: 'POST' });

/**
 * The state to show for a checkout the server returned:
 *   paid · failed (created + lastError, can retry) · pending ("still confirming", refresh) · expired (start again)
 *   · mismatch (amount differed; nothing was applied).
 */
export function checkoutOutcome(c) {
  if (!c) return 'pending';
  if (c.status === 'paid') return 'paid';
  if (c.status === 'expired') return 'expired';
  if (c.status === 'amount_mismatch') return 'mismatch';
  if (c.lastError) return 'failed';
  return 'pending';
}

/**
 * Opens the hosted checkout (when the server says it is still open) and then asks the server for the result.
 * Resolves with the refreshed checkout object.
 */
export async function openCheckout(checkout) {
  if (checkout?.status === 'created' && checkout.checkoutUrl) {
    await WebBrowser.openAuthSessionAsync(checkout.checkoutUrl, checkout.returnUrl || PAYMENT_RETURN_URL);
  }
  return refreshCheckout(checkout.orderId);
}

/** Friendly copy for the errors a pay endpoint can answer. `action` is an optional next step for the sheet. */
const PAY_ERRORS = {
  PAYMENTS_UNAVAILABLE: { title: 'Online payment is not available', fallback: 'Online payment is not available yet. Please pay in cash or at the office.' },
  VENDOR_PAYOUT_NOT_READY: { title: 'This seller can’t take online payments yet', fallback: 'This seller can’t accept online payments yet. Please pay in cash.' },
  PHONE_REQUIRED: { title: 'Add your mobile number', fallback: 'Add your mobile number to your profile to pay online.', action: { title: 'Edit profile', href: '/edit-profile' } },
  ALREADY_PAID: { title: 'Already paid', fallback: 'This has already been paid.' },
  NO_FIXED_PRICE: { title: 'No fixed price', fallback: 'This service has no fixed price — pay the vendor directly.' },
  NETWORK: { title: 'You’re offline', fallback: 'Check your internet connection and try again.' },
  TIMEOUT: { title: 'The server is slow to respond', fallback: 'Please try again in a moment.' },
};

export function payErrorCopy(err) {
  const c = PAY_ERRORS[err?.code] || { title: 'Couldn’t start the payment', fallback: 'Something went wrong. Please try again.' };
  return { title: c.title, message: err?.message || c.fallback, action: c.action || null, code: err?.code || null };
}
