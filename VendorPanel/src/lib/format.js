/** Money is integer paise everywhere in the API. These helpers are the only place we convert. */
const TZ = 'Asia/Kolkata';

const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN');

/** ₹1,23,456 from paise (paise shown only when there are any). */
export function money(paise) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return '—';
  return (Number.isInteger(n / 100) ? inr0 : inr2).format(n / 100);
}

/**
 * The ONE place rupee text typed by a vendor becomes integer paise. "1,500.50" / "₹ 99.99" → 150050 / 9999.
 * Returns null for anything that is not a non-negative amount with at most 2 decimals.
 */
export function toPaise(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [r, p = ''] = s.split('.');
  return Number(r) * 100 + Number(p.padEnd(2, '0'));
}

/** Paise → editable rupee string ("1500" or "1500.50"). */
export function paiseToRupeesInput(paise) {
  if (paise === null || paise === undefined || paise === '') return '';
  const n = Number(paise);
  if (!Number.isFinite(n)) return '';
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2);
}

export const formatNumber = (n) => (Number.isFinite(Number(n)) ? num.format(Number(n)) : '—');

const dFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });
const dtFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
const wdFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: TZ });
const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', timeZone: TZ });
const monFmt = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: TZ });

const toDate = (v) => {
  if (!v) return null;
  // Date-only strings are IST calendar days; anchor at IST noon so the day never shifts.
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00+05:30`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDate = (v) => (toDate(v) ? dFmt.format(toDate(v)) : '—');
export const formatDateTime = (v) => (toDate(v) ? dtFmt.format(toDate(v)) : '—');
/** { weekday: 'Mon', day: '9', month: 'Nov' } for a date tile. */
export const dayParts = (v) => {
  const d = toDate(v);
  return d ? { weekday: wdFmt.format(d), day: dayFmt.format(d), month: monFmt.format(d) } : { weekday: '', day: '—', month: '' };
};

/** "14:30" → "2:30 PM". */
export const time12 = (hhmm) => {
  if (!/^\d{2}:\d{2}$/.test(hhmm || '')) return hhmm || '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

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

/** Today's calendar date in IST as YYYY-MM-DD. */
export const todayIST = (d = new Date()) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);

/** "in_progress" → "In progress". */
export const humanize = (s) => {
  if (!s) return '—';
  const t = String(s).replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** "9876543210" → "+91 98765 43210". */
export const formatPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return '—';
  const n = d.length > 10 ? d.slice(-10) : d;
  return n.length === 10 ? `+91 ${n.slice(0, 5)} ${n.slice(5)}` : p;
};

export const plural = (n, word, many = `${word}s`) => `${formatNumber(n || 0)} ${Number(n) === 1 ? word : many}`;

/** Service-offer price types (mirrors the API's priceType). */
export const OFFER_PRICE_TYPES = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'starting_from', label: 'Starting from' },
  { value: 'per_hour', label: 'Per hour' },
  { value: 'per_visit', label: 'Per visit' },
  { value: 'on_quote', label: 'Price on request' },
];
export function offerPrice(o) {
  if (!o || o.priceType === 'on_quote' || !(o.pricePaise > 0)) return 'Price on request';
  const p = money(o.pricePaise);
  return { fixed: p, starting_from: `From ${p}`, per_hour: `${p} / hour`, per_visit: `${p} / visit` }[o.priceType] || p;
}

export const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'plot', label: 'Plot' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'room', label: 'Room' },
];
export const FURNISHING = [
  { value: '', label: 'Not specified' },
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi_furnished', label: 'Semi-furnished' },
  { value: 'furnished', label: 'Furnished' },
];
