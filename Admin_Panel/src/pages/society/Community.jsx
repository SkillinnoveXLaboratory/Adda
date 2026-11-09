import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { api, mediaHref } from '../../lib/api.js';
import { useAction, usePaged } from '../../lib/hooks.js';
import { formatDateTime, formatNumber, formatRelative, humanize } from '../../lib/format.js';
import { Avatar, Badge, Button, cx, EmptyState, ErrorState, Icon, PageHeader, Skeleton, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination } from '../../components/DataTable.jsx';
import { Checkbox, Field, Select, Textarea } from '../../components/Form.jsx';
import { ConfirmDialog, Modal, ReasonDialog } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useCounts } from '../../layout/Portals.jsx';

const MOD_LABEL = { hide: 'Hide', remove: 'Remove', restore: 'Restore' };

function ListShell({ q, empty, children, grid = false }) {
  if (q.loading && !q.data)
    return (
      <div className={grid ? 'grid grid-cols-1 gap-4 lg:grid-cols-2' : 'space-y-4'}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  if (q.error && !q.data)
    return (
      <div className="card">
        <ErrorState error={q.error} onRetry={q.reload} />
      </div>
    );
  if (!q.data.items.length) return <div className="card">{empty}</div>;
  return (
    <>
      <div className={cx(grid ? 'grid grid-cols-1 gap-4 lg:grid-cols-2' : 'space-y-4', q.reloading && 'opacity-60')}>{children}</div>
      <div className="card mt-4">
        <Pagination page={q.page} pages={q.data.pages} total={q.data.total} limit={q.limit} onPage={q.setPage} />
      </div>
    </>
  );
}

function Posts({ refreshCounts }) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [reported, setReported] = useState(false);
  const q = usePaged((p) => api.get('/society/posts', { ...p, sort: reported ? '-reportCount' : '-createdAt', reported: reported ? 'true' : undefined }), { status, reported }, 10);
  const [mod, setMod] = useState(null); // { post, action }
  const [compose, setCompose] = useState(false);
  const [body, setBody] = useState('');
  const [bodyError, setBodyError] = useState(null);
  const [moderate, moderating] = useAction((note) => api.post(`/society/posts/${mod.post._id}/moderate`, { action: mod.action, note: note || undefined }), {
    toast,
    success: () => `Post ${mod.action === 'restore' ? 'restored' : mod.action === 'hide' ? 'hidden' : 'removed'}`,
    onDone: () => (setMod(null), q.reload(), refreshCounts()),
  });
  const [publish, publishing] = useAction(() => api.post('/society/posts', { body: body.trim() }), { toast, success: 'Official post published', onDone: () => (setCompose(false), setBody(''), q.reload()) });

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Post status" className="w-44">
            <option value="">All except removed</option>
            <option value="published">Published</option>
            <option value="hidden">Hidden</option>
            <option value="removed">Removed</option>
          </Select>
          <Checkbox checked={reported} onChange={setReported} label="Reported only" />
        </div>
        <Button icon="fa-solid fa-pen" onClick={() => setCompose(true)}>
          Official post
        </Button>
      </div>
      <ListShell q={q} empty={<EmptyState icon="fa-regular fa-comments" title={reported ? 'No reported posts' : 'No posts yet'} message={reported ? 'Posts reported by residents show up here for review.' : 'Residents’ community posts from the Nivasa app appear here.'} />}>
        {q.data?.items.map((p) => (
          <article key={p._id} className="card p-5" data-testid="post-card">
            <div className="flex items-start gap-3">
              <Avatar name={p.author?.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-800">{p.author?.name || 'Resident'}</span>
                  {p.official && <Badge tone="purple">Official</Badge>}
                  {p.status !== 'published' && <Badge status={p.status} />}
                  {p.reportCount > 0 && <Badge tone="danger">{p.reportCount} report{p.reportCount > 1 ? 's' : ''}</Badge>}
                </div>
                <p className="text-[11px] text-gray-400" title={formatDateTime(p.createdAt)}>
                  {formatRelative(p.createdAt)}
                </p>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-700">{p.body}</p>
            {p.media?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {p.media.map((m) => (
                  <a key={m._id} href={mediaHref(m.url)} target="_blank" rel="noopener noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-gray-100">
                    <img src={mediaHref(m.url)} alt="Post attachment" className="h-full w-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            )}
            {p.moderationNote && <p className="mt-2 text-[11px] text-gray-400">Moderator note: {p.moderationNote}</p>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-50 pt-3">
              <span className="flex items-center gap-4 text-[11px] text-gray-400">
                <span>
                  <Icon name="fa-regular fa-heart" className="mr-1" />
                  {formatNumber(p.likeCount || 0)}
                </span>
                <span>
                  <Icon name="fa-regular fa-comment" className="mr-1" />
                  {formatNumber(p.commentCount || 0)}
                </span>
              </span>
              <div className="flex gap-2">
                {p.status !== 'published' && (
                  <Button size="xs" variant="success-outline" icon="fa-solid fa-rotate-left" onClick={() => setMod({ post: p, action: 'restore' })}>
                    Restore
                  </Button>
                )}
                {p.status === 'published' && (
                  <Button size="xs" variant="secondary" icon="fa-regular fa-eye-slash" onClick={() => setMod({ post: p, action: 'hide' })} data-testid="post-hide">
                    Hide
                  </Button>
                )}
                {p.status !== 'removed' && (
                  <Button size="xs" variant="danger-outline" icon="fa-regular fa-trash-can" onClick={() => setMod({ post: p, action: 'remove' })}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
      </ListShell>
      <ReasonDialog open={Boolean(mod)} onClose={() => setMod(null)} onSubmit={(n) => moderate(n)} busy={moderating} required={false} tone={mod?.action === 'restore' ? 'primary' : 'danger'} label="Moderator note" placeholder="Optional — recorded in the audit log" title={`${MOD_LABEL[mod?.action] || ''} post`} confirmLabel={MOD_LABEL[mod?.action]} message={mod?.action === 'hide' ? 'Hidden posts disappear from the feed but can be restored.' : mod?.action === 'remove' ? 'Removed posts are taken down for everyone. Open reports are marked actioned.' : 'The post becomes visible again. Open reports are dismissed.'} />
      <Modal open={compose} onClose={() => setCompose(false)} busy={publishing} title="Official post" subtitle="Appears in the community feed with an Official badge" icon="fa-solid fa-pen" footer={<><Button variant="secondary" onClick={() => setCompose(false)} disabled={publishing}>Cancel</Button><Button loading={publishing} onClick={() => (body.trim().length < 2 ? setBodyError('Write something first') : publish())}>Publish</Button></>}>
        <Field label="Message" error={bodyError} hint={`${body.length}/4000`}>
          <Textarea name="body" rows={5} maxLength={4000} value={body} onChange={(e) => (setBody(e.target.value), setBodyError(null))} invalid={Boolean(bodyError)} />
        </Field>
      </Modal>
    </>
  );
}

function Reports({ refreshCounts }) {
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const q = usePaged((p) => api.get('/society/content-reports', p), { status }, 20);
  const [act, setAct] = useState(null); // { report, action: dismiss|hide|remove }
  const [run, busy] = useAction(
    (note) => {
      const r = act.report;
      if (act.action === 'dismiss') return api.post(`/society/content-reports/${r._id}/dismiss`);
      const path = r.targetType === 'comment' ? `/society/comments/${r.targetId}/moderate` : `/society/posts/${r.targetId}/moderate`;
      return api.post(path, { action: act.action, note: note || undefined });
    },
    { toast, success: () => (act.action === 'dismiss' ? 'Report dismissed' : `Content ${act.action === 'hide' ? 'hidden' : 'removed'}`), onDone: () => (setAct(null), q.reload(), refreshCounts()) },
  );
  const columns = [
    { key: 'type', header: 'Type', render: (r) => <Badge tone="purple">{humanize(r.targetType)}</Badge> },
    { key: 'preview', header: 'Reported content', className: 'max-w-[320px] whitespace-normal', render: (r) => (r.target ? <span className="line-clamp-2 text-gray-700">{r.target.preview || '—'}</span> : <span className="text-gray-300">Content no longer exists</span>) },
    { key: 'reason', header: 'Reason', className: 'max-w-[220px] whitespace-normal', render: (r) => r.reason },
    { key: 'by', header: 'Reported by', render: (r) => r.reporter?.name || '—' },
    { key: 'when', header: 'When', render: (r) => formatRelative(r.createdAt) },
    { key: 'content', header: 'Content status', render: (r) => (r.target ? <Badge status={r.target.status} /> : '—') },
    { key: 'status', header: 'Report', render: (r) => <Badge status={r.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        r.status === 'open' ? (
          <div className="flex justify-end gap-2">
            {['post', 'comment'].includes(r.targetType) && r.target && r.target.status === 'published' && (
              <>
                <Button size="xs" variant="secondary" onClick={() => setAct({ report: r, action: 'hide' })}>
                  Hide
                </Button>
                <Button size="xs" variant="danger-outline" onClick={() => setAct({ report: r, action: 'remove' })}>
                  Remove
                </Button>
              </>
            )}
            <Button size="xs" variant="outline" onClick={() => setAct({ report: r, action: 'dismiss' })} data-testid="report-dismiss">
              Dismiss
            </Button>
          </div>
        ) : null,
    },
  ];
  return (
    <>
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Report status" className="w-44">
            <option value="open">Open</option>
            <option value="actioned">Actioned</option>
            <option value="dismissed">Dismissed</option>
          </Select>
          <p className="text-[11px] text-brand-muted">Listing reports are handled in Listings.</p>
        </div>
        <DataTable columns={columns} rows={q.data?.items} loading={q.loading} error={q.error} onRetry={q.reload} dim={q.reloading} empty={<EmptyState compact icon="fa-regular fa-flag" title={status === 'open' ? 'No open reports' : `No ${status} reports`} message="When residents report a post or comment it shows up here." />} />
        {q.data && <Pagination page={q.page} pages={q.data.pages} total={q.data.total} limit={q.limit} onPage={q.setPage} />}
      </div>
      <ConfirmDialog open={act?.action === 'dismiss'} onClose={() => setAct(null)} onConfirm={() => run()} busy={busy} tone="primary" title="Dismiss report" confirmLabel="Dismiss" message="The content stays as it is and the report is closed." />
      <ReasonDialog open={Boolean(act && act.action !== 'dismiss')} onClose={() => setAct(null)} onSubmit={(n) => run(n)} busy={busy} required={false} label="Moderator note" title={`${MOD_LABEL[act?.action] || ''} ${act?.report?.targetType || ''}`} confirmLabel={MOD_LABEL[act?.action]} message="Open reports on this content will be marked actioned." />
    </>
  );
}

export default function Community() {
  const { counts, refreshCounts } = useCounts();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  // Polls moved to their own Voting page; old links (?tab=polls) land there.
  if (params.get('tab') === 'polls') return <Navigate to="/society/voting" replace />;
  const tab = ['posts', 'reports'].includes(params.get('tab')) ? params.get('tab') : 'posts';
  return (
    <div>
      <PageHeader
        title="Community"
        subtitle="Moderate the resident feed and handle reports"
        actions={
          <Button variant="outline" icon="fa-solid fa-square-poll-vertical" iconRight="fa-solid fa-chevron-right" onClick={() => navigate('/society/voting')} data-testid="community-voting-link">
            Votes & polls
          </Button>
        }
      />
      <Tabs
        className="mb-4"
        tabs={[
          { value: 'posts', label: 'Posts', icon: 'fa-regular fa-comments' },
          { value: 'reports', label: 'Reports', icon: 'fa-regular fa-flag', count: counts.openReports || undefined },
        ]}
        value={tab}
        onChange={(v) => setParams({ tab: v })}
      />
      {tab === 'posts' && <Posts refreshCounts={refreshCounts} />}
      {tab === 'reports' && <Reports refreshCounts={refreshCounts} />}
    </div>
  );
}
