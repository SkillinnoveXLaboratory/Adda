import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatRelative } from '../lib/format.js';
import { cx, Icon, Spinner } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { NOTIFICATION_ROUTES } from './nav.js';

const TYPE_ICON = {
  membership: 'fa-solid fa-user-plus',
  complaint: 'fa-solid fa-screwdriver-wrench',
  booking: 'fa-regular fa-calendar-check',
  service: 'fa-solid fa-toolbox',
  listing: 'fa-solid fa-store',
  announcement: 'fa-solid fa-bullhorn',
  reminder: 'fa-solid fa-file-invoice',
  payment: 'fa-solid fa-indian-rupee-sign',
  community: 'fa-regular fa-comments',
};

/** Header bell: GET /notifications (unread count + latest), mark read, mark all read. */
export function Notifications() {
  const { isSuperAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [marking, setMarking] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/notifications', { limit: 15 });
      setData({ items: res.items || [], unread: res.unread || 0 });
      setError(null);
    } catch (err) {
      if (!silent) setError(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const t = setInterval(() => document.visibilityState === 'visible' && load(true), 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    load(false);
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, load]);

  const openItem = async (n) => {
    if (!n.readAt) {
      setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x)) }));
      api.post(`/notifications/${n._id}/read`).catch(() => load(true));
    }
    const path = !isSuperAdmin ? NOTIFICATION_ROUTES[n.data?.route] : null;
    if (path) {
      setOpen(false);
      navigate(path);
    }
  };

  const readAll = async () => {
    setMarking(true);
    try {
      await api.post('/notifications/read-all');
      setData((d) => ({ unread: 0, items: d.items.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })) }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="relative p-1 transition-colors hover:text-azea-purple" aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`} aria-haspopup="dialog" aria-expanded={open} data-testid="notifications-bell">
        <Icon name="fa-regular fa-bell" />
        {data.unread > 0 && <span className="absolute -right-1.5 -top-1 rounded-full border-2 border-white bg-azea-orange px-1 text-[9px] font-bold leading-[14px] text-white">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-10 sm:w-80" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Notifications</p>
            <button type="button" onClick={readAll} disabled={marking || data.unread === 0} className="text-[11px] font-semibold text-azea-purple hover:underline disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline" title={data.unread === 0 ? 'Nothing unread' : undefined}>
              {marking ? 'Marking…' : 'Mark all read'}
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && data.items.length === 0 && (
              <div className="flex justify-center py-8 text-azea-purple">
                <Spinner />
              </div>
            )}
            {error && data.items.length === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-gray-500">{error.message}</p>
                <button type="button" onClick={() => load(false)} className="mt-2 text-[11px] font-semibold text-azea-purple hover:underline">
                  Retry
                </button>
              </div>
            )}
            {!loading && !error && data.items.length === 0 && (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-azea-purpleLight text-azea-purple">
                  <Icon name="fa-regular fa-bell-slash" />
                </span>
                <p className="text-xs font-semibold text-gray-600">You’re all caught up</p>
                <p className="mt-0.5 text-[11px] text-azea-muted">New activity for your account appears here.</p>
              </div>
            )}
            {data.items.map((n) => (
              <button key={n._id} type="button" onClick={() => openItem(n)} className={cx('flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50', !n.readAt && 'bg-azea-purpleLight/40')}>
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-azea-purpleLight text-azea-purple">
                  <Icon name={TYPE_ICON[n.type] || 'fa-regular fa-bell'} className="text-xs" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-gray-700">{n.title}</span>
                  {n.body && <span className="mt-0.5 line-clamp-2 block text-[11px] text-gray-500">{n.body}</span>}
                  <span className="mt-1 block text-[10px] text-gray-400">{formatRelative(n.createdAt)}</span>
                </span>
                {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-azea-purple" aria-label="Unread" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
