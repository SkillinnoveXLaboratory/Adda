import { cx, EmptyState, ErrorState, Icon, Skeleton } from './ui.jsx';
import { formatNumber } from '../lib/format.js';

/**
 * Table inside a card: horizontal scroll inside the card on small screens, sticky header, skeleton rows, empty + error states.
 * columns: [{ key, header, render?(row), className?, align?: 'right'|'center', width? }]
 */
export function DataTable({ columns, rows, loading, error, onRetry, empty, rowKey = '_id', dim = false, maxHeight = 'max-h-[68vh]', testId }) {
  const showSkeleton = loading && !rows;
  return (
    <div className={cx('relative overflow-auto', maxHeight)} data-testid={testId}>
      <table className={cx('min-w-full border-separate border-spacing-0 transition-opacity', dim && 'opacity-60')}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx('th', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')} style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {showSkeleton &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`s${i}`}>
                {columns.map((c) => (
                  <td key={c.key} className="td">
                    <Skeleton className="h-3.5 w-full min-w-[60px]" />
                  </td>
                ))}
              </tr>
            ))}
          {!showSkeleton &&
            rows?.map((row, i) => (
              <tr key={row[rowKey] ?? i}>
                {columns.map((c) => (
                  <td key={c.key} className={cx('td', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}>
                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {!showSkeleton && error && !rows && <ErrorState error={error} onRetry={onRetry} compact />}
      {!showSkeleton && !error && rows && rows.length === 0 && (empty || <EmptyState compact />)}
    </div>
  );
}

export function Pagination({ page, pages, total, limit, onPage }) {
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const nums = [];
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  for (let p = start; p <= Math.min(pages, start + 4); p += 1) nums.push(p);
  const btn = 'inline-flex h-10 min-w-[40px] items-center justify-center rounded-md px-2 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex flex-col items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 sm:flex-row">
      <p className="text-[11px] text-azea-muted">
        Showing <span className="font-semibold text-gray-600">{formatNumber(from)}</span>–<span className="font-semibold text-gray-600">{formatNumber(to)}</span> of <span className="font-semibold text-gray-600">{formatNumber(total)}</span>
      </p>
      {pages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button type="button" className={cx(btn, 'text-gray-500 hover:bg-gray-100')} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <Icon name="fa-solid fa-chevron-left" className="text-[9px]" />
          </button>
          {nums.map((p) => (
            <button key={p} type="button" aria-current={p === page ? 'page' : undefined} className={cx(btn, p === page ? 'bg-azea-purple text-white' : 'text-gray-500 hover:bg-gray-100')} onClick={() => onPage(p)}>
              {p}
            </button>
          ))}
          <button type="button" className={cx(btn, 'text-gray-500 hover:bg-gray-100')} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
            <Icon name="fa-solid fa-chevron-right" className="text-[9px]" />
          </button>
        </nav>
      )}
    </div>
  );
}
