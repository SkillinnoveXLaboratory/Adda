import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, mediaHref } from '../../lib/api.js';
import { useAction, usePaged } from '../../lib/hooks.js';
import { formatDateTime, formatNumber, formatRelative, humanize, istDateTimeISO } from '../../lib/format.js';
import { Avatar, Badge, Button, cx, EmptyState, ErrorState, Icon, PageHeader, Skeleton, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination } from '../../components/DataTable.jsx';
import { Checkbox, Field, Input, Select, Textarea } from '../../components/Form.jsx';
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
      <ListShell q={q} empty={<EmptyState icon="fa-regular fa-comments" title={reported ? 'No reported posts' : 'No posts yet'} message={reported ? 'Posts reported by residents show up here for review.' : 'Residents’ community posts from the adda app appear here.'} />}>
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
          <p className="text-[11px] text-azea-muted">Listing reports are handled in Listings.</p>
        </div>
        <DataTable columns={columns} rows={q.data?.items} loading={q.loading} error={q.error} onRetry={q.reload} dim={q.reloading} empty={<EmptyState compact icon="fa-regular fa-flag" title={status === 'open' ? 'No open reports' : `No ${status} reports`} message="When residents report a post or comment it shows up here." />} />
        {q.data && <Pagination page={q.page} pages={q.data.pages} total={q.data.total} limit={q.limit} onPage={q.setPage} />}
      </div>
      <ConfirmDialog open={act?.action === 'dismiss'} onClose={() => setAct(null)} onConfirm={() => run()} busy={busy} tone="primary" title="Dismiss report" confirmLabel="Dismiss" message="The content stays as it is and the report is closed." />
      <ReasonDialog open={Boolean(act && act.action !== 'dismiss')} onClose={() => setAct(null)} onSubmit={(n) => run(n)} busy={busy} required={false} label="Moderator note" title={`${MOD_LABEL[act?.action] || ''} ${act?.report?.targetType || ''}`} confirmLabel={MOD_LABEL[act?.action]} message="Open reports on this content will be marked actioned." />
    </>
  );
}

function PollModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [closes, setCloses] = useState('');
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setQuestion('');
      setOptions(['', '']);
      setCloses('');
      setErrors({});
    }
  }, [open]);
  const [save, busy] = useAction(() => api.post('/society/polls', { question: question.trim(), options: options.map((o) => o.trim()), closesAt: closes ? istDateTimeISO(closes, '23:59') : undefined }), { toast, success: 'Poll published', onDone: () => (onSaved(), onClose()) });
  const submit = (e) => {
    e?.preventDefault();
    const errs = {};
    if (question.trim().length < 5) errs.question = 'Question must be at least 5 characters';
    const opts = options.map((o) => o.trim());
    if (opts.some((o) => !o)) errs.options = 'Fill in every option (or remove empty ones)';
    else if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) errs.options = 'Options must be unique';
    if (closes && closes < new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)) errs.closes = 'Choose a future date';
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  return (
    <Modal open={open} onClose={onClose} busy={busy} title="New poll" subtitle="Residents vote once; results show after voting or closing" icon="fa-solid fa-square-poll-vertical" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy}>Publish poll</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Question" required error={errors.question}>
          <Input name="question" value={question} maxLength={300} onChange={(e) => (setQuestion(e.target.value), setErrors((x) => ({ ...x, question: undefined })))} invalid={Boolean(errors.question)} />
        </Field>
        <div>
          <p className="form-label">Options (2–8)</p>
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label={`Option ${i + 1}`} value={o} maxLength={120} onChange={(e) => (setOptions(options.map((x, j) => (j === i ? e.target.value : x))), setErrors((x) => ({ ...x, options: undefined })))} placeholder={`Option ${i + 1}`} />
                <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} disabled={options.length <= 2} className="flex w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30" aria-label={`Remove option ${i + 1}`} title={options.length <= 2 ? 'A poll needs at least 2 options' : 'Remove option'}>
                  <Icon name="fa-solid fa-xmark" />
                </button>
              </div>
            ))}
          </div>
          {errors.options && <p className="mt-1 text-[11px] font-medium text-rose-500">{errors.options}</p>}
          <Button size="xs" variant="ghost" icon="fa-solid fa-plus" className="mt-2" disabled={options.length >= 8} onClick={() => setOptions([...options, ''])}>
            Add option
          </Button>
        </div>
        <Field label="Closes on (optional)" error={errors.closes} hint="Leave empty to close it manually">
          <Input type="date" name="closes" value={closes} onChange={(e) => setCloses(e.target.value)} invalid={Boolean(errors.closes)} />
        </Field>
      </form>
    </Modal>
  );
}

function Polls() {
  const toast = useToast();
  const q = usePaged((p) => api.get('/society/polls', { ...p, sort: '-createdAt' }), {}, 10);
  const [modal, setModal] = useState(null);
  const [close, closing] = useAction(() => api.post(`/society/polls/${modal.item._id}/close`), { toast, success: 'Poll closed', onDone: () => (setModal(null), q.reload()) });
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button icon="fa-solid fa-plus" onClick={() => setModal({ type: 'new' })} data-testid="new-poll">
          New poll
        </Button>
      </div>
      <ListShell q={q} grid empty={<EmptyState icon="fa-solid fa-square-poll-vertical" title="No polls yet" message="Ask residents a quick question — results update as they vote." action={<Button icon="fa-solid fa-plus" onClick={() => setModal({ type: 'new' })}>New poll</Button>} />}>
        {q.data?.items.map((p) => {
          const total = p.totalVotes || p.options.reduce((s, o) => s + (o.votes || 0), 0);
          const open = p.status === 'open' && (!p.closesAt || new Date(p.closesAt) > new Date());
          const max = Math.max(...p.options.map((o) => o.votes || 0));
          return (
            <article key={p._id} className="card flex flex-col p-5" data-testid="poll-card">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold text-gray-800">{p.question}</h3>
                <Badge status={open ? 'open' : 'closed'}>{open ? 'Open' : 'Closed'}</Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {formatNumber(total)} vote{total === 1 ? '' : 's'} · created {formatRelative(p.createdAt)}
                {p.closesAt ? ` · closes ${formatDateTime(p.closesAt)}` : ''}
              </p>
              <ul className="mt-4 flex-1 space-y-3">
                {p.options.map((o) => {
                  const pct = total ? Math.round(((o.votes || 0) / total) * 100) : 0;
                  return (
                    <li key={o._id}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className={cx('font-medium', o.votes && o.votes === max ? 'text-azea-purple' : 'text-gray-700')}>{o.label}</span>
                        <span className="text-[11px] text-gray-500">
                          {formatNumber(o.votes || 0)} · {pct}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className={cx('h-full rounded-full', o.votes && o.votes === max ? 'bg-azea-purple' : 'bg-azea-cyan')} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {p.status === 'open' && (
                <div className="mt-4 flex justify-end border-t border-gray-50 pt-3">
                  <Button size="xs" variant="danger-outline" icon="fa-solid fa-lock" onClick={() => setModal({ type: 'close', item: p })}>
                    Close poll
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </ListShell>
      <PollModal open={modal?.type === 'new'} onClose={() => setModal(null)} onSaved={q.reload} />
      <ConfirmDialog open={modal?.type === 'close'} onClose={() => setModal(null)} onConfirm={() => close()} busy={closing} title="Close poll" confirmLabel="Close poll" message="Residents won’t be able to vote any more. Results stay visible." />
    </>
  );
}

export default function Community() {
  const { counts, refreshCounts } = useCounts();
  const [params, setParams] = useSearchParams();
  const tab = ['posts', 'reports', 'polls'].includes(params.get('tab')) ? params.get('tab') : 'posts';
  return (
    <div>
      <PageHeader title="Community" subtitle="Moderate the resident feed, handle reports and run polls" />
      <Tabs
        className="mb-4"
        tabs={[
          { value: 'posts', label: 'Posts', icon: 'fa-regular fa-comments' },
          { value: 'reports', label: 'Reports', icon: 'fa-regular fa-flag', count: counts.openReports || undefined },
          { value: 'polls', label: 'Polls', icon: 'fa-solid fa-square-poll-vertical' },
        ]}
        value={tab}
        onChange={(v) => setParams({ tab: v })}
      />
      {tab === 'posts' && <Posts refreshCounts={refreshCounts} />}
      {tab === 'reports' && <Reports refreshCounts={refreshCounts} />}
      {tab === 'polls' && <Polls />}
    </div>
  );
}
