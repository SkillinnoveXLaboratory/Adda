import { useState } from 'react';
import { api } from '../lib/api.js';
import { useDebounced, useQuery } from '../lib/hooks.js';
import { cx, Icon, Spinner } from './ui.jsx';

/**
 * Searchable multi-select of societies (GET /platform/societies?q=). `value` = [{ _id, name, city }].
 * Selected societies show as removable chips above the search box.
 */
export function SocietyPicker({ value = [], onChange, invalid = false, disabled = false }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const list = useQuery(() => api.get('/platform/societies', { q: q || undefined, limit: 20, sort: 'name' }), [q]);
  const chosen = new Set(value.map((s) => String(s._id)));
  const toggle = (s) => onChange(chosen.has(String(s._id)) ? value.filter((x) => String(x._id) !== String(s._id)) : [...value, { _id: s._id, name: s.name, city: s.city }]);
  const items = list.data?.items || [];
  return (
    <div className={cx('rounded-lg border bg-white', invalid ? 'border-rose-300' : 'border-gray-200')} data-testid="society-picker">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-gray-100 p-2" aria-label="Chosen societies">
          {value.map((s) => (
            <span key={s._id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-light py-0.5 pl-2.5 pr-1 text-[11px] font-semibold text-brand">
              <span className="truncate">{s.name}</span>
              <button type="button" disabled={disabled} onClick={() => toggle(s)} className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-brand/10" aria-label={`Remove ${s.name}`}>
                <Icon name="fa-solid fa-xmark" className="text-[9px]" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative border-b border-gray-100">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
          <Icon name="fa-solid fa-magnifying-glass" className="text-xs" />
        </span>
        <input type="search" value={search} disabled={disabled} onChange={(e) => setSearch(e.target.value)} placeholder="Search societies by name, city or code…" aria-label="Search societies" className="w-full rounded-t-lg border-0 py-2 pl-8 pr-8 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-0" data-testid="society-search" />
        {list.reloading && <Spinner className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />}
      </div>
      <ul className="max-h-48 overflow-y-auto py-1" role="listbox" aria-multiselectable="true" aria-label="Societies">
        {list.loading && !list.data && <li className="px-3 py-2 text-[11px] text-brand-muted">Loading societies…</li>}
        {list.error && !list.data && <li className="px-3 py-2 text-[11px] text-rose-500">{list.error.message}</li>}
        {list.data && items.length === 0 && <li className="px-3 py-2 text-[11px] text-brand-muted">No societies match “{q}”.</li>}
        {items.map((s) => {
          const on = chosen.has(String(s._id));
          return (
            <li key={s._id} role="option" aria-selected={on}>
              <label className={cx('flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-gray-50', on && 'bg-brand-light/50')}>
                <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(s)} className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 accent-[#2563eb]" />
                <span className="min-w-0 flex-1 truncate font-medium text-gray-700">{s.name}</span>
                <span className="shrink-0 text-[11px] text-gray-400">{[s.city, s.status && s.status !== 'active' ? s.status : null].filter(Boolean).join(' · ')}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {list.data?.total > items.length && <p className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-brand-muted">Showing {items.length} of {list.data.total} — type to narrow down.</p>}
    </div>
  );
}
