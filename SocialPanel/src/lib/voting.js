/**
 * Voting helpers (skills/society-voting/SKILL.md): percent / turnout text, time left, IST close time, voter CSV.
 * Pure functions — unit tested in tests/unit/voting.test.js.
 */
import { formatDateTime } from './format.js';

export const DEFAULT_OPTIONS = ['Interested', 'Not interested'];
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4; // the API allows 8; the panel keeps votes simple
export const QUESTION_MIN = 5;
export const QUESTION_MAX = 300;
export const NOTE_MAX = 2000;
export const OPTION_MAX = 120;
export const RESULT_MIN = 3;
export const RESULT_MAX = 2000;
const MIN_OPEN_MS = 5 * 60_000;
const MAX_OPEN_MS = 365 * 86_400_000;

const pct1 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
const count = new Intl.NumberFormat('en-IN');

/** Share of `n` in `of`, one decimal (0 when `of` is 0 — never NaN). Same rounding as the server. */
export const percentOf = (n, of) => (Number(of) > 0 ? Math.round((Number(n || 0) * 1000) / Number(of)) / 10 : 0);

/** 50 → "50%", 33.3 → "33.3%", NaN/undefined → "0%". */
export const formatPercent = (p) => `${pct1.format(Number.isFinite(Number(p)) ? Number(p) : 0)}%`;

/** "2 of 5 members (40%)"; "0 of 0 members (0%)" when nobody is eligible. */
export function turnoutText(totalVotes, eligible, turnoutPercent) {
  const v = Number(totalVotes) || 0;
  const e = Number(eligible) || 0;
  const p = Number.isFinite(Number(turnoutPercent)) ? Number(turnoutPercent) : percentOf(v, e);
  return `${count.format(v)} of ${count.format(e)} member${e === 1 ? '' : 's'} (${formatPercent(p)})`;
}

/** Has the vote ended? Prefers the server's `ended`, else status / close time. */
export function isEnded(poll, now = Date.now()) {
  if (!poll) return false;
  if (typeof poll.ended === 'boolean') return poll.ended;
  return poll.status !== 'open' || Boolean(poll.closesAt && new Date(poll.closesAt).getTime() <= now);
}

/** "Closes in 2d 4h" / "Closes in 3h 20m" / "Closes in 12m" / "Closes in under a minute"; null with no close time or when past. */
export function timeLeft(closesAt, now = Date.now()) {
  if (!closesAt) return null;
  const ms = new Date(closesAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'Closes in under a minute';
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `Closes in ${d}d${h ? ` ${h}h` : ''}`;
  if (h > 0) return `Closes in ${h}h${m ? ` ${m}m` : ''}`;
  return `Closes in ${m}m`;
}

/** When the vote ended (closed by staff, or its close time). */
export const endedAt = (poll) => poll?.closedAt || poll?.closesAt || poll?.updatedAt || null;

/** One line for a card: time left, "Ends manually", or "Ended 12 Nov 2026, 6:00 pm" (IST). */
export function timingText(poll, now = Date.now()) {
  if (isEnded(poll, now)) return `Ended ${formatDateTime(endedAt(poll))}`;
  const left = timeLeft(poll?.closesAt, now);
  return left ? `${left} · ${formatDateTime(poll.closesAt)}` : 'Open until you end it';
}

/** IST date (YYYY-MM-DD) + time (HH:MM) → ISO string with the +05:30 offset the API expects. */
export function istToISO(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return null;
  const iso = `${date}T${time}:00+05:30`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/** Problem with an optional close date + time (IST), or null when fine / left empty. */
export function closeTimeError(date, time, now = Date.now()) {
  if (!date && !time) return null;
  if (!date || !time) return 'Pick both a date and a time, or leave both empty';
  const iso = istToISO(date, time);
  if (!iso) return 'Enter a valid date and time';
  const t = new Date(iso).getTime();
  if (t < now + MIN_OPEN_MS) return 'Pick a time at least 5 minutes from now (India time)';
  if (t > now + MAX_OPEN_MS) return 'Voting can stay open for up to a year';
  return null;
}

/** Client-side checks for the New vote form → { field: message }. */
export function validateVote({ question, note, options, closeDate, closeTime }, now = Date.now()) {
  const errors = {};
  const q = String(question || '').trim();
  if (q.length < QUESTION_MIN) errors.question = q ? `The question needs at least ${QUESTION_MIN} characters` : 'Write the question members will answer';
  else if (q.length > QUESTION_MAX) errors.question = `Keep the question under ${QUESTION_MAX} characters`;
  if (String(note || '').trim().length > NOTE_MAX) errors.note = `Keep the note under ${NOTE_MAX} characters`;
  const opts = (options || []).map((o) => String(o || '').trim());
  if (opts.length < MIN_OPTIONS) errors.options = `Add at least ${MIN_OPTIONS} options`;
  else if (opts.length > MAX_OPTIONS) errors.options = `Use at most ${MAX_OPTIONS} options`;
  else if (opts.some((o) => !o)) errors.options = 'Fill in every option, or remove the empty one';
  else if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) errors.options = 'Each option must be different';
  const close = closeTimeError(closeDate, closeTime, now);
  if (close) errors.closes = close;
  return errors;
}

/** Map an API validation error onto New vote fields; anything else becomes a form-level message. */
export function apiFieldErrors(err) {
  const map = { question: 'question', description: 'note', options: 'options', closesAt: 'closes', result: 'result' };
  const out = {};
  for (const d of Array.isArray(err?.details) ? err.details : []) {
    const key = map[String(d.path || '').split('.')[0]];
    if (key && !out[key]) out[key] = d.message;
  }
  if (!Object.keys(out).length) out.form = err?.message || 'Something went wrong. Please try again.';
  return out;
}

/** Voters matching a name or flat search. */
export function filterVoters(votes, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return votes || [];
  return (votes || []).filter((v) => String(v.name || '').toLowerCase().includes(s) || String(v.flat || '').toLowerCase().includes(s));
}

const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // no spreadsheet formulas from member names
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Voter list → CSV text (times in IST). */
export function votersCsv(votes) {
  const rows = [['Name', 'Flat', 'Option', 'Voted at (IST)'], ...(votes || []).map((v) => [v.name, v.flat || '', v.optionLabel, formatDateTime(v.votedAt)])];
  return `${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** "Should we install solar panels?" → "vote-should-we-install-solar-panels.csv". */
export const csvFileName = (question) =>
  `vote-${
    String(question || 'results')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'results'
  }.csv`;
