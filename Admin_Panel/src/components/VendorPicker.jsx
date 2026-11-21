import { useId, useState } from 'react';
import { api } from '../lib/api.js';
import { useDebounced, useQuery } from '../lib/hooks.js';
import { Icon } from './ui.jsx';

export const vendorLabel = (v) => v?.businessName || v?.name || 'Unnamed vendor';

/** Search vendors by name / business (GET /platform/vendors?q=) and pick one. */
export function VendorPicker({ onPick, testId = 'vendor-picker', className = 'w-full lg:w-72' }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const q = useDebounced(text.trim());
  const listId = useId();
  const res = useQuery(() => (q.length >= 2 ? api.get('/platform/vendors', { q, limit: 8, sort: 'businessName' }) : Promise.resolve(null)), [q]);
  const items = res.data?.items || [];
  return (
    <div className={`relative ${className}`} data-testid={testId}>
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
        <Icon name="fa-solid fa-magnifying-glass" className="text-xs" />
      </span>
      <input
        type="search"
        value={text}
        onChange={(e) => (setText(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Filter by vendor (name, business)…"
        aria-label="Filter by vendor"
        role="combobox"
        aria-expanded={open && q.length >= 2}
        aria-controls={listId}
        className="form-input pl-8"
      />
      {open && q.length >= 2 && (
        <ul id={listId} role="listbox" className="absolute right-0 z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
          {res.loading && !res.data ? (
            <li className="px-3 py-2 text-xs text-gray-400">Searching…</li>
          ) : res.error ? (
            <li className="px-3 py-2 text-xs text-rose-500">{res.error.message}</li>
          ) : !items.length ? (
            <li className="px-3 py-2 text-xs text-gray-400">No vendors match</li>
          ) : (
            items.map((v) => (
              <li key={v._id} role="option" aria-selected="false">
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick(v._id), setText(''), setOpen(false))} className="flex min-h-[40px] w-full flex-col items-start px-3 py-1.5 text-left hover:bg-gray-50">
                  <span className="max-w-full truncate text-xs font-semibold text-gray-700">{vendorLabel(v)}</span>
                  {v.businessName && v.name && <span className="max-w-full truncate text-[11px] text-gray-400">{v.name}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
