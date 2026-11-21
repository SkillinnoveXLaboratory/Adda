export const PAYMENT_METHODS = { cash: 'Cash', bank_transfer: 'Bank transfer', cheque: 'Cheque', upi_direct: 'UPI (direct)', gateway: 'Online (gateway)' };
export const LEDGER_TYPES = { opening: 'Opening balance', maintenance_collection: 'Collection', other_income: 'Other income', expense: 'Expense', adjustment: 'Adjustment', reversal: 'Reversal', refund: 'Refund' };
/** Payment gateways (Payment.provider / public config payments.provider). */
export const PROVIDER_NAMES = { cashfree: 'Cashfree', razorpay: 'Razorpay', manual: 'Manual' };
export const providerName = (provider) => (provider ? PROVIDER_NAMES[provider] || provider.charAt(0).toUpperCase() + provider.slice(1) : null);
/** "Online (Cashfree)" for gateway payments, else the offline method label. */
export const paymentMethodLabel = (p) => {
  if (!p?.method) return '—';
  if (p.method === 'gateway') return providerName(p.provider) && p.provider !== 'manual' ? `Online (${providerName(p.provider)})` : PAYMENT_METHODS.gateway;
  return PAYMENT_METHODS[p.method] || String(p.method).replace(/_/g, ' ');
};
