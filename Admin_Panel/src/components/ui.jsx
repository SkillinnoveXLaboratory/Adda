import { useState } from 'react';
import { humanize } from '../lib/format.js';

export const cx = (...c) => c.filter(Boolean).join(' ');

export const Icon = ({ name, className = '' }) => <i className={cx(name, className)} aria-hidden="true" />;

export function Spinner({ className = '' }) {
  return <span className={cx('inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent', className)} role="status" aria-label="Loading" />;
}

const BTN = {
  primary: 'bg-brand text-white hover:bg-brand-dark shadow-sm border border-brand hover:border-brand-dark',
  outline: 'bg-white border border-gray-200 text-brand hover:bg-gray-50 shadow-sm',
  secondary: 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-800 shadow-sm',
  ghost: 'text-gray-500 hover:text-brand hover:bg-gray-50 border border-transparent',
  danger: 'bg-brand-danger text-white hover:bg-[#f04438] shadow-sm border border-brand-danger',
  'danger-outline': 'bg-white border border-rose-200 text-rose-500 hover:bg-rose-50 shadow-sm',
  success: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm border border-emerald-500',
  'success-outline': 'bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50 shadow-sm',
};
const SIZE = { xs: 'px-2.5 py-1 text-[11px] rounded-md', sm: 'px-3.5 py-1.5 text-xs rounded-md', md: 'px-4 py-2 text-xs rounded-lg', lg: 'px-5 py-2.5 text-sm rounded-lg' };

/**
 * Button. `loading` disables it and shows a spinner (prevents double submits).
 * A `disabledReason` disables the button and explains why on hover/focus.
 */
export function Button({ variant = 'primary', size = 'sm', icon, iconRight, loading = false, disabled, disabledReason, className = '', children, type = 'button', ...rest }) {
  const isDisabled = disabled || loading || Boolean(disabledReason);
  const btn = (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-55',
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
      <span className="inline-flex" title={disabledReason} tabIndex={0} aria-label={disabledReason}>
        {btn}
      </span>
    );
  }
  return btn;
}

export function IconButton({ icon, label, className = '', badge, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-50 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50', className)} {...rest}>
      <Icon name={icon} />
      {badge}
    </button>
  );
}

export function Card({ title, actions, children, className = '', bodyClassName = '', padded = true }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <div className={cx('flex flex-wrap items-center justify-between gap-2', padded ? 'px-5 pt-5' : 'px-5 py-4 border-b border-gray-100')}>
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
        <h1 className="truncate text-xl font-bold tracking-tight text-gray-800">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-brand-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3">{actions}</div>}
    </div>
  );
}

/** Status → tone, shared by every page so badges are consistent. */
const TONES = {
  success: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-600 ring-amber-100',
  danger: 'bg-rose-50 text-rose-500 ring-rose-100',
  info: 'bg-blue-50 text-brand-info ring-blue-100',
  purple: 'bg-brand-light text-brand ring-blue-100',
  neutral: 'bg-gray-100 text-gray-500 ring-gray-200',
};
const STATUS_TONE = {
  approved: 'success', active: 'success', paid: 'success', confirmed: 'success', resolved: 'success', completed: 'success', captured: 'success', published: 'success', recorded: 'success', done: 'success', credit: 'success', open_poll: 'success',
  pending: 'warning', submitted: 'warning', requested: 'warning', unpaid: 'warning', pending_setup: 'warning', open: 'warning', created: 'warning', authorized: 'warning',
  under_review: 'info', assigned: 'info', in_progress: 'info', scheduled: 'info', accepted: 'info', partially_paid: 'info', refund_pending: 'info',
  rejected: 'danger', overdue: 'danger', suspended: 'danger', disabled: 'danger', failed: 'danger', removed: 'danger', voided: 'danger', reversed: 'danger', hidden: 'danger', debit: 'danger', urgent: 'danger', high: 'warning', refunded: 'neutral',
  closed: 'neutral', archived: 'neutral', cancelled: 'neutral', draft: 'neutral', inactive: 'neutral', dismissed: 'neutral', expired: 'neutral', actioned: 'success', low: 'neutral', normal: 'info',
};
export function Badge({ tone, status, children, className = '' }) {
  const t = tone || STATUS_TONE[status] || 'neutral';
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset', TONES[t], className)}>
      {children ?? humanize(status)}
    </span>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={cx('skeleton rounded-md', className)} />;
}

export function PageSkeleton({ cards = 0, rows = 6 }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {cards > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-xl" />
          ))}
        </div>
      )}
      <div className="card p-5">
        <Skeleton className="mb-5 h-4 w-40" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="mb-3 h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'fa-regular fa-folder-open', title = 'Nothing here yet', message, action, compact = false }) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')}>
      <div className={cx('mb-3 flex items-center justify-center rounded-full bg-brand-light text-brand', compact ? 'h-11 w-11' : 'h-14 w-14')}>
        <Icon name={icon} className={compact ? 'text-base' : 'text-xl'} />
      </div>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {message && <p className="mt-1 max-w-sm text-xs leading-relaxed text-brand-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact = false }) {
  const forbidden = error?.status === 403;
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')} role="alert">
      <div className={cx('mb-3 flex h-14 w-14 items-center justify-center rounded-full', forbidden ? 'bg-amber-50 text-amber-500' : 'bg-rose-50 text-brand-danger')}>
        <Icon name={forbidden ? 'fa-solid fa-lock' : 'fa-solid fa-triangle-exclamation'} className="text-xl" />
      </div>
      <p className="text-sm font-semibold text-gray-700">{forbidden ? 'You don’t have access to this' : 'Couldn’t load this page'}</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-brand-muted">{error?.message || 'Something went wrong. Please try again.'}</p>
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
  if (query.error && !query.data) return <div className="card"><ErrorState error={query.error} onRetry={query.reload} /></div>;
  return children(query.data);
}

export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={cx('flex max-w-full gap-1 overflow-x-auto rounded-lg bg-white p-1 shadow-sm ring-1 ring-gray-100', className)} role="tablist">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', active ? 'bg-brand-light text-brand' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700')}
          >
            {t.icon && <Icon name={t.icon} className="text-[11px]" />}
            {t.label}
            {t.count !== undefined && t.count !== null && (
              <span className={cx('rounded-full px-1.5 text-[10px]', active ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500')}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function CopyField({ label, value, mono = true, testId }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {label && <p className="form-label">{label}</p>}
      <div className="flex items-stretch overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        <code data-testid={testId} className={cx('min-w-0 flex-1 select-all break-all px-3 py-2 text-xs text-gray-800', mono ? 'font-mono' : 'font-sans')}>
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            const ok = await copyText(value);
            setCopied(ok);
            setTimeout(() => setCopied(false), 1800);
          }}
          className="flex shrink-0 items-center gap-1.5 border-l border-gray-200 bg-white px-3 text-[11px] font-semibold text-brand hover:bg-brand-light"
          aria-label={`Copy ${label || 'value'}`}
        >
          <Icon name={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export function KeyValue({ items, cols = 2 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-4', cols === 3 ? 'grid-cols-1 sm:grid-cols-3' : cols === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</dt>
          <dd className="mt-0.5 break-words text-xs font-medium text-gray-700">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Alert({ tone = 'info', icon, title, children, className = '', action }) {
  const tones = {
    info: 'bg-blue-50/70 border-blue-100 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    danger: 'bg-rose-50 border-rose-200 text-rose-700',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    purple: 'bg-brand-light border-blue-200 text-brand-dark',
  };
  const icons = { info: 'fa-solid fa-circle-info', warning: 'fa-solid fa-triangle-exclamation', danger: 'fa-solid fa-circle-exclamation', success: 'fa-solid fa-circle-check', purple: 'fa-solid fa-circle-info' };
  return (
    <div className={cx('flex gap-3 rounded-xl border px-4 py-3 text-xs leading-relaxed', tones[tone], className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon || icons[tone]} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
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
  const s = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-8 w-8 text-[11px]';
  return <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-brand-light font-bold text-brand ring-1 ring-blue-100', s)}>{initials}</span>;
}

export function Logo({ light = false, className = '' }) {
  return (
    <span className={cx('flex items-center space-x-3 overflow-hidden', className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white">
        <Icon name="fa-solid fa-play" className="-rotate-90 text-xs" />
      </span>
      <span className={cx('sidebar-text text-xl font-bold tracking-tight', light ? 'text-white' : 'text-gray-800')}>
        adda <span className={cx('align-middle text-[10px] font-semibold uppercase tracking-widest', light ? 'text-sidebar-text' : 'text-gray-400')}>master</span>
      </span>
    </span>
  );
}
