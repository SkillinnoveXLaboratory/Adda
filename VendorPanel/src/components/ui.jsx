import { humanize } from '../lib/format.js';
import nivasaLogo from '../assets/nivasa-logo.png';

export const cx = (...c) => c.filter(Boolean).join(' ');

export const Icon = ({ name, className = '' }) => <i className={cx(name, className)} aria-hidden="true" />;

export function Spinner({ className = '' }) {
  return <span className={cx('inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent', className)} role="status" aria-label="Loading" />;
}

const BTN = {
  primary: 'bg-azea-purple text-white hover:bg-azea-purpleDark shadow-sm border border-azea-purple hover:border-azea-purpleDark',
  outline: 'bg-white border border-violet-200 text-azea-purple hover:bg-azea-purpleLight/60 shadow-sm',
  secondary: 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-800 shadow-sm',
  ghost: 'text-gray-500 hover:text-azea-purple hover:bg-gray-50 border border-transparent',
  danger: 'bg-azea-orange text-white hover:bg-[#d13c41] shadow-sm border border-azea-orange',
  'danger-outline': 'bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm border border-emerald-600',
  'success-outline': 'bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 shadow-sm',
};
// Every size is at least 40 px tall (touch target on phones).
const SIZE = { sm: 'min-h-[40px] px-3.5 py-2 text-xs rounded-lg', md: 'min-h-[40px] px-4 py-2 text-xs rounded-lg', lg: 'min-h-[44px] px-5 py-2.5 text-sm rounded-lg' };

/**
 * Button. `loading` disables it and shows a spinner (prevents double submits).
 * A `disabledReason` disables the button and explains why on hover/focus.
 */
export function Button({ variant = 'primary', size = 'md', icon, iconRight, loading = false, disabled, disabledReason, className = '', children, type = 'button', ...rest }) {
  const isDisabled = disabled || loading || Boolean(disabledReason);
  const btn = (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-azea-purple/40 disabled:cursor-not-allowed disabled:opacity-55',
        BTN[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="h-3 w-3" /> : icon ? <Icon name={icon} className="text-[11px]" /> : null}
      {children && <span>{children}</span>}
      {iconRight && !loading && <Icon name={iconRight} className="text-[9px]" />}
    </button>
  );
  if (disabledReason && !loading) {
    return (
      <span className="inline-flex" title={disabledReason}>
        {btn}
      </span>
    );
  }
  return btn;
}

export function IconButton({ icon, label, className = '', badge, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-50 hover:text-azea-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-azea-purple/40 disabled:opacity-50', className)} {...rest}>
      <Icon name={icon} />
      {badge}
    </button>
  );
}

export function Card({ title, actions, children, className = '', bodyClassName = '', padded = true, testId }) {
  return (
    <section className={cx('card', className)} data-testid={testId}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
          {title && <h2 className="card-title">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cx(padded && 'p-5', padded && (title || actions) && 'pt-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="text-xl font-bold tracking-tight text-gray-800">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-azea-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3">{actions}</div>}
    </div>
  );
}

/** Status → tone, shared by every page so badges are consistent. */
const TONES = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-700 ring-amber-100',
  danger: 'bg-rose-50 text-rose-600 ring-rose-100',
  info: 'bg-sky-50 text-sky-700 ring-sky-100',
  purple: 'bg-azea-purpleLight text-azea-purpleDark ring-violet-100',
  neutral: 'bg-gray-100 text-gray-500 ring-gray-200',
};
const STATUS_TONE = {
  approved: 'success', active: 'success', paid: 'success', completed: 'success', available: 'success',
  pending: 'warning', requested: 'warning', unpaid: 'warning', not_submitted: 'warning',
  accepted: 'info', paused: 'neutral',
  rejected: 'danger', declined: 'danger', removed: 'danger',
  cancelled: 'neutral', expired: 'neutral', inactive: 'neutral', sold: 'neutral', rented: 'neutral',
};
export function Badge({ tone, status, children, className = '' }) {
  const t = tone || STATUS_TONE[status] || 'neutral';
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset', TONES[t], className)}>{children ?? humanize(status)}</span>;
}

export function Skeleton({ className = '' }) {
  return <div className={cx('skeleton rounded-md', className)} />;
}

export function PageSkeleton({ cards = 0, rows = 5 }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {cards > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      )}
      <div className="card p-5">
        <Skeleton className="mb-5 h-4 w-40" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="mb-3 h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'fa-regular fa-folder-open', title = 'Nothing here yet', message, action, compact = false }) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')}>
      <div className={cx('mb-3 flex items-center justify-center rounded-full bg-azea-purpleLight text-azea-purple', compact ? 'h-11 w-11' : 'h-14 w-14')}>
        <Icon name={icon} className={compact ? 'text-base' : 'text-xl'} />
      </div>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {message && <p className="mt-1 max-w-sm text-xs leading-relaxed text-azea-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact = false }) {
  const forbidden = error?.status === 403;
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')} role="alert">
      <div className={cx('mb-3 flex h-14 w-14 items-center justify-center rounded-full', forbidden ? 'bg-amber-50 text-amber-500' : 'bg-rose-50 text-azea-orange')}>
        <Icon name={forbidden ? 'fa-solid fa-lock' : 'fa-solid fa-triangle-exclamation'} className="text-xl" />
      </div>
      <p className="text-sm font-semibold text-gray-700">{forbidden ? 'Not available' : 'Couldn’t load this'}</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-azea-muted">{error?.message || 'Something went wrong. Please try again.'}</p>
      {onRetry && !forbidden && (
        <Button variant="outline" icon="fa-solid fa-rotate-right" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** Wrapper that renders skeleton / error / children based on a useQuery result. */
export function QueryState({ query, skeleton, children }) {
  if (query.loading && !query.data) return skeleton ?? <PageSkeleton />;
  if (query.error && !query.data)
    return (
      <div className="card">
        <ErrorState error={query.error} onRetry={query.reload} />
      </div>
    );
  return children(query.data);
}

export function Tabs({ tabs, value, onChange, className = '', label = 'Filter' }) {
  return (
    <div className={cx('flex max-w-full flex-wrap gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-gray-100', className)} role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`tab-${t.value || 'all'}`}
            onClick={() => onChange(t.value)}
            className={cx('inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-colors', active ? 'bg-azea-purpleLight text-azea-purpleDark' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700')}
          >
            {t.icon && <Icon name={t.icon} className="text-[11px]" />}
            {t.label}
            {t.count !== undefined && t.count !== null && <span className={cx('rounded-full px-1.5 text-[10px]', active ? 'bg-azea-purple text-white' : 'bg-gray-100 text-gray-500')}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function KeyValue({ items, cols = 2 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-4', cols === 3 ? 'grid-cols-1 sm:grid-cols-3' : cols === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</dt>
          <dd className="mt-0.5 break-words text-xs font-medium text-gray-700">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Alert({ tone = 'info', icon, title, children, className = '', action, testId }) {
  const tones = {
    info: 'bg-sky-50/80 border-sky-100 text-sky-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    danger: 'bg-rose-50 border-rose-200 text-rose-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    purple: 'bg-azea-purpleLight border-violet-200 text-azea-purpleDark',
  };
  const icons = { info: 'fa-solid fa-circle-info', warning: 'fa-solid fa-triangle-exclamation', danger: 'fa-solid fa-circle-exclamation', success: 'fa-solid fa-circle-check', purple: 'fa-solid fa-circle-info' };
  return (
    <div className={cx('flex flex-col gap-3 rounded-xl border px-4 py-3 text-xs leading-relaxed sm:flex-row', tones[tone], className)} role={tone === 'danger' ? 'alert' : 'status'} data-testid={testId}>
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon name={icon || icons[tone]} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0 self-start sm:self-center">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = 'md' }) {
  const initials =
    String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('') || '?';
  const s = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-12 w-12 text-sm' : size === 'xl' ? 'h-16 w-16 text-lg' : 'h-8 w-8 text-[11px]';
  return <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-azea-purpleLight font-bold text-azea-purpleDark ring-1 ring-violet-100', s)}>{initials}</span>;
}

/** NIVASA logo + "Nivasa" + a small VENDOR label. */
export function Logo({ light = false, className = '' }) {
  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      <img src={nivasaLogo} alt="" width="32" height="32" className={cx('h-8 w-8 shrink-0 rounded-lg', light ? 'ring-1 ring-white/30' : 'shadow-sm')} />
      <span className="sidebar-text flex items-baseline gap-1.5">
        <span className={cx('text-xl font-bold tracking-tight', light ? 'text-white' : 'text-gray-800')}>Nivasa</span>
        <span className={cx('rounded px-1.5 py-0.5 text-[9px] font-bold tracking-[0.14em]', light ? 'bg-white/15 text-violet-100' : 'bg-azea-purpleLight text-azea-purpleDark')}>VENDOR</span>
      </span>
    </span>
  );
}

/** Photo thumbnail with a fallback icon. */
export function Thumb({ src, icon = 'fa-regular fa-image', className = 'h-16 w-20', alt = '' }) {
  return src ? (
    <img src={src} alt={alt} className={cx('shrink-0 rounded-lg bg-gray-100 object-cover', className)} loading="lazy" />
  ) : (
    <span className={cx('flex shrink-0 items-center justify-center rounded-lg bg-azea-purpleLight text-azea-purple', className)} aria-hidden="true">
      <Icon name={icon} className="text-lg" />
    </span>
  );
}
