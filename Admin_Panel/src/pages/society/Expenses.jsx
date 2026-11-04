import { useEffect, useState } from 'react';
import { api, mediaHref } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction, useDebounced, usePaged } from '../../lib/hooks.js';
import { formatDate, formatINR, humanize, plural, rupeesToPaise, todayIST } from '../../lib/format.js';
import { amountRule, maxLen, minLen, req, runRules } from '../../lib/validation.js';
import { noPermissionReason } from '../../lib/roles.js';
import { Button, EmptyState, Icon, PageHeader, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Field, FileUploader, Input, SearchInput, Select, Textarea } from '../../components/Form.jsx';
import { Modal, ReasonDialog } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';

function ExpenseModal({ open, onClose, categories, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({ category: '', vendor: '', description: '', amount: '', paidOn: todayIST(), account: 'bank', referenceNumber: '', files: [] });
      setErrors({});
    }
  }, [open]);
  const [save, busy] = useAction(
    () =>
      api.post('/society/expenses', {
        category: v.category.trim(),
        vendor: v.vendor.trim() || undefined,
        description: v.description.trim() || undefined,
        amountPaise: rupeesToPaise(v.amount),
        paidOn: v.paidOn,
        account: v.account,
        referenceNumber: v.referenceNumber.trim() || undefined,
        attachments: v.files.map((f) => f._id),
      }),
    { toast, success: 'Expense recorded', onDone: () => (onSaved(), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, {
      category: [req('Enter a category'), minLen(2), maxLen(60)],
      amount: [req('Enter the amount'), amountRule()],
      paidOn: [req('Pick the date'), [(x) => x <= todayIST(), 'Can’t be in the future']],
      vendor: [maxLen(120)],
      description: [maxLen(500)],
    });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} size="lg" title="Record expense" subtitle="Posted to the ledger as a debit" icon="fa-solid fa-wallet" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} data-testid="expense-save">Record expense</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category" required error={errors.category}>
            <Input name="category" list="expense-categories" value={v.category || ''} onChange={set('category')} invalid={Boolean(errors.category)} placeholder="e.g. Security, Electricity, Repairs" />
            <datalist id="expense-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Vendor / paid to" error={errors.vendor}>
            <Input name="vendor" value={v.vendor || ''} onChange={set('vendor')} invalid={Boolean(errors.vendor)} />
          </Field>
          <Field label="Amount" required error={errors.amount}>
            <Input name="amount" prefix="₹" inputMode="decimal" value={v.amount || ''} onChange={set('amount')} invalid={Boolean(errors.amount)} />
          </Field>
          <Field label="Paid on" required error={errors.paidOn}>
            <Input type="date" name="paidOn" max={todayIST()} value={v.paidOn || ''} onChange={set('paidOn')} invalid={Boolean(errors.paidOn)} />
          </Field>
          <Field label="Paid from">
            <Select name="account" value={v.account || 'bank'} onChange={set('account')}>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </Select>
          </Field>
          <Field label="Bill / reference no.">
            <Input name="referenceNumber" value={v.referenceNumber || ''} maxLength={100} onChange={set('referenceNumber')} />
          </Field>
        </div>
        <Field label="Description" error={errors.description}>
          <Textarea name="description" rows={2} maxLength={500} value={v.description || ''} onChange={set('description')} />
        </Field>
        <div>
          <p className="form-label">Bill / invoice copy</p>
          <FileUploader files={v.files || []} onChange={(files) => setV((x) => ({ ...x, files }))} onUpload={(file) => api.upload('/uploads', file, { purpose: 'expense' })} />
        </div>
      </form>
    </Modal>
  );
}

function IncomeModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({ category: '', description: '', amount: '', receivedOn: todayIST(), account: 'bank' });
      setErrors({});
    }
  }, [open]);
  const [save, busy] = useAction(() => api.post('/society/income', { category: v.category.trim(), description: v.description.trim() || undefined, amountPaise: rupeesToPaise(v.amount), receivedOn: v.receivedOn, account: v.account }), { toast, success: 'Income recorded', onDone: () => (onSaved(), onClose()) });
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, { category: [req('Enter a category'), minLen(2), maxLen(60)], amount: [req('Enter the amount'), amountRule()], receivedOn: [req('Pick the date'), [(x) => x <= todayIST(), 'Can’t be in the future']] });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Record other income" subtitle="Hall rent, parking, interest, donations…" icon="fa-solid fa-sack-dollar" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy}>Record income</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category" required error={errors.category}>
            <Input name="category" value={v.category || ''} onChange={set('category')} invalid={Boolean(errors.category)} placeholder="e.g. Hall rental" />
          </Field>
          <Field label="Amount" required error={errors.amount}>
            <Input name="amount" prefix="₹" inputMode="decimal" value={v.amount || ''} onChange={set('amount')} invalid={Boolean(errors.amount)} />
          </Field>
          <Field label="Received on" required error={errors.receivedOn}>
            <Input type="date" name="receivedOn" max={todayIST()} value={v.receivedOn || ''} onChange={set('receivedOn')} invalid={Boolean(errors.receivedOn)} />
          </Field>
          <Field label="Received into">
            <Select name="account" value={v.account || 'bank'} onChange={set('account')}>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </Select>
          </Field>
        </div>
        <Field label="Description">
          <Textarea name="description" rows={2} maxLength={500} value={v.description || ''} onChange={set('description')} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Expenses() {
  const { can, role } = useAuth();
  const toast = useToast();
  const reason = can('finance') ? null : noPermissionReason(role);
  const [tab, setTab] = useState('recorded');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const expenses = usePaged((p) => api.get('/society/expenses', p), { status: tab === 'income' ? 'recorded' : tab, q });
  const income = usePaged((p) => api.get('/society/ledger', { ...p, entryType: 'other_income' }), { tab: tab === 'income' });
  const [modal, setModal] = useState(null);
  const [voidIt, voiding] = useAction((r) => api.post(`/society/expenses/${modal.item._id}/void`, { reason: r }), { toast, success: 'Expense voided — a reversing ledger entry was posted', onDone: () => (setModal(null), expenses.reload()) });
  const categories = expenses.data?.categories || [];
  const pageTotal = (expenses.data?.items || []).reduce((s, e) => s + e.amountPaise, 0);

  const expenseCols = [
    { key: 'date', header: 'Paid on', render: (e) => formatDate(e.paidOn) },
    { key: 'cat', header: 'Category', render: (e) => <span className="font-semibold text-gray-700">{e.category}</span> },
    { key: 'vendor', header: 'Vendor', render: (e) => e.vendor || '—' },
    { key: 'desc', header: 'Description', className: 'max-w-[240px] truncate', render: (e) => e.description || '—' },
    { key: 'acct', header: 'Account', render: (e) => humanize(e.account) },
    { key: 'ref', header: 'Reference', render: (e) => e.referenceNumber || '—' },
    { key: 'files', header: 'Bill', render: (e) => (e.attachments?.length ? e.attachments.map((a) => <a key={a._id} href={mediaHref(a.url)} target="_blank" rel="noopener noreferrer" className="mr-2 text-brand hover:text-brand-dark" title={a.originalName} aria-label={`Open ${a.originalName || 'attachment'}`}><Icon name={a.mimeType === 'application/pdf' ? 'fa-regular fa-file-pdf' : 'fa-regular fa-file-image'} /></a>) : <span className="text-gray-300">—</span>) },
    { key: 'amount', header: 'Amount', align: 'right', render: (e) => <span className={tab === 'voided' ? 'text-gray-400 line-through' : 'font-semibold text-gray-800'}>{formatINR(e.amountPaise)}</span> },
    tab === 'voided' ? { key: 'void', header: 'Void reason', className: 'max-w-[200px] truncate', render: (e) => e.voidReason || '—' } : { key: 'by', header: 'Recorded by', render: (e) => e.recordedBy?.name || '—' },
    ...(tab === 'recorded' ? [{ key: 'actions', header: '', align: 'right', render: (e) => <Button size="xs" variant="danger-outline" disabledReason={reason} onClick={() => setModal({ type: 'void', item: e })}>Void</Button> }] : []),
  ];
  const incomeCols = [
    { key: 'date', header: 'Received on', render: (e) => formatDate(e.date) },
    { key: 'cat', header: 'Category', render: (e) => <span className="font-semibold text-gray-700">{e.category}</span> },
    { key: 'memo', header: 'Description', className: 'max-w-[300px] truncate', render: (e) => e.memo || '—' },
    { key: 'acct', header: 'Account', render: (e) => humanize(e.account) },
    { key: 'by', header: 'Recorded by', render: (e) => e.createdBy?.name || '—' },
    { key: 'amount', header: 'Amount', align: 'right', render: (e) => <span className="font-semibold text-emerald-600">{formatINR(e.amountPaise)}</span> },
  ];
  const active = tab === 'income' ? income : expenses;
  return (
    <div>
      <PageHeader
        title="Expenses & income"
        subtitle="Society spending and non-maintenance income — every entry is posted to the ledger"
        actions={
          <>
            <Button variant="outline" icon="fa-solid fa-sack-dollar" disabledReason={reason} onClick={() => setModal({ type: 'income' })}>
              Record income
            </Button>
            <Button icon="fa-solid fa-plus" disabledReason={reason} onClick={() => setModal({ type: 'expense' })} data-testid="add-expense">
              Record expense
            </Button>
          </>
        }
      />
      <Tabs
        className="mb-4"
        tabs={[
          { value: 'recorded', label: 'Expenses', icon: 'fa-solid fa-wallet' },
          { value: 'voided', label: 'Voided', icon: 'fa-solid fa-ban' },
          { value: 'income', label: 'Other income', icon: 'fa-solid fa-sack-dollar' },
        ]}
        value={tab}
        onChange={(v) => (setTab(v), setSearch(''))}
      />
      <div className="card">
        <Toolbar right={active.data && <span className="text-[11px] text-brand-muted">{plural(active.data.total, 'entry', 'entries')}{tab !== 'income' && active.data.items.length ? ` · ${formatINR(pageTotal)} on this page` : ''}</span>}>
          {tab !== 'income' ? <SearchInput value={search} onChange={setSearch} placeholder="Search vendor, category…" className="w-full sm:w-64" /> : <p className="text-xs text-gray-500">Income entries can be reversed from the Ledger if recorded by mistake.</p>}
        </Toolbar>
        <DataTable testId="expenses-table" columns={tab === 'income' ? incomeCols : expenseCols} rows={active.data?.items} loading={active.loading} error={active.error} onRetry={active.reload} dim={active.reloading} empty={<EmptyState compact icon={tab === 'income' ? 'fa-solid fa-sack-dollar' : 'fa-solid fa-wallet'} title={tab === 'income' ? 'No other income recorded' : tab === 'voided' ? 'No voided expenses' : q ? 'No matching expenses' : 'No expenses recorded'} message={tab === 'recorded' && !q ? 'Record bills you pay — security, electricity, repairs — with a copy of the invoice.' : undefined} />} />
        {active.data && <Pagination page={active.page} pages={active.data.pages} total={active.data.total} limit={active.limit} onPage={active.setPage} />}
      </div>
      <ExpenseModal open={modal?.type === 'expense'} categories={categories} onClose={() => setModal(null)} onSaved={expenses.reload} />
      <IncomeModal open={modal?.type === 'income'} onClose={() => setModal(null)} onSaved={() => (income.reload(), setTab('income'))} />
      <ReasonDialog open={modal?.type === 'void'} onClose={() => setModal(null)} onSubmit={(r) => voidIt(r)} busy={voiding} title="Void expense" confirmLabel="Void expense" message={`${modal?.item?.category} · ${formatINR(modal?.item?.amountPaise)}. The record is kept as voided and a reversing ledger entry is posted.`} />
    </div>
  );
}
