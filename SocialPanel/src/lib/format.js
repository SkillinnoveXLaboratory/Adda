/** Money is integer paise everywhere in the API. These helpers are the only place we convert. */
const TZ = 'Asia/Kolkata';

const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN');

/** ₹1,23,456.00 from paise. */
export function formatINR(paise, { whole = false } = {}) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return '—';
  return (whole ? inr0 : inr2).format(n / 100);
}

/** Short axis label: ₹950, ₹12.5K, ₹3.2L, ₹1.1Cr. */
export function formatINRShort(paise) {
  const r = Number(paise || 0) / 100;
  const abs = Math.abs(r);
  const sign = r < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`;
  return `${sign}₹${trim(abs)}`;
}
const trim = (v) => String(Number(v.toFixed(1)));

export const formatNumber = (n) => (Number.isFinite(Number(n)) ? num.format(Number(n)) : '—');

/**
 * Parse a rupee amount typed by a user into integer paise. Returns null when invalid.
 * Accepts "1500", "1,500.50", "₹ 99.9". Rejects more than two decimals and negatives (unless allowNegative).
 */
export function rupeesToPaise(input, { allowNegative = false } = {}) {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[₹,\s]/g, '');
  const re = allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/;
  if (!re.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** Paise → editable rupee string ("1500" or "1500.50"). */
export function paiseToRupeesInput(paise) {
  if (paise === null || paise === undefined || paise === '') return '';
  const n = Number(paise) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

const dFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });
const dtFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
const tFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });

const toDate = (v) => {
  if (!v) return null;
  // Date-only strings are IST calendar days; anchor at IST noon so the day never shifts.
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00+05:30`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDate = (v) => (toDate(v) ? dFmt.format(toDate(v)) : '—');
export const formatDateTime = (v) => (toDate(v) ? dtFmt.format(toDate(v)) : '—');
export const formatTime = (v) => (toDate(v) ? tFmt.format(toDate(v)) : '—');

export function formatRelative(v, now = Date.now()) {
  const d = toDate(v);
  if (!d) return '—';
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

/** "2026-10" → "Oct 2026". */
export function formatPeriod(period) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return period || '—';
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Today's calendar date in IST as YYYY-MM-DD. */
export const todayIST = (d = new Date()) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
export const currentPeriodIST = (d = new Date()) => todayIST(d).slice(0, 7);

/** "in_progress" → "In progress". */
export const humanize = (s) => {
  if (!s) return '—';
  const t = String(s).replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** YYYY-MM-DD (IST) → ISO datetime at a given IST time, for API fields that expect datetimes. */
export const istDateTimeISO = (date, time = '09:00') => (date ? new Date(`${date}T${time}:00+05:30`).toISOString() : undefined);

/** "9876543210" → "+91 98765 43210". */
export const formatPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return '—';
  const n = d.length > 10 ? d.slice(-10) : d;
  return n.length === 10 ? `+91 ${n.slice(0, 5)} ${n.slice(5)}` : p;
};

/** "1 invoice" / "3 invoices" with Indian digit grouping. */
export const plural = (n, word, many = `${word}s`) => `${formatNumber(n || 0)} ${Number(n) === 1 ? word : many}`;
