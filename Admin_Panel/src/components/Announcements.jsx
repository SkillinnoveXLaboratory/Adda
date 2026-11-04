import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../lib/api.js';
import { useAction, usePaged } from '../lib/hooks.js';
import { formatDate, formatDateTime, humanize, istDateTimeISO } from '../lib/format.js';
import { maxLen, minLen, req, runRules } from '../lib/validation.js';
import { Badge, Button, cx, EmptyState, ErrorState, Icon, PageHeader, Skeleton, Tabs } from './ui.jsx';
import { Pagination } from './DataTable.jsx';
import { Field, FileUploader, Input, Select, Textarea, Toggle } from './Form.jsx';
import { ConfirmDialog, Modal } from './Modal.jsx';
import { useToast } from './Toast.jsx';

export const ANNOUNCEMENT_CATEGORIES = ['general', 'maintenance', 'meeting', 'event', 'finance', 'security', 'emergency'];
const CAT_ICON = { general: 'fa-solid fa-bullhorn', maintenance: 'fa-solid fa-screwdriver-wrench', meeting: 'fa-solid fa-people-group', event: 'fa-solid fa-champagne-glasses', finance: 'fa-solid fa-indian-rupee-sign', security: 'fa-solid fa-shield-halved', emergency: 'fa-solid fa-triangle-exclamation' };
const CAT_TONE = { general: 'bg-brand-light text-brand', maintenance: 'bg-amber-50 text-amber-500', meeting: 'bg-blue-50 text-blue-500', event: 'bg-pink-50 text-pink-500', finance: 'bg-emerald-50 text-emerald-500', security: 'bg-gray-100 text-gray-600', emergency: 'bg-rose-50 text-rose-500' };

/** IST date + time parts from an ISO datetime, for <input type=date|time>. */
const istParts = (iso) => {
  if (!iso) return ['', ''];
  const d = new Date(new Date(iso).getTime() + 330 * 60000).toISOString();
  return [d.slice(0, 10), d.slice(11, 16)];
};

function AnnouncementModal({ open, onClose, item, basePath, attachments: allowAttachments, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      const [date, time] = istParts(item?.eventDate);
      setV({ title: item?.title || '', body: item?.body || '', category: item?.category || 'general', important: Boolean(item?.important), eventDateOn: Boolean(item?.eventDate), date, time: time || '18:00', files: [] });
      setErrors({});
    }
  }, [open, item]);
  const [save, busy] = useAction(
    () => {
      const body = {
        title: v.title.trim(),
        body: v.body.trim(),
        category: v.category,
        important: v.important,
        eventDate: v.eventDateOn && v.date ? istDateTimeISO(v.date, v.time || '09:00') : undefined,
      };
      // Only send attachments when files were added (sending existing ids would fail if another staff member uploaded them).
      if (allowAttachments && (!item || v.files.length)) body.attachments = [...(item?.attachments || []).map((a) => a._id || a), ...v.files.map((f) => f._id)];
      return item ? api.patch(`${basePath}/${item._id}`, body) : api.post(basePath, body);
    },
    { toast, success: item ? 'Notice updated' : 'Notice published', onDone: () => (onSaved(), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, { title: [req('Enter a title'), minLen(3), maxLen(160)], body: [req('Write the notice'), minLen(5), maxLen(8000)], date: v.eventDateOn ? [req('Pick the event date')] : [] });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} size="lg" title={item ? 'Edit notice' : 'New notice'} subtitle={item ? undefined : 'Published immediately and sent as a notification'} icon="fa-solid fa-bullhorn" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} icon={item ? undefined : 'fa-regular fa-paper-plane'} data-testid="announcement-submit">{item ? 'Save changes' : 'Publish'}</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Title" required error={errors.title} className="sm:col-span-2">
            <Input name="title" value={v.title || ''} maxLength={160} onChange={set('title')} invalid={Boolean(errors.title)} placeholder="e.g. Water supply interruption on Sunday" />
          </Field>
          <Field label="Category">
            <Select name="category" value={v.category || 'general'} onChange={set('category')}>
              {ANNOUNCEMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Message" required error={errors.body} hint={`${(v.body || '').length}/8000`}>
          <Textarea name="body" rows={6} maxLength={8000} value={v.body || ''} onChange={set('body')} invalid={Boolean(errors.body)} />
        </Field>
        <Toggle label="Mark as important" description="Highlighted for residents and sent with an “Important” prefix." checked={v.important} onChange={(x) => setV({ ...v, important: x })} />
        <div className="rounded-xl border border-gray-100 p-4">
          <Toggle label="Has an event date" description="Show a date for meetings and events." checked={v.eventDateOn} onChange={(x) => setV({ ...v, eventDateOn: x })} />
          {v.eventDateOn && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Date" error={errors.date}>
                <Input type="date" name="date" value={v.date || ''} onChange={set('date')} invalid={Boolean(errors.date)} />
              </Field>
              <Field label="Time (IST)">
                <Input type="time" name="time" value={v.time || ''} onChange={set('time')} />
              </Field>
            </div>
          )}
        </div>
        {allowAttachments && (
          <div>
            <p className="form-label">Attachments</p>
            {item?.attachments?.length > 0 && <p className="mb-2 text-[11px] text-brand-muted">{item.attachments.length} existing attachment(s) are kept.</p>}
            <FileUploader files={v.files || []} onChange={(files) => setV((x) => ({ ...x, files }))} max={6 - (item?.attachments?.length || 0)} onUpload={(file) => api.upload('/uploads', file, { purpose: 'announcement' })} />
          </div>
        )}
      </form>
    </Modal>
  );
}

/**
 * Notices list for society (`/society/announcements`) and platform (`/platform/announcements`).
 * Edit exists only for society notices (the platform API has no PATCH).
 */
export function AnnouncementsManager({ basePath, title, subtitle, canWrite, writeReason, allowEdit, allowAttachments, emptyMessage, statusTabs = true }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(statusTabs ? 'published' : '');
  const list = usePaged((p) => api.get(basePath, { ...p, sort: '-createdAt' }), { status }, 12);
  const [modal, setModal] = useState(params.get('new') === '1' && canWrite ? { type: 'edit' } : null);
  const [archive, archiving] = useAction(() => api.post(`${basePath}/${modal.item._id}/archive`), { toast, success: 'Notice archived', onDone: () => (setModal(null), list.reload()) });

  const close = () => {
    setModal(null);
    if (params.get('new')) setParams({});
  };

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} actions={<Button icon="fa-solid fa-plus" disabledReason={writeReason} onClick={() => setModal({ type: 'edit' })} data-testid="new-announcement">New notice</Button>} />
      {statusTabs && <Tabs
        className="mb-4"
        tabs={[
          { value: 'published', label: 'Published', icon: 'fa-regular fa-circle-check' },
          { value: 'archived', label: 'Archived', icon: 'fa-solid fa-box-archive' },
        ]}
        value={status}
        onChange={setStatus}
      />}
      {list.loading && !list.data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : list.error && !list.data ? (
        <div className="card">
          <ErrorState error={list.error} onRetry={list.reload} />
        </div>
      ) : !list.data.items.length ? (
        <div className="card">
          <EmptyState icon="fa-solid fa-bullhorn" title={status === 'archived' ? 'No archived notices' : 'No notices yet'} message={status === 'archived' ? 'Archived notices are kept here for reference.' : emptyMessage} action={status !== 'archived' && canWrite && <Button icon="fa-solid fa-plus" onClick={() => setModal({ type: 'edit' })}>New notice</Button>} />
        </div>
      ) : (
        <>
          <div className={cx('grid grid-cols-1 gap-4 lg:grid-cols-2', list.reloading && 'opacity-60')} data-testid="announcements-list">
            {list.data.items.map((a) => (
              <article key={a._id} className="card flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', CAT_TONE[a.category] || CAT_TONE.general)}>
                    <Icon name={CAT_ICON[a.category] || CAT_ICON.general} className="text-sm" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="mr-1 text-sm font-bold text-gray-800">{a.title}</h3>
                      {a.important && <Badge tone="danger">Important</Badge>}
                      {a.status === 'archived' && <Badge status="archived" />}
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {humanize(a.category)} · {formatDateTime(a.createdAt)}
                      {a.createdBy?.name ? ` · ${a.createdBy.name}` : ''}
                    </p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-4 flex-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-600">{a.body}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-50 pt-3">
                  <span className="text-[11px] text-gray-400">
                    {a.eventDate && (
                      <>
                        <Icon name="fa-regular fa-calendar" className="mr-1" />
                        Event {formatDateTime(a.eventDate)}
                      </>
                    )}
                    {a.attachments?.length > 0 && (
                      <span className="ml-2">
                        <Icon name="fa-solid fa-paperclip" className="mr-1" />
                        {a.attachments.length}
                      </span>
                    )}
                    {!a.eventDate && !a.attachments?.length && `Posted ${formatDate(a.createdAt)}`}
                  </span>
                  {a.status === 'published' && (
                    <div className="flex gap-2">
                      {allowEdit && (
                        <Button size="xs" variant="secondary" icon="fa-regular fa-pen-to-square" disabledReason={writeReason} onClick={() => setModal({ type: 'edit', item: a })}>
                          Edit
                        </Button>
                      )}
                      <Button size="xs" variant="danger-outline" icon="fa-solid fa-box-archive" disabledReason={writeReason} onClick={() => setModal({ type: 'archive', item: a })}>
                        Archive
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="card mt-4">
            <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />
          </div>
        </>
      )}
      <AnnouncementModal open={modal?.type === 'edit'} item={modal?.item} basePath={basePath} attachments={allowAttachments} onClose={close} onSaved={list.reload} />
      <ConfirmDialog open={modal?.type === 'archive'} onClose={() => setModal(null)} onConfirm={() => archive()} busy={archiving} title="Archive notice" confirmLabel="Archive" message={`“${modal?.item?.title}” will be hidden from residents. Archived notices stay in the Archived tab.`} />
    </div>
  );
}
