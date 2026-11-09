import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, saveBlob } from '../../lib/api.js';
import { useAction, usePaged, useQuery } from '../../lib/hooks.js';
import { formatDateTime, formatNumber, formatRelative, todayIST } from '../../lib/format.js';
import { apiFieldErrors, csvFileName, DEFAULT_OPTIONS, filterVoters, formatPercent, isEnded, MAX_OPTIONS, MIN_OPTIONS, NOTE_MAX, OPTION_MAX, QUESTION_MAX, RESULT_MAX, RESULT_MIN, timeLeft, timingText, turnoutText, validateVote, votersCsv } from '../../lib/voting.js';
import { Alert, Badge, Button, cx, EmptyState, ErrorState, Icon, PageHeader, Skeleton, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination } from '../../components/DataTable.jsx';
import { Field, Input, SearchInput, Textarea } from '../../components/Form.jsx';
import { ConfirmDialog, Drawer, Modal } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';

const TABS = [
  { value: 'open', label: 'Open', icon: 'fa-regular fa-circle-dot' },
  { value: 'ended', label: 'Ended', icon: 'fa-regular fa-circle-check' },
  { value: 'all', label: 'All', icon: 'fa-solid fa-list' },
];

/** Re-renders every 30 s so "Closes in …" stays current. */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function StatusBadges({ poll, now }) {
  const ended = isEnded(poll, now);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={ended ? 'neutral' : 'success'}>{ended ? 'Ended' : 'Open'}</Badge>
      {poll.resultPublishedAt && (
        <span className="inline-flex" data-testid="result-badge">
          <Badge tone="purple" className="gap-1">
            <Icon name="fa-solid fa-bullhorn" className="text-[9px]" />
            Result published
          </Badge>
        </span>
      )}
    </div>
  );
}

/** One ratio bar per option: label, votes, percent. Leading option(s) highlighted. */
function OptionBars({ poll }) {
  const max = Math.max(0, ...poll.options.map((o) => o.votes || 0));
  return (
    <ul className="space-y-3">
      {poll.options.map((o) => {
        const lead = max > 0 && (o.votes || 0) === max;
        const p = Number(o.percent) || 0;
        return (
          <li key={o._id} data-testid="vote-option">
            <div className="mb-1 flex items-start justify-between gap-3 text-xs">
              <span className={cx('min-w-0 break-words font-medium', lead ? 'text-azea-purple' : 'text-gray-700')}>{o.label}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-gray-500">
                {formatNumber(o.votes || 0)} vote{o.votes === 1 ? '' : 's'} · <b className="font-semibold text-gray-700">{formatPercent(p)}</b>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={o.label} aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
              <div className={cx('h-full rounded-full transition-[width] duration-500', lead ? 'bg-azea-purple' : 'bg-azea-cyan')} style={{ width: `${Math.min(100, p)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Turnout({ poll }) {
  const p = Math.min(100, Number(poll.turnoutPercent) || 0);
  return (
    <div className="flex items-center gap-2 text-[11px] text-gray-500" data-testid="vote-turnout">
      <Icon name="fa-solid fa-people-group" className="text-gray-400" />
      <span>
        Turnout <b className="font-semibold text-gray-700">{turnoutText(poll.totalVotes, poll.eligibleVoters, poll.turnoutPercent)}</b>
      </span>
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 sm:block" aria-hidden="true">
        <span className="block h-full rounded-full bg-azea-green" style={{ width: `${p}%` }} />
      </span>
    </div>
  );
}

function VoteCard({ poll, now, onOpen }) {
  const ended = isEnded(poll, now);
  return (
    <article className="card flex min-w-0 flex-col p-5" data-testid="vote-card">
      <div className="flex items-start justify-between gap-3">
        <StatusBadges poll={poll} now={now} />
        <span className="shrink-0 text-[11px] text-gray-400" title={formatDateTime(poll.createdAt)}>
          {formatRelative(poll.createdAt)}
        </span>
      </div>
      <h3 className="mt-3 break-words text-sm font-bold leading-snug text-gray-800">{poll.question}</h3>
      {poll.description && <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-500">{poll.description}</p>}
      <div className="mt-4 flex-1">
        <OptionBars poll={poll} />
      </div>
      <div className="mt-4 space-y-1.5 border-t border-gray-50 pt-3">
        <Turnout poll={poll} />
        <p className={cx('flex items-center gap-2 text-[11px]', ended ? 'text-gray-400' : 'text-amber-600')}>
          <Icon name={ended ? 'fa-regular fa-calendar-check' : 'fa-regular fa-clock'} />
          {timingText(poll, now)}
        </p>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="xs" variant="outline" iconRight="fa-solid fa-chevron-right" onClick={() => onOpen(poll._id)} data-testid="vote-open" aria-label={`View details: ${poll.question}`}>
          Details & voters
        </Button>
      </div>
    </article>
  );
}

const emptyForm = () => ({ question: '', note: '', options: [...DEFAULT_OPTIONS], closeDate: '', closeTime: '' });

function NewVoteModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const [f, setF] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setF(emptyForm());
      setErrors({});
    }
  }, [open]);
  const set = (k, v) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k === 'closeDate' || k === 'closeTime' ? 'closes' : k]: undefined, form: undefined }));
  };
  const setOption = (i, v) => set('options', f.options.map((o, j) => (j === i ? v : o)));
  const [save, busy] = useAction(
    async () => {
      try {
        return await api.post('/society/polls', {
          question: f.question.trim(),
          description: f.note.trim() || undefined,
          options: f.options.map((o) => o.trim()),
          closesAt: f.closeDate && f.closeTime ? `${f.closeDate}T${f.closeTime}:00+05:30` : undefined,
        });
      } catch (err) {
        if (err?.code !== 'CANCELLED') setErrors(apiFieldErrors(err));
        throw err;
      }
    },
    { toast, success: 'Vote published — members have been notified', onDone: (p) => (onCreated(p), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = validateVote(f);
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const previewClose = f.closeDate && f.closeTime && !validateVote(f).closes ? timeLeft(`${f.closeDate}T${f.closeTime}:00+05:30`) : null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="xl"
      title="New vote"
      subtitle="Members vote once from the app. You see the ratio and who voted; they see results after voting."
      icon="fa-solid fa-square-poll-vertical"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} icon="fa-solid fa-paper-plane" data-testid="vote-publish">
            Publish vote
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <form onSubmit={submit} noValidate className="min-w-0 space-y-4">
          {errors.form && <Alert tone="danger">{errors.form}</Alert>}
          <Field label="Question" required error={errors.question} hint={`${f.question.length}/${QUESTION_MAX}`} htmlFor="vote-question">
            <Input id="vote-question" name="question" value={f.question} maxLength={QUESTION_MAX} placeholder="e.g. Should we install solar panels on the roof?" onChange={(e) => set('question', e.target.value)} invalid={Boolean(errors.question)} />
          </Field>
          <Field label="Note (optional)" error={errors.note} hint={`Details members should know — ${f.note.length}/${NOTE_MAX}`} htmlFor="vote-note">
            <Textarea id="vote-note" name="note" rows={3} value={f.note} maxLength={NOTE_MAX} placeholder="e.g. Cost is shared by all flats. Vote Interested if you want a quote meeting." onChange={(e) => set('note', e.target.value)} invalid={Boolean(errors.note)} />
          </Field>
          <div>
            <p className="form-label">
              Answer options ({MIN_OPTIONS}–{MAX_OPTIONS})<span className="ml-0.5 text-azea-orange">*</span>
            </p>
            <div className="space-y-2">
              {f.options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input aria-label={`Option ${i + 1}`} data-testid="vote-option-input" value={o} maxLength={OPTION_MAX} placeholder={`Option ${i + 1}`} onChange={(e) => setOption(i, e.target.value)} invalid={Boolean(errors.options) && !o.trim()} />
                  <button
                    type="button"
                    onClick={() => set('options', f.options.filter((_, j) => j !== i))}
                    disabled={f.options.length <= MIN_OPTIONS}
                    className="flex w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Remove option ${i + 1}`}
                    title={f.options.length <= MIN_OPTIONS ? `A vote needs at least ${MIN_OPTIONS} options` : 'Remove option'}
                  >
                    <Icon name="fa-solid fa-xmark" />
                  </button>
                </div>
              ))}
            </div>
            {errors.options && (
              <p className="mt-1 text-[11px] font-medium text-rose-500" role="alert">
                {errors.options}
              </p>
            )}
            <Button size="xs" variant="ghost" icon="fa-solid fa-plus" className="mt-2" disabledReason={f.options.length >= MAX_OPTIONS ? `Up to ${MAX_OPTIONS} options` : undefined} onClick={() => set('options', [...f.options, ''])}>
              Add option
            </Button>
          </div>
          <div>
            <p className="form-label">Closes on (optional, India time)</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input type="date" aria-label="Close date" name="closeDate" min={todayIST()} value={f.closeDate} onChange={(e) => set('closeDate', e.target.value)} invalid={Boolean(errors.closes)} />
              <Input type="time" aria-label="Close time" name="closeTime" value={f.closeTime} onChange={(e) => set('closeTime', e.target.value)} invalid={Boolean(errors.closes)} />
            </div>
            {errors.closes ? (
              <p className="mt-1 text-[11px] font-medium text-rose-500" role="alert">
                {errors.closes}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-azea-muted">At least 5 minutes and at most a year from now. Leave empty to end it yourself with “End now”.</p>
            )}
          </div>
        </form>
        <aside aria-label="Preview" className="min-w-0">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">What members see</p>
          <div className="rounded-xl border border-gray-100 bg-azea-bg p-4" data-testid="vote-preview">
            <p className="break-words text-sm font-bold leading-snug text-gray-800">{f.question.trim() || 'Your question'}</p>
            {f.note.trim() && <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-500">{f.note.trim()}</p>}
            <div className="mt-3 space-y-2">
              {f.options.map((o, i) => (
                <div key={i} className="break-words rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-center text-xs font-semibold text-gray-700">
                  {o.trim() || `Option ${i + 1}`}
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500">
              <Icon name="fa-regular fa-clock" />
              {previewClose || 'Open until you end it'}
            </p>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

function ResultSection({ poll, ended, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const published = Boolean(poll.resultPublishedAt);
  useEffect(() => {
    setEditing(false);
    setError(null);
    setText(poll.result || '');
  }, [poll._id, poll.result]);
  const [save, busy] = useAction(
    async () => {
      try {
        return await api.put(`/society/polls/${poll._id}/result`, { result: text.trim() });
      } catch (err) {
        if (err?.code !== 'CANCELLED') setError(err.code === 'POLL_OPEN' ? err.message : apiFieldErrors(err).result || err.message);
        throw err;
      }
    },
    { toast, success: published ? 'Result updated' : 'Result published — members have been notified', onDone: () => (setEditing(false), onSaved()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const t = text.trim();
    if (t.length < RESULT_MIN) return setError(t ? `Write at least ${RESULT_MIN} characters` : 'Write the result members will see');
    save();
  };

  if (!ended)
    return (
      <Alert tone="info" title="Result">
        Publish the result after the vote ends — press “End now” or wait for the close time.
      </Alert>
    );
  if (published && !editing)
    return (
      <div className="rounded-xl border border-violet-100 bg-azea-purpleLight/60 p-4" data-testid="vote-result">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-azea-purple">Published result</p>
          <Button size="xs" variant="ghost" icon="fa-regular fa-pen-to-square" onClick={() => setEditing(true)} data-testid="result-edit">
            Edit
          </Button>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-700">{poll.result}</p>
        <p className="mt-2 text-[11px] text-gray-400">
          {poll.resultBy?.name ? `By ${poll.resultBy.name} · ` : ''}
          {formatDateTime(poll.resultPublishedAt)}
        </p>
      </div>
    );
  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <Field label={published ? 'Edit result' : 'Publish the result'} error={error} hint={published ? 'Members already got a notification; they see the new text on the vote.' : `Members get a notification and see this on the vote — ${text.length}/${RESULT_MAX}`} htmlFor="vote-result-text">
        <Textarea id="vote-result-text" rows={4} maxLength={RESULT_MAX} value={text} placeholder="e.g. 18 of 30 flats are interested. The committee will get quotes and share them at the next meeting." onChange={(e) => (setText(e.target.value), setError(null))} invalid={Boolean(error)} />
      </Field>
      <div className="flex justify-end gap-2">
        {published && (
          <Button variant="secondary" size="xs" onClick={() => (setEditing(false), setText(poll.result || ''), setError(null))} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="xs" icon="fa-solid fa-bullhorn" loading={busy} data-testid="result-publish">
          {published ? 'Save result' : 'Publish result'}
        </Button>
      </div>
    </form>
  );
}

function VoteDetail({ id, onClose, onChanged }) {
  const toast = useToast();
  const now = useNow();
  const q = useQuery(() => (id ? api.get(`/society/polls/${id}`) : Promise.resolve(null)), [id]);
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(null); // 'end' | 'delete'
  useEffect(() => setSearch(''), [id]);
  const poll = q.data;
  const refresh = () => (q.reload(), onChanged());
  const [endNow, ending] = useAction(
    async () => {
      try {
        return await api.post(`/society/polls/${id}/close`);
      } finally {
        setConfirm(null);
        refresh();
      }
    },
    { toast, success: 'Vote ended — you can publish the result now' },
  );
  const [remove, removing] = useAction(
    async () => {
      try {
        return await api.del(`/society/polls/${id}`);
      } catch (err) {
        setConfirm(null);
        refresh();
        throw err;
      }
    },
    { toast, success: 'Vote deleted', onDone: () => (setConfirm(null), onChanged(), onClose()) },
  );
  const busy = ending || removing;
  const ended = poll ? isEnded(poll, now) : false;
  const voters = filterVoters(poll?.votes, search);
  const exportCsv = () => {
    saveBlob(new Blob([String.fromCharCode(0xfeff), votersCsv(poll.votes)], { type: 'text/csv;charset=utf-8' }), csvFileName(poll.question));
    toast.success('Voter list downloaded');
  };
  const columns = [
    { key: 'name', header: 'Member', className: 'whitespace-normal break-words', render: (v) => <span className="font-medium text-gray-800">{v.name}</span> },
    { key: 'flat', header: 'Flat', render: (v) => v.flat || '—' },
    { key: 'option', header: 'Voted', className: 'whitespace-normal', render: (v) => <Badge tone="purple">{v.optionLabel}</Badge> },
    { key: 'time', header: 'When (IST)', render: (v) => <span title={formatDateTime(v.votedAt)}>{formatDateTime(v.votedAt)}</span> },
  ];

  return (
    <>
      <Drawer
        open={Boolean(id)}
        onClose={onClose}
        busy={busy}
        width="max-w-2xl"
        title="Vote details"
        subtitle={poll ? `Created ${formatDateTime(poll.createdAt)}${poll.createdBy?.name ? ` by ${poll.createdBy.name}` : ''}` : ' '}
        footer={
          poll && (
            <>
              {poll.totalVotes === 0 && (
                <Button variant="danger-outline" icon="fa-regular fa-trash-can" onClick={() => setConfirm('delete')} disabled={busy} data-testid="vote-delete">
                  Delete
                </Button>
              )}
              {!ended && (
                <Button variant="danger" icon="fa-solid fa-flag-checkered" onClick={() => setConfirm('end')} disabled={busy} data-testid="vote-end">
                  End now
                </Button>
              )}
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Close
              </Button>
            </>
          )
        }
      >
        {q.loading && !poll ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : q.error && !poll ? (
          <ErrorState error={q.error} onRetry={q.reload} compact />
        ) : poll ? (
          <div className={cx('space-y-5', q.reloading && 'opacity-60')} data-testid="vote-detail">
            <div>
              <StatusBadges poll={poll} now={now} />
              <h3 className="mt-2 break-words text-base font-bold leading-snug text-gray-800">{poll.question}</h3>
              {poll.description && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-500">{poll.description}</p>}
              <p className={cx('mt-2 flex items-center gap-2 text-[11px]', ended ? 'text-gray-400' : 'text-amber-600')}>
                <Icon name={ended ? 'fa-regular fa-calendar-check' : 'fa-regular fa-clock'} />
                {timingText(poll, now)}
                {ended && poll.closedBy?.name ? ` · ended by ${poll.closedBy.name}` : ''}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                ['Votes', formatNumber(poll.totalVotes || 0)],
                ['Members who can vote', formatNumber(poll.eligibleVoters || 0)],
                ['Turnout', formatPercent(poll.turnoutPercent)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-gray-100 p-3">
                  <p className="text-[10px] font-bold uppercase leading-tight tracking-wider text-gray-400">{k}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-gray-800">{v}</p>
                </div>
              ))}
            </div>

            <section className="rounded-xl border border-gray-100 p-4">
              <OptionBars poll={poll} />
              <div className="mt-4 border-t border-gray-50 pt-3">
                <Turnout poll={poll} />
              </div>
            </section>

            <ResultSection poll={poll} ended={ended} onSaved={refresh} />

            <section className="rounded-xl border border-gray-100">
              <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-bold text-gray-800">
                  Who voted <span className="font-medium text-gray-400">({formatNumber(poll.votes?.length || 0)})</span>
                </p>
                <div className="flex items-center gap-2">
                  <SearchInput value={search} onChange={setSearch} placeholder="Search name or flat" className="w-full sm:w-52" />
                  <Button variant="outline" icon="fa-solid fa-file-csv" onClick={exportCsv} disabledReason={poll.votes?.length ? undefined : 'Nobody has voted yet'} data-testid="voters-csv">
                    CSV
                  </Button>
                </div>
              </div>
              <DataTable
                testId="voters-table"
                columns={columns}
                rows={voters}
                maxHeight="max-h-[50vh]"
                empty={<EmptyState compact icon="fa-solid fa-user-check" title={poll.votes?.length ? 'No voter matches your search' : 'Nobody has voted yet'} message={poll.votes?.length ? 'Try a different name or flat number.' : 'Members vote from the Nivasa app. Their names appear here as they vote.'} />}
              />
              <p className="border-t border-gray-50 px-4 py-2 text-[10px] text-gray-400">Members’ names are personal data — shown only to society staff, never to other members.</p>
            </section>

            {poll.totalVotes > 0 && (
              <p className="flex items-start gap-2 text-[11px] text-gray-400" data-testid="delete-explained">
                <Icon name="fa-solid fa-circle-info" className="mt-0.5" />
                Members have voted, so this vote can’t be deleted — it stays for the records.{!ended ? ' End it instead.' : ''}
              </p>
            )}
          </div>
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={confirm === 'end'}
        onClose={() => setConfirm(null)}
        onConfirm={() => endNow()}
        busy={ending}
        title="End this vote now?"
        confirmLabel="End now"
        message="Members can’t vote any more and the final ratio is fixed. You can then publish the result."
      />
      <ConfirmDialog open={confirm === 'delete'} onClose={() => setConfirm(null)} onConfirm={() => remove()} busy={removing} title="Delete this vote?" confirmLabel="Delete" message="Nobody has voted yet, so it is removed for everyone. This can’t be undone." />
    </>
  );
}

export default function Voting() {
  const [params, setParams] = useSearchParams();
  const status = TABS.some((t) => t.value === params.get('status')) ? params.get('status') : 'open';
  const openId = params.get('vote');
  const now = useNow();
  const [creating, setCreating] = useState(false);
  const q = usePaged((p) => api.get('/society/polls', { ...p, status: status === 'all' ? undefined : status, sort: '-createdAt' }), { status }, 10);
  const setParam = (k, v) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v) next.set(k, v);
        else next.delete(k);
        return next;
      },
      { replace: k === 'vote' && !v },
    );
  const newButton = (
    <Button icon="fa-solid fa-plus" onClick={() => setCreating(true)} data-testid="new-vote">
      New vote
    </Button>
  );
  const emptyCopy = {
    open: ['No open votes', 'Ask members a question — for example whether they are interested in solar panels or a new gym.'],
    ended: ['No ended votes yet', 'Votes appear here when you end them or their close time passes.'],
    all: ['No votes yet', 'Create the first vote. Members answer once from the Nivasa app.'],
  }[status];

  return (
    <div>
      <PageHeader title="Voting" subtitle="Ask members a question, watch the ratio and who voted, then publish the result" actions={newButton} />
      <Tabs className="mb-4" tabs={TABS} value={status} onChange={(v) => setParam('status', v)} />
      {q.loading && !q.data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading votes">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : q.error && !q.data ? (
        <div className="card">
          <ErrorState error={q.error} onRetry={q.reload} />
        </div>
      ) : !q.data.items.length ? (
        <div className="card">
          <EmptyState icon="fa-solid fa-square-poll-vertical" title={emptyCopy[0]} message={emptyCopy[1]} action={status !== 'ended' ? newButton : undefined} />
        </div>
      ) : (
        <>
          <div className={cx('grid grid-cols-1 gap-4 lg:grid-cols-2', q.reloading && 'opacity-60')}>
            {q.data.items.map((p) => (
              <VoteCard key={p._id} poll={p} now={now} onOpen={(id) => setParam('vote', id)} />
            ))}
          </div>
          <div className="card mt-4">
            <Pagination page={q.page} pages={q.data.pages} total={q.data.total} limit={q.limit} onPage={q.setPage} />
          </div>
        </>
      )}
      <NewVoteModal open={creating} onClose={() => setCreating(false)} onCreated={(p) => (q.reload(), p?._id && setParam('vote', p._id))} />
      <VoteDetail id={openId} onClose={() => setParam('vote', null)} onChanged={q.reload} />
    </div>
  );
}
