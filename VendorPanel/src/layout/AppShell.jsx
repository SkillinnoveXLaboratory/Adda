import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth.jsx';
import { formatPhone } from '../lib/format.js';
import { Avatar, Badge, cx, Icon, Logo } from '../components/ui.jsx';
import { NotificationBell } from './NotificationBell.jsx';

const COLLAPSE_KEY = 'nivasa.vendor.sidebarCollapsed';
const readCollapsed = () => {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

function useOutsideClose(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return ref;
}

/** Deep-purple sidebar: 256 px, collapses to 70 px on desktop, off-canvas below lg. */
function Sidebar({ sections, collapsed, mobileOpen, onCloseMobile, badges, footer }) {
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 animate-fade-in bg-gray-900/50 lg:hidden" onClick={onCloseMobile} aria-hidden="true" />}
      <aside
        id="sidebar"
        aria-label="Main navigation"
        className={cx('sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-shrink-0 select-none flex-col bg-azea-sidebar text-violet-100 lg:static lg:z-30 lg:translate-x-0', collapsed && 'collapsed', mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full')}
      >
        <div className="sidebar-logo flex h-16 flex-shrink-0 items-center justify-between border-b border-white/10 px-5">
          <NavLink to="/dashboard" className="flex min-h-[40px] items-center" aria-label="Nivasa Vendor home">
            <Logo light />
          </NavLink>
          <button type="button" onClick={onCloseMobile} className="flex h-10 w-10 items-center justify-center rounded-lg text-violet-200 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close menu">
            <Icon name="fa-solid fa-xmark" />
          </button>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.title} className="sidebar-section">
              <p className="sidebar-header-title mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-violet-300/70">{section.title}</p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const count = item.badge ? badges?.[item.badge] : 0;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      title={collapsed ? item.label : undefined}
                      onClick={onCloseMobile}
                      className={({ isActive }) => cx('sidebar-item relative flex min-h-[40px] items-center justify-between rounded-lg px-3.5 py-2.5 transition-colors', isActive ? 'bg-white/15 font-medium text-white' : 'text-violet-200 hover:bg-white/5 hover:text-white')}
                    >
                      {({ isActive }) => (
                        <>
                          <span className="flex min-w-0 items-center gap-3">
                            <Icon name={item.icon} className={cx('w-5 text-center', isActive ? 'text-sm text-violet-200' : 'text-xs')} />
                            <span className={cx('sidebar-text truncate text-xs', isActive ? 'font-semibold' : 'font-medium')}>{item.label}</span>
                          </span>
                          {count > 0 && <span className="sidebar-badge ml-2 rounded-full bg-amber-400 px-1.5 py-px text-[10px] font-bold text-gray-900">{count > 99 ? '99+' : count === true ? '!' : count}</span>}
                          {count > 0 && collapsed && <span className="absolute right-3 top-2 hidden h-2 w-2 rounded-full bg-amber-400 lg:block" />}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        {footer && <div className="sidebar-text border-t border-white/10 p-4">{footer}</div>}
      </aside>
    </>
  );
}

const KYC_BADGE = { approved: ['success', 'Verified vendor'], pending: ['warning', 'KYC under review'], rejected: ['danger', 'KYC needs changes'], not_submitted: ['warning', 'KYC not submitted'] };

function UserMenu() {
  const { user, vendor, kycStatus, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useOutsideClose(open, setOpen);
  const navigate = useNavigate();
  const [tone, label] = KYC_BADGE[kycStatus] || KYC_BADGE.not_submitted;
  const display = vendor?.businessName || user?.name;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-2 rounded-full pl-1 pr-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-azea-purple/40" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} data-testid="user-menu">
        <Avatar name={display} />
        <span className="hidden max-w-[160px] truncate text-xs font-semibold text-gray-700 xl:block">{display}</span>
        <Icon name="fa-solid fa-chevron-down" className="hidden text-[9px] text-gray-400 xl:block" />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg" role="menu">
          <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
            <Avatar name={display} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-gray-800">{display}</p>
              <p className="truncate text-[11px] text-gray-400">{formatPhone(user?.phone)}</p>
              <Badge tone={tone} className="mt-1">
                {label}
              </Badge>
            </div>
          </div>
          <div className="py-1">
            <button type="button" role="menuitem" onClick={() => (setOpen(false), navigate('/profile'))} className="flex min-h-[40px] w-full items-center gap-3 px-4 text-left text-xs text-gray-600 hover:bg-gray-50 hover:text-azea-purple">
              <Icon name="fa-regular fa-user" className="w-4 text-center" /> Profile & security
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              data-testid="logout"
              onClick={async () => {
                setBusy(true);
                await logout();
                navigate('/login', { replace: true });
              }}
              className="flex min-h-[40px] w-full items-center gap-3 px-4 text-left text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-60"
            >
              <Icon name={busy ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-arrow-right-from-bracket'} className="w-4 text-center" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Shell: sidebar + 64 px header + scrolling main area. */
export function AppShell({ sections, badges, banner, sidebarFooter }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef(null);

  useEffect(() => {
    setMobileOpen(false);
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [location.pathname]);

  // Esc closes the phone menu.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const toggle = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setCollapsed((c) => {
        try {
          window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
        } catch {
          /* per-viewer convenience only */
        }
        return !c;
      });
    } else setMobileOpen((o) => !o);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-azea-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[90] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-xs">
        Skip to content
      </a>
      <Sidebar sections={sections} collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} badges={badges} footer={sidebarFooter} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex h-16 flex-shrink-0 items-center justify-between gap-2 border-b border-gray-100 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <button id="toggleSidebar" type="button" onClick={toggle} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 hover:text-azea-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-azea-purple/40" aria-label="Toggle navigation" aria-controls="sidebar" data-testid="toggle-sidebar">
              <Icon name="fa-solid fa-bars" className="text-lg" />
            </button>
            <span className="min-w-0 lg:hidden">
              <Logo />
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-sm text-gray-500 sm:gap-3">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main id="main" ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6" tabIndex={-1}>
          <div className="mx-auto w-full max-w-6xl">
            {banner}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
