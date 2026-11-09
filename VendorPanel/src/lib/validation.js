/** Client-side checks mirror the server's rules so vendors see errors before submitting. The server re-validates everything. */

// ---- phone ----
export const normalizePhone = (v) => String(v || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');

/**
 * What a mobile-number box should hold while the user types, pastes or autofills:
 * "+91 98765 43210", "098765 43210", "91-9876543210" → "9876543210". Always at most 10 digits.
 */
export function phoneInput(value) {
  const raw = String(value || '');
  let digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+91') || (digits.length === 12 && digits.startsWith('91'))) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}
export const PHONE_INPUT_MAX = 16; // room for "+91 98765 43210" when pasted / autofilled
export const isIndianMobile = (v) => /^[6-9]\d{9}$/.test(normalizePhone(v));
export function phoneError(value, label = 'mobile number') {
  if (!value) return `Enter your ${label}`;
  const d = normalizePhone(value);
  if (isIndianMobile(d)) return null;
  if (d.length !== 10) return `Enter all 10 digits of the ${label} (${d.length} entered)`;
  return 'Indian mobile numbers start with 6, 7, 8 or 9';
}

// ---- password (server: ≥ 10 characters, at least one letter and one digit) ----
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

export const nameError = (name, label = 'your full name') => (!name || name.trim().length < 2 ? `Enter ${label} (at least 2 characters)` : name.trim().length > 120 ? 'Use at most 120 characters' : null);

// ---- money (rupee text → integer paise lives in format.js: toPaise) ----
/** Specific message for a rupee amount typed by the vendor, or null. */
export function rupeeError(value, { max, label = 'an amount', allowZero = false } = {}) {
  const s = String(value ?? '').replace(/[₹,\s]/g, '');
  if (!s) return `Enter ${label}`;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return 'Enter rupees with up to 2 decimals, e.g. 499 or 499.50';
  const n = Number(s);
  if (!allowZero && n === 0) return 'Amount must be greater than zero';
  if (max !== undefined && n > max) return `Maximum ₹${max.toLocaleString('en-IN')}`;
  return null;
}

// ---- vendor KYC (same rules as the server) ----
export const PAN_RX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_RX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const VD = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const VP = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
/** 12 digits, not starting with 0/1, Verhoeff checksum (catches almost every typo). Spaces are ignored. */
export const aadhaarValid = (value) => {
  const v = String(value || '').replace(/\s/g, '');
  return /^[2-9]\d{11}$/.test(v) && v.split('').reverse().reduce((c, d, i) => VD[c][VP[i % 8][Number(d)]], 0) === 0;
};
/** "123412341234" → "1234 1234 1234" while typing. */
export const formatAadhaar = (v) => String(v || '').replace(/\D/g, '').slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ');

/** Says exactly what is wrong with a PAN (5 letters, 4 digits, 1 letter), or null. */
export function panProblem(value) {
  const pan = String(value || '').trim().toUpperCase();
  if (PAN_RX.test(pan)) return null;
  if (!pan) return 'Enter your PAN — 5 letters, 4 digits, 1 letter, e.g. ABCDE1234F';
  if (pan.length !== 10) return `PAN has 10 characters (you entered ${pan.length}): 5 letters, 4 digits, 1 letter — e.g. ABCDE1234F`;
  if (!/^[A-Z]{5}/.test(pan)) return 'The first 5 characters of a PAN are letters — e.g. ABCDE1234F';
  if (!/^[A-Z]{5}[0-9]{4}/.test(pan)) return 'Characters 6 to 9 of a PAN are digits (check for the letter O instead of 0) — e.g. ABCDE1234F';
  return 'The last character of a PAN is a letter — e.g. ABCDE1234F';
}

/** Says exactly what is wrong with an Aadhaar number (12 digits, not starting 0/1, valid check digit), or null. */
export function aadhaarProblem(value) {
  const a = String(value || '').replace(/\s/g, '');
  if (aadhaarValid(a)) return null;
  if (!a) return 'Enter your 12-digit Aadhaar number';
  if (!/^\d+$/.test(a)) return 'Aadhaar has digits only';
  if (a.length !== 12) return `Aadhaar has 12 digits (you entered ${a.length})`;
  if (/^[01]/.test(a)) return 'Aadhaar numbers never start with 0 or 1';
  return 'This is not a valid Aadhaar number — one digit is probably wrong. Check it against your card.';
}

export function ifscProblem(value) {
  const v = String(value || '').trim().toUpperCase();
  if (IFSC_RX.test(v)) return null;
  if (!v) return 'Enter the IFSC of your bank branch, e.g. SBIN0001234';
  if (v.length !== 11) return `IFSC has 11 characters (you entered ${v.length}), e.g. SBIN0001234`;
  if (!/^[A-Z]{4}/.test(v)) return 'An IFSC starts with 4 letters (the bank code), e.g. SBIN0001234';
  if (v[4] !== '0') return 'The 5th character of an IFSC is always 0 (zero), e.g. SBIN0001234';
  return 'Enter a valid IFSC, e.g. SBIN0001234';
}

export function accountProblem(value) {
  const v = String(value || '');
  if (/^\d{9,18}$/.test(v)) return null;
  if (!v) return 'Enter your bank account number';
  return `A bank account number has 9 to 18 digits (you entered ${v.replace(/\D/g, '').length})`;
}

// ---- uploads ----
const MAX_UPLOAD = 8 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
/** Returns an error message or null. */
export function checkUpload(file, { allowPdf = false, maxBytes = MAX_UPLOAD } = {}) {
  if (!file) return 'Choose a file';
  const types = allowPdf ? TYPES : TYPES.filter((t) => t !== 'application/pdf');
  const ext = (file.name || '').split('.').pop().toLowerCase();
  const okExt = ['jpg', 'jpeg', 'png', 'webp', ...(allowPdf ? ['pdf'] : [])].includes(ext);
  if (!types.includes(file.type) && !okExt) return allowPdf ? 'Only JPG, PNG, WEBP or PDF files are allowed' : 'Only JPG, PNG or WEBP photos are allowed';
  if (file.size > maxBytes) return `File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`;
  return null;
}

/** Focus the first invalid field (inputs carry name attributes). */
export function focusFirstError(errors, root = typeof document !== 'undefined' ? document : null) {
  const first = Object.keys(errors).find((k) => errors[k]);
  if (!first || !root) return;
  const el = root.querySelector(`[name="${CSS.escape(first)}"]`);
  el?.focus?.();
}
