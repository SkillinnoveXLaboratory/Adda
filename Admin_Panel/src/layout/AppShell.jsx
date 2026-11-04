import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth.jsx';
import { Avatar, cx, Icon, Logo } from '../components/ui.jsx';

const COLLAPSE_KEY = 'adda.master.sidebarCollapsed';
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

function Sidebar({ sections, collapsed, mobileOpen, onCloseMobile, badges, footer }) {
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 animate-fade-in bg-gray-900/40 lg:hidden" onClick={onCloseMobile} aria-hidden="true" />}
      <aside
        id="sidebar"
        aria-label="Main navigation"
        className={cx(
          'sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-shrink-0 select-none flex-col bg-sidebar-bg text-sidebar-text lg:static lg:z-30 lg:translate-x-0',
          collapsed && 'collapsed',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        <div className="sidebar-logo flex h-16 flex-shrink-0 items-center justify-between border-b border-[#2d303e]/40 px-5">
          <NavLink to="/admin" className="cursor-pointer" aria-label="Master dashboard">
            <Logo light />
          </NavLink>
          <button type="button" onClick={onCloseMobile} className="text-sidebar-text hover:text-white lg:hidden" aria-label="Close menu">
            <Icon name="fa-solid fa-xmark" />
          </button>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.title} className="sidebar-section">
              <p className="sidebar-header-title mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-sidebar-title">{section.title}</p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const count = item.badge ? badges?.[item.badge] : 0;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      title={collapsed ? item.label : undefined}
                      onClick={() => (item.onClick?.(), onCloseMobile())}
                      className={({ isActive }) =>
                        cx(
                          'sidebar-item relative flex items-center justify-between rounded-lg px-3.5 py-2.5 transition-colors',
                          isActive ? 'bg-sidebar-active font-medium text-white' : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span className="flex min-w-0 items-center space-x-3">
                            <Icon name={item.icon} className={cx('w-5 text-center text-sm', isActive && 'text-blue-400')} />
                            <span className={cx('sidebar-text truncate text-[13px]', isActive ? 'font-semibold' : 'font-medium')}>{item.label}</span>
                          </span>
                          {count > 0 && <span className="sidebar-badge ml-2 rounded-full bg-brand-danger px-1.5 py-px text-[10px] font-bold text-white">{count > 99 ? '99+' : count}</span>}
                          {count > 0 && collapsed && <span className="absolute right-3 top-2 hidden h-2 w-2 rounded-full bg-brand-danger ring-2 ring-sidebar-bg lg:block" />}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        {footer && <div className="sidebar-text border-t border-[#2d303e]/60 p-4">{footer}</div>}
      </aside>
    </>
  );
}

function QuickSearch({ sections }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const ref = useOutsideClose(open, setOpen);
  const results = useMemo(() => {
    const all = sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title })));
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return all.filter((i) => i.label.toLowerCase().includes(t) || i.section.toLowerCase().includes(t)).slice(0, 8);
  }, [q, sections]);
  const go = (item) => {
    navigate(item.to);
    setQ('');
    setOpen(false);
  };
  return (
    <div ref={ref} className="relative hidden w-56 sm:block md:w-64">
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
        <Icon name="fa-solid fa-magnifying-glass" className="text-xs" />
      </span>
      <input
        type="text"
        value={q}
        onChange={(e) => (setQ(e.target.value), setOpen(true), setActive(0))}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)));
          if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
          if (e.key === 'Enter' && results[active]) go(results[active]);
        }}
        className="w-full rounded-full border border-transparent bg-gray-50/80 py-1.5 pl-9 pr-4 text-xs text-gray-700 placeholder-gray-400 focus:border-gray-200 focus:bg-white focus:outline-none"
        placeholder="Search pages…"
        aria-label="Search pages"
        role="combobox"
        aria-expanded={open && results.length > 0}
      />
      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-10 z-50 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg" role="listbox">
          {results.length === 0 && <p className="px-4 py-3 text-xs text-brand-muted">No matching pages</p>}
          {results.map((r, i) => (
            <button key={r.to} type="button" role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(r)} className={cx('flex w-full items-center gap-3 px-4 py-2 text-left text-xs', i === active ? 'bg-brand-light text-brand' : 'text-gray-600')}>
              <Icon name={r.icon} className="w-4 text-center text-[11px]" />
              <span className="flex-1 truncate font-medium">{r.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-gray-400">{r.section}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useOutsideClose(open, setOpen);
  const navigate = useNavigate();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center space-x-2 rounded-full pl-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} data-testid="user-menu">
        <Avatar name={user?.name || user?.email} />
        <span className="hidden max-w-[120px] truncate text-xs font-semibold text-gray-700 xl:block">{user?.name || user?.email}</span>
        <Icon name="fa-solid fa-chevron-down" className="hidden text-[9px] text-gray-400 xl:block" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg" role="menu">
          <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
            <Avatar name={user?.name || user?.email} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-gray-800">{user?.name || 'Signed in'}</p>
              <p className="truncate text-[11px] text-gray-400">{user?.email}</p>
              <p className="mt-1 inline-flex rounded-full bg-brand-light px-2 py-0.5 text-[10px] font-semibold text-brand">Platform owner</p>
            </div>
          </div>
          <div className="py-1">
            <button type="button" role="menuitem" onClick={() => (setOpen(false), navigate('/admin/security'))} className="flex w-full items-center gap-3 px-4 py-2 text-left text-xs text-gray-600 hover:bg-gray-50 hover:text-brand">
              <Icon name="fa-solid fa-shield-halved" className="w-4 text-center" /> My security
            </button>
            <button type="button" role="menuitem" onClick={() => (setOpen(false), navigate('/admin/settings'))} className="flex w-full items-center gap-3 px-4 py-2 text-left text-xs text-gray-600 hover:bg-gray-50 hover:text-brand">
              <Icon name="fa-solid fa-sliders" className="w-4 text-center" /> Platform settings
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
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-xs text-rose-500 hover:bg-rose-50 disabled:opacity-60"
            >
              <Icon name={busy ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-arrow-right-from-bracket'} className="w-4 text-center" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FullscreenButton() {
  const [full, setFull] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const on = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  if (!document.fullscreenEnabled) return null;
  return (
    <button
      type="button"
      onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
      className="hidden p-1 transition-colors hover:text-brand sm:block"
      aria-label={full ? 'Exit full screen' : 'Full screen'}
      title={full ? 'Exit full screen' : 'Full screen'}
    >
      <Icon name={full ? 'fa-solid fa-compress' : 'fa-solid fa-expand'} />
    </button>
  );
}

/**
 * Shell from Admin_Panel/template.html: 256px dark sidebar (collapses to 70px; off-canvas below lg),
 * 64px white header, scrolling main area on #f3f5f9.
 */
export function AppShell({ sections, badges, banner, sidebarFooter }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef(null);

  useEffect(() => {
    setMobileOpen(false);
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [location.pathname]);

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
    <div className="flex h-screen overflow-hidden bg-brand-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[90] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-xs">
        Skip to content
      </a>
      <Sidebar sections={sections} collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} badges={badges} footer={sidebarFooter} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center space-x-4 sm:space-x-6">
            <button id="toggleSidebar" type="button" onClick={toggle} className="text-gray-500 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" aria-label="Toggle navigation" aria-controls="sidebar" data-testid="toggle-sidebar">
              <Icon name="fa-solid fa-bars" className="text-lg" />
            </button>
            <span className="lg:hidden">
              <Logo className="[&_.sidebar-text]:text-lg" />
            </span>
            <QuickSearch sections={sections} />
          </div>
          <div className="flex items-center space-x-3 text-sm text-gray-500 sm:space-x-4">
            <FullscreenButton />
            <UserMenu />
          </div>
        </header>
        <main id="main" ref={mainRef} className="flex-1 overflow-y-auto p-4 sm:p-6" tabIndex={-1}>
          {banner}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
