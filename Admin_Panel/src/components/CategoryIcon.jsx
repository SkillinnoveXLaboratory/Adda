import { useMemo, useState } from 'react';
import ICON_SET from '../lib/serviceIcons.json';

const BY_KEY = Object.fromEntries(ICON_SET.icons.map((i) => [i.key, i]));
const NAVY = '#07162c';
const GOLD = '#ca9e3b';

/** Same rules as the app: admin choice → old value / name keywords → "others". */
export function resolveIconKey(icon, name = '') {
  if (icon && BY_KEY[icon]) return icon;
  const legacy = icon && ICON_SET.legacy[String(icon).replace(/-outline$/, '')];
  if (legacy) return legacy;
  const n = String(name).toLowerCase();
  const hit = n && ICON_SET.icons.find((i) => i.key !== 'others' && i.keywords.some((k) => n.includes(k)));
  return hit ? hit.key : 'others';
}

/** NIVASA two-tone service icon — exactly what the app draws (serviceIcons.json is shared with Adda_App). */
export function CategoryIcon({ icon, name, size = 32, className = '' }) {
  const def = BY_KEY[resolveIconKey(icon, name)];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {def.parts.map(([Tag, a], i) => {
        const { s, f, w, ...rest } = a;
        return <Tag key={i} {...rest} stroke={s ? (s === 'g' ? GOLD : NAVY) : undefined} strokeWidth={w} fill={f ? (f === 'g' ? GOLD : NAVY) : 'none'} />;
      })}
    </svg>
  );
}

/** Searchable icon grid. `value` = icon key; `onChange(key)`. */
export function IconPicker({ value, onChange, name }) {
  const [q, setQ] = useState('');
  const icons = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? ICON_SET.icons.filter((i) => i.label.toLowerCase().includes(t) || i.keywords.some((k) => k.includes(t))) : ICON_SET.icons;
  }, [q]);
  const suggested = !value && name ? resolveIconKey(null, name) : null;
  return (
    <div className="space-y-2" data-testid="icon-picker">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${ICON_SET.icons.length} icons — plumbing, salon, pest…`} className="form-input pl-8" aria-label="Search icons" />
        </div>
        {suggested && suggested !== 'others' ? (
          <button type="button" onClick={() => onChange(suggested)} className="shrink-0 rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:border-gray-400">
            Use suggested
          </button>
        ) : null}
      </div>
      <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-5" role="radiogroup" aria-label="Category icon">
        {icons.map((i) => {
          const on = i.key === value;
          return (
            <button
              key={i.key}
              type="button"
              role="radio"
              aria-checked={on}
              title={i.label}
              onClick={() => onChange(i.key)}
              data-testid={`icon-${i.key}`}
              className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors ${on ? 'border-[#07162c] bg-[#f4ecd8] ring-1 ring-[#07162c]' : 'border-gray-100 bg-white hover:border-gray-300'}`}
            >
              <CategoryIcon icon={i.key} size={30} />
              <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-gray-700">{i.label}</span>
            </button>
          );
        })}
        {!icons.length ? <p className="col-span-full py-4 text-center text-xs text-gray-400">No icon matches “{q}”.</p> : null}
      </div>
    </div>
  );
}
