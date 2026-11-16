import { useState } from 'react';
import { mediaHref } from '../lib/api.js';
import { societyInitials } from '../lib/branding.js';
import { cx } from './ui.jsx';

/** Society logo, or a brand-coloured tile with the society's initials when there is no logo (or it fails to load). */
export function SocietyLogo({ name, logoUrl, size = 32, className = '' }) {
  const [failed, setFailed] = useState(null);
  const src = logoUrl && failed !== logoUrl ? mediaHref(logoUrl) : null;
  const style = { width: size, height: size };
  if (src) {
    return <img src={src} alt={`${name || 'Society'} logo`} style={style} className={cx('shrink-0 rounded-lg bg-white object-cover shadow-sm ring-1 ring-gray-100', className)} onError={() => setFailed(logoUrl)} data-testid="society-logo" />;
  }
  return (
    <span style={{ ...style, fontSize: Math.round(size * 0.38) }} className={cx('inline-flex shrink-0 items-center justify-center rounded-lg bg-azea-purple font-bold tracking-wide text-white shadow-sm', className)} aria-hidden="true" data-testid="society-initials">
      {societyInitials(name)}
    </span>
  );
}

/** Logo + name for the signed-in shell (sidebar header, mobile top bar). Long names wrap to 2 lines with a tooltip. */
export function SocietyBrand({ name, logoUrl, compact = false, className = '' }) {
  const label = name || 'Your society';
  return (
    <span className={cx('flex min-w-0 items-center gap-2.5', className)} title={label} data-testid={compact ? 'brand-compact' : 'society-brand'}>
      <SocietyLogo name={label} logoUrl={logoUrl} size={compact ? 30 : 34} />
      <span className={cx('sidebar-text min-w-0 font-bold leading-tight text-gray-800', compact ? 'truncate text-sm' : 'line-clamp-2 break-words text-[13px]')}>{label}</span>
    </span>
  );
}
