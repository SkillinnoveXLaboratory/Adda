import { todayIST } from './format.js';

/** Earnings period filter choices. Dates are India calendar days; `to` is inclusive (API.md → /vendor/earnings). */
export const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: '3m', label: 'Last 3 months' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** True for a real calendar day written as YYYY-MM-DD. */
export const isDay = (s) => DAY.test(String(s || '')) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * { from, to } (YYYY-MM-DD, IST) for a period key. "Last 3 months" = this month and the two before it.
 * 'all' → {} (no limits). 'custom' → the given days as they are (check them with rangeError first).
 */
export function periodRange(key, { today = todayIST(), from, to } = {}) {
  const [y, m] = today.split('-').map(Number);
  if (key === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (key === '3m') {
    const start = new Date(Date.UTC(y, m - 1 - 2, 1)).toISOString().slice(0, 10);
    return { from: start, to: today };
  }
  if (key === 'year') return { from: `${y}-01-01`, to: today };
  if (key === 'custom') return { from: from || undefined, to: to || undefined };
  return {};
}

/** Specific message for a bad custom range, or null. Either end may be left empty. */
export function rangeError(from, to) {
  if (from && !isDay(from)) return 'Enter a valid “From” date';
  if (to && !isDay(to)) return 'Enter a valid “To” date';
  if (from && to && from > to) return '“From” must be on or before “To”';
  return null;
}

/** "2026-11" → "Nov 2026". */
export function monthLabel(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym || '')) return ym || '—';
  const [y, m] = ym.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
}
