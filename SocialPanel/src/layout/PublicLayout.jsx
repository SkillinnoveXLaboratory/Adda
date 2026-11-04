import { Link } from 'react-router';
import { cx, Icon, Logo } from '../components/ui.jsx';

const FEATURES = [
  ['fa-solid fa-file-invoice', 'Maintenance billing, receipts & dues tracking'],
  ['fa-solid fa-screwdriver-wrench', 'Complaints with assignment and timelines'],
  ['fa-regular fa-calendar-check', 'Facility bookings, notices and polls'],
  ['fa-solid fa-shield-halved', 'Role-based access and a tamper-evident audit log'],
];

/**
 * Public pages share the template palette: split layout (purple gradient panel + white card on #f2f4f9)
 * or a wide centred layout for multi-step flows.
 */
export function PublicLayout({ children, variant = 'split', title, subtitle }) {
  if (variant === 'wide') {
    return (
      <div className="min-h-screen bg-azea-bg">
        <header className="sticky top-0 z-20 border-b border-gray-100 bg-white">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
            <Link to="/login" aria-label="adda sign in">
              <Logo />
            </Link>
            <nav className="flex items-center gap-1 text-xs font-semibold sm:gap-2">
              <Link to="/status" className="rounded-md px-2.5 py-1.5 text-gray-500 hover:bg-gray-50 hover:text-azea-purple">
                <Icon name="fa-regular fa-clock" className="mr-1.5 hidden sm:inline" />
                Status
              </Link>
              <Link to="/login" className="rounded-md bg-azea-purple px-3 py-1.5 text-white shadow-sm hover:bg-azea-purpleDark">
                Sign in
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
          {title && (
            <div className="mb-6 text-center sm:mb-8">
              <h1 className="text-xl font-bold tracking-tight text-gray-800 sm:text-2xl">{title}</h1>
              {subtitle && <p className="mx-auto mt-1.5 max-w-xl text-xs leading-relaxed text-azea-muted sm:text-sm">{subtitle}</p>}
            </div>
          )}
          {children}
        </main>
        <footer className="pb-8 text-center text-[11px] text-azea-muted">© {new Date().getFullYear()} adda · Society management platform</footer>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen bg-azea-bg">
      <aside className="bg-brand-panel relative hidden w-[42%] max-w-[560px] flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-12">
        <Logo light />
        <div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
            Run your society,
            <br />
            the calm way.
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/80">One place for society admins and committees to manage residents, money and everyday operations.</p>
          <ul className="mt-8 space-y-3.5">
            {FEATURES.map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Icon name={icon} className="text-xs" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-white/60">© {new Date().getFullYear()} adda · Society management platform</p>
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full border-[40px] border-white/5" aria-hidden="true" />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>
        <div className={cx('w-full max-w-md')}>{children}</div>
      </main>
    </div>
  );
}

export function PublicCard({ children, className = '' }) {
  return <div className={cx('rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8', className)}>{children}</div>;
}
