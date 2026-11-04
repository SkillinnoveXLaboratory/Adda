const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** API amounts are integer paise. */
export const money = (paise) => inr.format((Number(paise) || 0) / 100);
export const moneyRound = (paise) => inrCompact.format(Math.round((Number(paise) || 0) / 100));
export const toPaise = (rupees) => Math.round(Number(String(rupees).replace(/[,\s₹]/g, '')) * 100);

const TZ = 'Asia/Kolkata';
const safe = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
};
export const formatDate = (d) => {
  const x = safe(d);
  return x ? x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '';
};
/** "8:43 pm" → "8:43 PM"; also normalises the narrow no-break space some ICU versions emit. */
const tidyTime = (s) => s.replace(/[  ]/g, ' ').replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
export const formatDateTime = (d) => {
  const x = safe(d);
  return x ? tidyTime(x.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ })) : '';
};
export const formatTime = (d) => {
  const x = safe(d);
  return x ? tidyTime(x.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ })) : '';
};
/** "6:00–8:00 PM", or "11:00 AM–1:00 PM" when the meridiem differs. */
export function timeRange(start, end) {
  const a = formatTime(start);
  const b = formatTime(end);
  const [at, am] = a.split(' ');
  const [bt, bm] = b.split(' ');
  return am && am === bm ? `${at}–${bt} ${bm}` : `${a}–${b}`;
}
export function timeAgo(d) {
  const x = safe(d);
  if (!x) return '';
  const s = Math.round((Date.now() - x.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(x);
}
export const periodLabel = (period) => {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return period || '';
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
/** YYYY-MM-DD for "today + n days" in IST. */
export const istDay = (offsetDays = 0) => new Date(Date.now() + 330 * 60000 + offsetDays * 86400000).toISOString().slice(0, 10);
export const dayLabel = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return {
    weekday: date.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
    day: d,
    month: date.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
  };
};
export const time12 = (hhmm) => {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
};

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'R';

export const titleCase = (s = '') => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const METHOD_LABELS = { cash: 'Cash', bank_transfer: 'Bank transfer', cheque: 'Cheque', upi_direct: 'UPI', upi: 'UPI', gateway: 'Online', online: 'Online', card: 'Card', netbanking: 'Net banking', wallet: 'Wallet' };
/** Human label for a payment method code. */
export const methodLabel = (m = '') => METHOD_LABELS[m] || titleCase(m);
export const greeting = () => {
  const h = Number(new Date(Date.now() + 330 * 60000).toISOString().slice(11, 13));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** Service-offer price as shown to residents (mirrors the API's priceType). */
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
