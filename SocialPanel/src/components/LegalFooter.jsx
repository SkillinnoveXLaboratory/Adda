import { Link } from 'react-router';
import { LEGAL, POLICY_LINKS } from '../lib/legal.js';
import { cx } from './ui.jsx';

/** Legal name, contact details and policy links — shown on every public page. */
export function LegalFooter({ light = false, className }) {
  const muted = light ? 'text-white/70' : 'text-azea-muted';
  const link = light ? 'text-white/85 hover:text-white' : 'text-gray-600 hover:text-azea-purple';
  return (
    <footer className={cx('text-center text-[11px] leading-relaxed', muted, className)} data-testid="legal-footer">
      <nav aria-label="Policies" className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {POLICY_LINKS.map((p) => (
          <Link key={p.to} to={p.to} className={cx('underline-offset-2 hover:underline', link)}>
            {p.label}
          </Link>
        ))}
      </nav>
      <p className="mt-2">
        © {new Date().getFullYear()} {LEGAL.brand} · Operated by <span className="font-semibold">{LEGAL.legalName}</span>
      </p>
      <p>
        <a href={`mailto:${LEGAL.email}`} className={link}>
          {LEGAL.email}
        </a>
        {' · '}
        <a href={`tel:+91${LEGAL.phone}`} className={link}>
          {LEGAL.phoneDisplay}
        </a>
      </p>
    </footer>
  );
}
