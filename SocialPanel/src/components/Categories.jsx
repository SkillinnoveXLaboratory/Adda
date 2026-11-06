import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAction, useQuery } from '../lib/hooks.js';
import { humanize } from '../lib/format.js';
import { intRange, maxLen, minLen, req, runRules } from '../lib/validation.js';
import { Badge, Button, EmptyState, PageHeader, Tabs } from './ui.jsx';
import { DataTable, Toolbar } from './DataTable.jsx';
import { Field, Input, Textarea, Toggle } from './Form.jsx';
import { ConfirmDialog, Modal } from './Modal.jsx';
import { useToast } from './Toast.jsx';
import { CategoryIcon, IconPicker, resolveIconKey } from './CategoryIcon.jsx';

const KIND_HELP = {
  service: 'Home services (plumbing, electrical, cleaning …). Shown as tiles with these icons in the app’s Home Maintenance screen, in this order.',
  complaint: 'Shown when residents raise a complaint.',
  marketplace: 'Used to classify marketplace listings.',
};

function CategoryModal({ open, onClose, item, kind, basePath, platform, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  const service = kind === 'service';
  useEffect(() => {
    if (open) {
      setV({ name: item?.name || '', icon: service ? (item ? resolveIconKey(item.icon, item.name) : '') : item?.icon || '', description: item?.description || '', active: item ? item.active !== false : true, sortOrder: String(item?.sortOrder ?? 0) });
      setErrors({});
    }
  }, [open, item, service]);
  const [save, busy] = useAction(
    () => {
      const body = { kind, name: v.name.trim(), description: v.description.trim() || undefined, active: v.active, sortOrder: Number(v.sortOrder || 0), ...(service && { icon: v.icon }) };
      return item ? api.patch(`${basePath}/${item._id}`, body) : api.post(basePath, body);
    },
    { toast, success: item ? 'Category updated' : 'Category added', onDone: () => (onSaved(), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, { name: [req('Enter a name'), minLen(2), maxLen(80)], description: [maxLen(300)], sortOrder: [intRange(0, 1000)] });
    if (service && !v.icon) errs.icon = 'Choose an icon';
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} size={service ? 'lg' : undefined} title={item ? 'Edit category' : `Add ${kind} category`} icon="fa-solid fa-tags" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} data-testid="save-category">{item ? 'Save' : 'Add category'}</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Name" required error={errors.name}>
            <Input name="name" value={v.name || ''} onChange={set('name')} invalid={Boolean(errors.name)} placeholder={service ? 'e.g. Plumbing' : undefined} />
          </Field>
          {service ? (
            <div className="flex flex-col items-center justify-end">
              <span className="mb-1 text-[11px] font-semibold text-gray-500">App preview</span>
              <div className="flex h-[78px] w-[92px] flex-col items-center justify-center gap-1 rounded-2xl border border-[#eef2f7] bg-white shadow-sm" data-testid="tile-preview">
                <CategoryIcon icon={v.icon || 'others'} size={30} />
                <span className="line-clamp-2 px-1 text-center text-[10px] font-bold leading-tight text-[#07162c]">{v.name || 'Name'}</span>
              </div>
            </div>
          ) : null}
        </div>
        {service ? (
          <Field label="Icon" required error={errors.icon} hint="Two-tone NIVASA icons, drawn exactly like this in the app">
            <IconPicker value={v.icon} name={v.name} onChange={(key) => (setV({ ...v, icon: key }), setErrors((x) => ({ ...x, icon: undefined })))} />
          </Field>
        ) : null}
        <Field label="Description" error={errors.description}>
          <Textarea name="description" rows={2} value={v.description || ''} onChange={set('description')} />
        </Field>
        {platform ? (
          <Field label="Order" error={errors.sortOrder} hint={service ? 'Lower numbers come first. The app shows the first tiles on Home Maintenance (5 + “Others” when there are more than 6).' : 'Lower numbers appear first'} className="sm:w-1/2">
            <Input name="sortOrder" inputMode="numeric" value={v.sortOrder ?? ''} onChange={set('sortOrder')} invalid={Boolean(errors.sortOrder)} />
          </Field>
        ) : null}
        <Toggle label="Active" description="Inactive categories are hidden in the app but stay on existing listings and requests." checked={v.active} onChange={(x) => setV({ ...v, active: x })} />
      </form>
    </Modal>
  );
}

/** Category CRUD — platform (all kinds) or society (complaint/service, society-scoped only). */
export function CategoriesManager({ platform = false, writeReason }) {
  const kinds = platform ? ['service', 'complaint', 'marketplace'] : ['complaint', 'service'];
  const basePath = platform ? '/platform/categories' : '/society/categories';
  const toast = useToast();
  const [kind, setKind] = useState(kinds[0]);
  const q = useQuery(() => api.get(basePath, { kind }), [kind]);
  const [modal, setModal] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [remove, removeBusy] = useAction(() => api.del(`${basePath}/${removing._id}`), { toast, success: 'Category deleted', onDone: () => (setRemoving(null), q.reload()) });
  const editable = (c) => platform || c.scope === 'society';
  const lockedReason = (c) => writeReason || (!editable(c) ? 'Default categories are managed by the NIVASA team' : null);

  const columns = [
    ...(kind === 'service' ? [{ key: 'icon', header: '', className: 'w-12', render: (c) => <CategoryIcon icon={c.icon} name={c.name} size={28} /> }] : []),
    { key: 'name', header: 'Name', render: (c) => <span className="font-semibold text-gray-700">{c.name}</span> },
    { key: 'desc', header: 'Description', className: 'max-w-[280px] truncate', render: (c) => c.description || '—' },
    ...(platform ? [{ key: 'sort', header: 'Order', align: 'center', render: (c) => c.sortOrder ?? 0 }] : [{ key: 'scope', header: 'Source', render: (c) => <Badge tone={c.scope === 'society' ? 'purple' : 'neutral'}>{c.scope === 'society' ? 'Your society' : 'NIVASA default'}</Badge> }]),
    { key: 'active', header: 'Status', render: (c) => <Badge status={c.active === false ? 'inactive' : 'active'} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-1.5">
          <Button size="xs" variant="secondary" icon="fa-regular fa-pen-to-square" disabledReason={lockedReason(c)} onClick={() => setModal({ item: c })}>Edit</Button>
          <Button size="xs" variant="danger" icon="fa-regular fa-trash-can" disabledReason={lockedReason(c)} onClick={() => setRemoving(c)} data-testid={`delete-category-${c._id}`}>Delete</Button>
        </div>
      ),
    },
  ];
  return (
    <div>
      <PageHeader title="Categories" subtitle={platform ? 'Categories for home services, complaints and the marketplace' : 'Complaint and service categories residents choose from — add your own alongside the NIVASA defaults'} actions={<Button icon="fa-solid fa-plus" disabledReason={writeReason} onClick={() => setModal({})} data-testid="add-category">Add category</Button>} />
      <Tabs className="mb-4" tabs={kinds.map((k) => ({ value: k, label: humanize(k) }))} value={kind} onChange={setKind} />
      <div className="card">
        <Toolbar right={q.data && <span className="text-[11px] text-azea-muted">{q.data.items.length} categories</span>}>
          <p className="text-xs text-gray-500">{KIND_HELP[kind]}</p>
        </Toolbar>
        <DataTable columns={columns} rows={q.data?.items} loading={q.loading} error={q.error} onRetry={q.reload} dim={q.reloading} empty={<EmptyState compact icon="fa-solid fa-tags" title="No categories yet" />} />
      </div>
      <CategoryModal open={Boolean(modal)} item={modal?.item} kind={kind} basePath={basePath} platform={platform} onClose={() => setModal(null)} onSaved={q.reload} />
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        busy={removeBusy}
        title={`Delete “${removing?.name || ''}”?`}
        message="It disappears from the app. A category that is already used by listings or requests can’t be deleted — turn off “Active” to hide it instead."
        confirmLabel="Delete category"
        icon="fa-regular fa-trash-can"
      />
    </div>
  );
}
