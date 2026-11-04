#!/usr/bin/env node
/**
 * Static UI rules for the NIVASA app (see skills/mobile-ui-qa/SKILL.md).
 *   node scripts/ui-lint.mjs            exit 1 on errors, warnings are listed but don't fail
 *
 * Rules
 *  E1 safe-area   every route screen renders inside a safe-area-aware shell
 *                 (Screen, AuthShell, Hero, DetailHeader, PropertyBrowser or useSafeAreaInsets)
 *  E2 a11y        every <Pressable> declares accessibilityRole (screen readers + web role)
 *  E3 font size   no fontSize / size below 9 px
 *  E4 secrets     no secret-looking env names in the client
 *  W1 palette     hex colours outside the NIVASA palette (theme.js + slate/status scales)
 *  W2 tap target  explicit minHeight below 40 on a Pressable style
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(SRC).filter((f) => /\.(jsx?|tsx?)$/.test(f));
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

// Palette: theme tokens + Tailwind slate/status scales used by the prototype.
const theme = fs.readFileSync(path.join(SRC, 'theme.js'), 'utf8');
const PALETTE = new Set([...theme.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => m[1].toLowerCase()));
for (const h of [
  'ffffff', '000000', 'f8fafc', 'f1f5f9', 'e2e8f0', 'cbd5e1', '94a3b8', '64748b', '475569', '334155', '1e293b', '0f172a',
  'fef2f2', 'fee2e2', 'fecaca', 'ef4444', 'dc2626', 'b91c1c', 'fffbeb', 'fef3c7', 'fde68a', 'f59e0b', 'd97706', 'b45309', '78350f',
  'ecfdf5', 'd1fae5', 'a7f3d0', '22c55e', '16a34a', '10b981', '059669', '047857', 'eff6ff', 'dbeafe', '2563eb', '1d4ed8',
  'faf5ff', '9333ea', 'fff1f2', 'e11d48', 'e7cf7d',
]) PALETTE.add(h);

const errors = [];
const warnings = [];
const add = (list, f, line, rule, msg) => list.push(`${rel(f)}:${line}  ${rule}  ${msg}`);
const lineOf = (s, idx) => s.slice(0, idx).split('\n').length;
/** Text of a JSX opening tag starting at `start`, ending at the first `>` outside {…} and quotes. */
function openingTag(s, start) {
  let depth = 0;
  let quote = null;
  for (let i = start + 1; i < s.length; i += 1) {
    const c = s[i];
    if (quote) {
      if (c === quote && s[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return s.slice(start, i);
  }
  return s.slice(start);
}

for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const isRoute = rel(f).startsWith('src/app/') && !/\/_layout\.jsx$/.test(rel(f));
  const isRedirect = /<Redirect\b/.test(s) && !/<View\b/.test(s);

  if (isRoute && !isRedirect && !/(<Screen\b|<AuthShell\b|<Hero\b|<DetailHeader\b|<PropertyBrowser\b|useSafeAreaInsets\()/.test(s)) {
    add(errors, f, 1, 'E1', 'route screen does not use a safe-area-aware shell (Screen / AuthShell / Hero / DetailHeader / useSafeAreaInsets)');
  }

  for (const m of s.matchAll(/<Pressable\b/g)) {
    const props = openingTag(s, m.index);
    if (!/accessibilityRole=/.test(props)) add(errors, f, lineOf(s, m.index), 'E2', '<Pressable> without accessibilityRole');
    const mh = /minHeight:\s*(\d+)/.exec(props);
    if (mh && Number(mh[1]) < 40) add(warnings, f, lineOf(s, m.index), 'W2', `Pressable minHeight ${mh[1]} < 40 (aim for 44)`);
  }

  for (const m of s.matchAll(/\b(?:fontSize|size)[:=]\{?\s*(\d+(?:\.\d+)?)/g)) {
    const before = s.slice(Math.max(0, m.index - 40), m.index);
    if (/Ionicons|icon|Icon|Skeleton|LogoMark|Avatar|<IconButton/.test(before)) continue;
    if (Number(m[1]) < 9) add(errors, f, lineOf(s, m.index), 'E3', `text size ${m[1]} < 9`);
  }

  const secret = /(mongodb(\+srv)?:\/\/|MONGODB_URI|JWT_(ACCESS|REFRESH)_SECRET|PAYMENT_(SECRET_KEY|WEBHOOK_SECRET)|OTP_HASH_SECRET|EXPO_PUBLIC_[A-Z_]*(SECRET|PASSWORD|PRIVATE))/.exec(s);
  if (secret) add(errors, f, lineOf(s, secret.index), 'E4', `secret-looking value in client code: ${secret[0]}`);

  if (!f.endsWith('theme.js')) {
    for (const m of s.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
      if (!PALETTE.has(m[1].toLowerCase())) add(warnings, f, lineOf(s, m.index), 'W1', `#${m[1]} is not in the NIVASA palette`);
    }
  }
}

const show = (title, list, color) => {
  if (!list.length) return;
  console.log(`\n\x1b[${color}m${title} (${list.length})\x1b[0m`);
  for (const l of list) console.log(`  ${l}`);
};
show('Errors', errors, 31);
show('Warnings', warnings, 33);
console.log(`\nui-lint: ${files.length} files · ${errors.length} errors · ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
