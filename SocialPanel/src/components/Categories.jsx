import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAction, useQuery } from '../lib/hooks.js';
import { humanize } from '../lib/format.js';
import { intRange, maxLen, minLen, req, runRules } from '../lib/validation.js';
import { Badge, Button, EmptyState, PageHeader, Tabs } from './ui.jsx';
import { DataTable, Toolbar } from './DataTable.jsx';
import { Field, Input, Textarea, Toggle } from './Form.jsx';
import { Modal } from './Modal.jsx';
import { useToast } from './Toast.jsx';

function CategoryModal({ open, onClose, item, kind, basePath, platform, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({ name: item?.name || '', icon: item?.icon || '', description: item?.description || '', active: item ? item.active !== false : true, sortOrder: String(item?.sortOrder ?? 0) });
      setErrors({});
    }
  }, [open, item]);
  const [save, busy] = useAction(
    () => {
      const body = { kind, name: v.name.trim(), icon: v.icon.trim() || undefined, description: v.description.trim() || undefined, active: v.active, sortOrder: Number(v.sortOrder || 0) };
      return item ? api.patch(`${basePath}/${item._id}`, body) : api.post(basePath, body);
    },
    { toast, success: item ? 'Category updated' : 'Category added', onDone: () => (onSaved(), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, { name: [req('Enter a name'), minLen(2), maxLen(80)], icon: [maxLen(60)], description: [maxLen(300)], sortOrder: [intRange(0, 1000)] });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} title={item ? 'Edit category' : `Add ${kind} category`} icon="fa-solid fa-tags" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy}>{item ? 'Save' : 'Add category'}</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name}>
            <Input name="name" value={v.name || ''} onChange={set('name')} invalid={Boolean(errors.name)} />
          </Field>
          <Field label="Icon name" error={errors.icon} hint="Optional hint used by the app">
            <Input name="icon" value={v.icon || ''} onChange={set('icon')} invalid={Boolean(errors.icon)} placeholder="e.g. water, flash, leaf" />
          </Field>
        </div>
        <Field label="Description" error={errors.description}>
          <Textarea name="description" rows={2} value={v.description || ''} onChange={set('description')} />
        </Field>
        {platform && (
          <Field label="Sort order" error={errors.sortOrder} hint="Lower numbers appear first" className="sm:w-1/2">
            <Input name="sortOrder" inputMode="numeric" value={v.sortOrder ?? ''} onChange={set('sortOrder')} invalid={Boolean(errors.sortOrder)} />
          </Field>
        )}
        <Toggle label="Active" description="Inactive categories are hidden from residents." checked={v.active} onChange={(x) => setV({ ...v, active: x })} />
      </form>
    </Modal>
  );
}

/** Category CRUD — platform (all kinds) or society (complaint/service, society-scoped only). */
export function CategoriesManager({ platform = false, writeReason }) {
  const kinds = platform ? ['complaint', 'service', 'marketplace'] : ['complaint', 'service'];
  const basePath = platform ? '/platform/categories' : '/society/categories';
  const [kind, setKind] = useState('complaint');
  const q = useQuery(() => api.get(basePath, { kind }), [kind]);
  const [modal, setModal] = useState(null);
  const columns = [
    { key: 'name', header: 'Name', render: (c) => <span className="font-semibold text-gray-700">{c.name}</span> },
    { key: 'icon', header: 'Icon', render: (c) => c.icon || '—' },
    { key: 'desc', header: 'Description', className: 'max-w-[280px] truncate', render: (c) => c.description || '—' },
    ...(platform ? [{ key: 'sort', header: 'Order', align: 'center', render: (c) => c.sortOrder ?? 0 }] : [{ key: 'scope', header: 'Source', render: (c) => <Badge tone={c.scope === 'society' ? 'purple' : 'neutral'}>{c.scope === 'society' ? 'Your society' : 'adda default'}</Badge> }]),
    { key: 'active', header: 'Status', render: (c) => <Badge status={c.active === false ? 'inactive' : 'active'} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => <Button size="xs" variant="secondary" icon="fa-regular fa-pen-to-square" disabledReason={writeReason || (!platform && c.scope !== 'society' ? 'Default categories are managed by the adda team' : null)} onClick={() => setModal({ item: c })}>Edit</Button>,
    },
  ];
  return (
    <div>
      <PageHeader title="Categories" subtitle={platform ? 'Default categories offered to every society and the marketplace' : 'Complaint and service categories residents choose from — add your own alongside the adda defaults'} actions={<Button icon="fa-solid fa-plus" disabledReason={writeReason} onClick={() => setModal({})} data-testid="add-category">Add category</Button>} />
      <Tabs className="mb-4" tabs={kinds.map((k) => ({ value: k, label: humanize(k) }))} value={kind} onChange={setKind} />
      <div className="card">
        <Toolbar right={q.data && <span className="text-[11px] text-azea-muted">{q.data.items.length} categories</span>}>
          <p className="text-xs text-gray-500">{kind === 'marketplace' ? 'Used to classify marketplace listings.' : kind === 'service' ? 'Shown when residents request a service.' : 'Shown when residents raise a complaint.'}</p>
        </Toolbar>
        <DataTable columns={columns} rows={q.data?.items} loading={q.loading} error={q.error} onRetry={q.reload} dim={q.reloading} empty={<EmptyState compact icon="fa-solid fa-tags" title="No categories yet" />} />
      </div>
      <CategoryModal open={Boolean(modal)} item={modal?.item} kind={kind} basePath={basePath} platform={platform} onClose={() => setModal(null)} onSaved={q.reload} />
    </div>
  );
}
