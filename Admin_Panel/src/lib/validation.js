/** Client-side validation mirroring the server's zod schemas (server remains the authority). */

export const normalizePhone = (v) => {
  const digits = String(v || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return digits;
};

export const isIndianMobile = (v) => /^[6-9]\d{9}$/.test(normalizePhone(v));
/** Organisation contact number: mobile, or landline with STD code (10 digits after removing +91 / 0). */
export const isIndianPhone = (v) => /^[2-9]\d{9}$/.test(normalizePhone(v));
export const isPincode = (v) => /^\d{6}$/.test(String(v || '').trim());
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

/** Password rule used by the server: ≥ 10 characters, at least one letter and one digit. */
export function passwordProblems(pw) {
  const p = String(pw || '');
  const problems = [];
  if (p.length < 10) problems.push('At least 10 characters');
  if (!/[A-Za-z]/.test(p)) problems.push('At least one letter');
  if (!/\d/.test(p)) problems.push('At least one number');
  return problems;
}
export const isStrongPassword = (pw) => passwordProblems(pw).length === 0;

/** 0–4 strength meter (display only). */
export function passwordStrength(pw) {
  const p = String(pw || '');
  let s = 0;
  if (p.length >= 10) s += 1;
  if (/[A-Za-z]/.test(p) && /\d/.test(p)) s += 1;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s += 1;
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 14) s += 1;
  return isStrongPassword(p) ? Math.max(s, 2) : Math.min(s, 1);
}

const MAX_UPLOAD = 8 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
/** Returns an error message or null. */
export function checkUpload(file, { allowPdf = true, maxBytes = MAX_UPLOAD } = {}) {
  if (!file) return 'Choose a file';
  const types = allowPdf ? TYPES : TYPES.filter((t) => t !== 'application/pdf');
  const ext = (file.name || '').split('.').pop().toLowerCase();
  const okExt = ['jpg', 'jpeg', 'png', 'webp', ...(allowPdf ? ['pdf'] : [])].includes(ext);
  if (!types.includes(file.type) && !okExt) return allowPdf ? 'Only JPG, PNG, WEBP or PDF files are allowed' : 'Only JPG, PNG or WEBP images are allowed';
  if (file.size > maxBytes) return `File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`;
  return null;
}

/**
 * Tiny rule runner. rules: { field: [ [predicate(value, values) => boolean, message], ... ] }
 * Returns { field: firstMessage } for failing fields.
 */
export function runRules(values, rules) {
  const errors = {};
  for (const [field, list] of Object.entries(rules)) {
    for (const [ok, message] of list) {
      if (!ok(values[field], values)) {
        errors[field] = message;
        break;
      }
    }
  }
  return errors;
}

export const req = (msg = 'This field is required') => [(v) => String(v ?? '').trim().length > 0, msg];
export const minLen = (n, msg) => [(v) => !v || String(v).trim().length >= n, msg || `Must be at least ${n} characters`];
export const maxLen = (n, msg) => [(v) => !v || String(v).trim().length <= n, msg || `Must be at most ${n} characters`];
export const emailRule = (msg = 'Enter a valid email address') => [(v) => !v || isEmail(v), msg];
export const phoneRule = (msg = 'Enter a valid 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)') => [(v) => !v || isIndianMobile(v), msg];
export const contactPhoneRule = (msg = 'Enter a 10-digit phone number: a mobile number, or a landline with its STD code (e.g. 033 2234 5678)') => [(v) => !v || isIndianPhone(v), msg];
export const pinRule = (msg = 'Enter a 6-digit PIN code') => [(v) => !v || isPincode(v), msg];
export const intRange = (min, max, msg) => [(v) => v === '' || v === undefined || v === null || (/^-?\d+$/.test(String(v)) && Number(v) >= min && Number(v) <= max), msg || `Enter a whole number between ${min} and ${max}`];
export const amountRule = (msg = 'Enter an amount in rupees (up to 2 decimals)', { allowZero = false } = {}) => [
  (v) => {
    if (v === '' || v === undefined || v === null) return true;
    const s = String(v).replace(/[₹,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return false;
    return allowZero || Number(s) > 0;
  },
  msg,
];

/** Focus the first invalid field (inputs carry name attributes). */
export function focusFirstError(errors, root = typeof document !== 'undefined' ? document : null) {
  const first = Object.keys(errors)[0];
  if (!first || !root) return;
  const el = root.querySelector(`[name="${CSS.escape(first)}"]`);
  el?.focus?.();
}

/**
 * Platform commission typed by the owner ("12", "12.5", "7.25") → a number 0–50 with at most 2 decimals, or null.
 * Parsed from the string (never float maths on the input) so "12.50" → 12.5 and "1.005" is rejected.
 */
export function parsePercent(input, { max = 50 } = {}) {
  const s = String(input ?? '').trim().replace(/%$/, '').trim();
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const hundredths = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
  if (hundredths > max * 100) return null;
  return hundredths / 100;
}

// ---------- KYC numbers (mirror of Backend/server.js PAN_RX / IFSC_RX / verhoeffValid) ----------
const VERHOEFF_D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const VERHOEFF_P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];

/** Removes spaces and dashes (how the server reads Aadhaar / account numbers). */
export const kycDigits = (v) => String(v ?? '').replace(/[\s-]/g, '');
/** Verhoeff checksum: every genuine Aadhaar number passes it. */
export const verhoeffValid = (num) => /^\d+$/.test(num) && num.split('').reverse().reduce((c, d, i) => VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(d)]], 0) === 0;
export const isPan = (v) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(v ?? '').trim().toUpperCase());
export const isIfsc = (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(v ?? '').trim().toUpperCase());
export const isAadhaar = (v) => {
  const d = kycDigits(v);
  return /^[2-9]\d{11}$/.test(d) && verhoeffValid(d);
};
export const isBankAccount = (v) => /^\d{9,18}$/.test(kycDigits(v));
