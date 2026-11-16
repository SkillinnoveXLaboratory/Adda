/** Gate security helpers for the Gatemen page (skills/gate-security). */
import { formatDate } from './format.js';
import { emailRule, maxLen, minLen, normalizePhone, passwordProblems, phoneRule, req, runRules } from './validation.js';

export const VISITOR_STATUS_OPTIONS = [
  ['all', 'All statuses'],
  ['expected', 'Expected'],
  ['approved', 'Approved'],
  ['inside', 'Inside'],
  ['exited', 'Exited'],
  ['rejected', 'Rejected'],
  ['cancelled', 'Cancelled'],
  ['upcoming', 'Upcoming (from this date on)'],
];

export const VISITOR_TONE = { expected: 'warning', approved: 'info', inside: 'success', exited: 'neutral', rejected: 'danger', cancelled: 'neutral' };

const hm = (t) => {
  if (!/^\d{2}:\d{2}$/.test(t || '')) return null;
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** "12 Nov 2026" + "10:00 am – 12:00 pm" (times optional). */
export function expectedText(v) {
  const date = v?.expectedDate ? formatDate(v.expectedDate) : '—';
  const a = hm(v?.expectedIn);
  const b = hm(v?.expectedOut);
  const time = a && b ? `${a} – ${b}` : a ? `from ${a}` : b ? `until ${b}` : '';
  return { date, time };
}

/** "Tower A · A-101". */
export const flatText = (v) => [v?.building?.name, v?.flat?.number].filter(Boolean).join(' · ') || '—';

export const addedByText = (role) => (role === 'gateman' ? 'Gate' : role === 'member' ? 'Member' : '—');

/** Client checks for the New / Edit gateman forms (same limits as the server). */
export function validateGateman(v, { create = true } = {}) {
  const errs = runRules(v, {
    name: [req('Enter the gateman’s name'), minLen(2, 'Name must be at least 2 characters'), maxLen(120)],
    phone: [phoneRule()],
    ...(create ? { email: [req('Enter an email address — they sign in with it'), emailRule()] } : {}),
  });
  if (create) {
    const p = passwordProblems(v.password || '');
    if (!v.password) errs.password = 'Set a password for the gateman';
    else if (p.length) errs.password = `Password needs: ${p.join(', ').toLowerCase()}`;
  }
  return errs;
}

export const gatemanBody = (v, { create = true } = {}) => {
  const phone = v.phone ? normalizePhone(v.phone) : null;
  if (create) return { name: v.name.trim(), email: v.email.trim().toLowerCase(), password: v.password, ...(phone ? { phone } : {}) };
  return { name: v.name.trim(), phone };
};

/** Server error → in-place field errors (409 EMAIL_TAKEN → email; validation details → fields; else `form`). */
export function gatemanApiErrors(err) {
  if (err?.code === 'EMAIL_TAKEN') return { email: err.message || 'This email is already used by another account. Use a different email.' };
  const out = {};
  for (const d of Array.isArray(err?.details) ? err.details : []) {
    const key = String(d.path || '').split('.')[0];
    if (['name', 'email', 'phone', 'password'].includes(key) && !out[key]) out[key] = d.message;
  }
  if (!Object.keys(out).length) out.form = err?.message || 'Something went wrong. Please try again.';
  return out;
}
