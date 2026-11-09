import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api.js';
import { useAction, useQuery, useTitle } from '../lib/hooks.js';
import { formatDateTime, formatRelative } from '../lib/format.js';
import { Button, cx, EmptyState, ErrorState, Icon, PageHeader, PageSkeleton } from '../components/ui.jsx';
import { Pagination } from '../components/DataTable.jsx';
import { useToast } from '../components/Toast.jsx';
import { useCounts } from '../layout/counts.js';
import { TYPE_ICON } from '../layout/NotificationBell.jsx';
import { NOTIFICATION_ROUTES } from '../layout/nav.js';

const LIMIT = 20;

/** All notifications (paged): bookings, KYC, listing and boost reviews. Opening one marks it read. */
export default function Notifications() {
  useTitle('Notifications');
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshCounts } = useCounts();
  const [page, setPage] = useState(1);
  const list = useQuery(() => api.get('/notifications', { page, limit: LIMIT }), [page]);
  const [readAll, marking] = useAction(
    useCallback(() => api.post('/notifications/read-all'), []),
    { toast, success: 'All marked as read', onDone: () => (list.reload(), refreshCounts()) },
  );

  const open = (n) => {
    if (!n.readAt) {
      list.setData((d) => ({ ...d, unread: Math.max(0, (d.unread || 1) - 1), items: d.items.map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x)) }));
      api.post(`/notifications/${n._id}/read`).then(refreshCounts, () => list.reload());
    }
    const path = NOTIFICATION_ROUTES[n.data?.route];
    if (path) navigate(path);
  };

  const d = list.data;
  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={d ? (d.unread ? `${d.unread} unread` : 'You’re all caught up') : 'Bookings, KYC, listing and boost updates'}
        actions={
          <Button variant="outline" icon="fa-solid fa-check-double" onClick={() => readAll()} loading={marking} disabled={!d?.unread}>
            Mark all read
          </Button>
        }
      />
      {list.loading && !d ? (
        <PageSkeleton rows={6} />
      ) : list.error && !d ? (
        <div className="card">
          <ErrorState error={list.error} onRetry={list.reload} />
        </div>
      ) : !d.items.length ? (
        <div className="card">
          <EmptyState icon="fa-regular fa-bell-slash" title="No notifications yet" message="New bookings, KYC results and listing reviews appear here." />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className={cx(list.reloading && 'opacity-70')} data-testid="notification-list">
            {d.items.map((n) => (
              <li key={n._id} className="border-b border-gray-50 last:border-0">
                <button type="button" onClick={() => open(n)} className={cx('flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-50 sm:px-5', !n.readAt && 'bg-azea-purpleLight/40')}>
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-azea-purpleLight text-azea-purple">
                    <Icon name={TYPE_ICON[n.type] || 'fa-regular fa-bell'} className="text-xs" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-xs font-semibold text-gray-800">{n.title}</span>
                    {n.body && <span className="mt-0.5 block break-words text-xs text-gray-500">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-gray-400" title={formatDateTime(n.createdAt)}>
                      {formatRelative(n.createdAt)}
                    </span>
                  </span>
                  {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-azea-purple" aria-label="Unread" />}
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={d.page || page} pages={d.pages || 1} total={d.total || d.items.length} limit={LIMIT} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
