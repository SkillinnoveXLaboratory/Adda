/** Client-side checks mirror the server's rules so users see errors before submitting. The server re-validates everything. */
export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return digits;
}
/**
 * What a mobile-number box should hold while the user types, pastes or autofills:
 * "+91 98765 43210", "098765 43210", "91-9876543210" → "9876543210". Always at most 10 digits.
 * (Never put maxLength={10} on these inputs — it cuts "+91 …" or spaced numbers before this can clean them.)
 */
export function phoneInput(value) {
  const raw = String(value || '');
  let digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+91') || (digits.length === 12 && digits.startsWith('91'))) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}
export const PHONE_INPUT_MAX = 16; // room for "+91 98765 43210" when pasted / autofilled
export const isValidPhone = (value) => /^[6-9]\d{9}$/.test(normalizePhone(value));
export function phoneError(value) {
  if (!value) return 'Enter your mobile number';
  const d = normalizePhone(value);
  if (isValidPhone(d)) return null;
  if (d.length !== 10) return `Enter all 10 digits of your mobile number (${d.length} entered)`;
  return 'Indian mobile numbers start with 6, 7, 8 or 9';
}

export function passwordError(pw) {
  if (!pw) return 'Enter a password';
  if (pw.length < 10) return 'Use at least 10 characters';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use both letters and numbers';
  return null;
}
export function passwordStrength(pw = '') {
  let score = 0;
  if (pw.length >= 10) score += 1;
  if (pw.length >= 14) score += 1;
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score += 1;
  return score; // 0-4
}
export const nameError = (name) => (!name || name.trim().length < 2 ? 'Enter your full name' : name.trim().length > 120 ? 'Name is too long' : null);
export const requiredError = (value, label, min = 1) => (!value || String(value).trim().length < min ? `${label} ${min > 1 ? `needs at least ${min} characters` : 'is required'}` : null);
export function rupeeError(value, { allowZero = false } = {}) {
  if (value === '' || value === undefined || value === null) return 'Enter an amount';
  const n = Number(String(value).replace(/[,\s₹]/g, ''));
  if (!Number.isFinite(n)) return 'Enter a valid amount';
  if (n < 0 || (!allowZero && n === 0)) return 'Amount must be greater than zero';
  if (n > 100000000) return 'Amount is too large';
  return null;
}
