import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction, usePaged, useQuery } from '../../lib/hooks.js';
import { formatDate, formatINR, humanize, rupeesToPaise, todayIST, plural } from '../../lib/format.js';
import { LEDGER_TYPES } from '../../lib/finance.js';
import { amountRule, maxLen, minLen, req, runRules } from '../../lib/validation.js';
import { noPermissionReason } from '../../lib/roles.js';
import { Alert, Badge, Button, cx, EmptyState, PageHeader } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Field, Input, Select, Textarea } from '../../components/Form.jsx';
import { Modal, ReasonDialog } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';

const REVERSIBLE = ['adjustment', 'other_income', 'opening'];

function OpeningModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({ amount: '', sign: 'credit', asOf: todayIST(), account: 'bank' });
      setErrors({});
    }
  }, [open]);
  const [save, busy] = useAction(() => {
    const p = rupeesToPaise(v.amount);
    return api.post('/society/ledger/opening-balance', { amountPaise: v.sign === 'debit' ? -p : p, asOf: v.asOf, account: v.account });
  }, { toast, success: 'Opening balance recorded', onDone: () => (onSaved(), onClose()) });
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, { amount: [req('Enter the balance'), amountRule('Enter a positive amount in rupees')], asOf: [req('Pick the date')] });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Opening balance" subtitle="Can be recorded only once" icon="fa-solid fa-flag-checkered" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy}>Record opening balance</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Alert tone="warning">Enter the society’s balance on the day you start using adda. It can’t be edited later — corrections are made with adjustments.</Alert>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Balance" required error={errors.amount}>
            <Input name="amount" prefix="₹" inputMode="decimal" value={v.amount || ''} onChange={set('amount')} invalid={Boolean(errors.amount)} />
          </Field>
          <Field label="Type">
            <Select name="sign" value={v.sign || 'credit'} onChange={set('sign')}>
              <option value="credit">In funds (positive)</option>
              <option value="debit">Overdrawn (negative)</option>
            </Select>
          </Field>
          <Field label="As of" required error={errors.asOf}>
            <Input type="date" name="asOf" max={todayIST()} value={v.asOf || ''} onChange={set('asOf')} invalid={Boolean(errors.asOf)} />
          </Field>
          <Field label="Account">
            <Select name="account" value={v.account || 'bank'} onChange={set('account')}>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function AdjustmentModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({ direction: 'debit', amount: '', account: 'bank', category: '', memo: '', date: todayIST() });
      setErrors({});
    }
  }, [open]);
  const [save, busy] = useAction(() => api.post('/society/ledger/adjustments', { direction: v.direction, amountPaise: rupeesToPaise(v.amount), account: v.account, category: v.category.trim(), memo: v.memo.trim(), date: v.date || undefined }), { toast, success: 'Adjustment posted', onDone: () => (onSaved(), onClose()) });
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, { amount: [req('Enter the amount'), amountRule()], category: [req('Enter a category'), minLen(2), maxLen(60)], memo: [req('Explain the adjustment'), minLen(5, 'At least 5 characters'), maxLen(500)] });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Ledger adjustment" subtitle="Bank charges, interest, corrections" icon="fa-solid fa-scale-balanced" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy}>Post adjustment</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Direction">
            <Select name="direction" value={v.direction || 'debit'} onChange={set('direction')}>
              <option value="debit">Debit (money out)</option>
              <option value="credit">Credit (money in)</option>
            </Select>
          </Field>
          <Field label="Amount" required error={errors.amount}>
            <Input name="amount" prefix="₹" inputMode="decimal" value={v.amount || ''} onChange={set('amount')} invalid={Boolean(errors.amount)} />
          </Field>
          <Field label="Account">
            <Select name="account" value={v.account || 'bank'} onChange={set('account')}>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="gateway">Gateway</option>
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" name="date" max={todayIST()} value={v.date || ''} onChange={set('date')} />
          </Field>
        </div>
        <Field label="Category" required error={errors.category}>
          <Input name="category" value={v.category || ''} onChange={set('category')} invalid={Boolean(errors.category)} placeholder="e.g. Bank charges" />
        </Field>
        <Field label="Memo" required error={errors.memo}>
          <Textarea name="memo" rows={2} maxLength={500} value={v.memo || ''} onChange={set('memo')} invalid={Boolean(errors.memo)} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Ledger() {
  const { can, role } = useAuth();
  const toast = useToast();
  const reason = can('finance') ? null : noPermissionReason(role);
  const [entryType, setEntryType] = useState('');
  const [account, setAccount] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = usePaged((p) => api.get('/society/ledger', p), { entryType, account, from, to }, 25);
  const opening = useQuery(() => api.get('/society/ledger', { entryType: 'opening', limit: 1 }), []);
  const hasOpening = (opening.data?.total || 0) > 0;
  const [modal, setModal] = useState(null);
  const [reverse, reversing] = useAction((r) => api.post(`/society/ledger/${modal.item._id}/reverse`, { reason: r }), { toast, success: 'Entry reversed', onDone: () => (setModal(null), list.reload(), opening.reload()) });
  const reload = () => (list.reload(), opening.reload());
  // Reversal entries point at the original via `reverses` (the original itself is immutable).
  const reversedIds = new Set((list.data?.items || []).filter((e) => e.reverses).map((e) => String(e.reverses)));
  const columns = [
    { key: 'date', header: 'Date', render: (e) => formatDate(e.date) },
    { key: 'type', header: 'Type', render: (e) => <Badge tone={e.entryType === 'reversal' ? 'neutral' : e.entryType === 'expense' ? 'warning' : e.entryType === 'maintenance_collection' ? 'success' : 'info'}>{LEDGER_TYPES[e.entryType] || humanize(e.entryType)}</Badge> },
    { key: 'cat', header: 'Category', className: 'max-w-[160px] truncate', render: (e) => <span className="font-medium text-gray-700" title={e.category}>{e.category}</span> },
    { key: 'memo', header: 'Memo', className: 'max-w-[200px] truncate', render: (e) => <span title={e.memo}>{e.memo || '—'}</span> },
    { key: 'acct', header: 'Account', render: (e) => humanize(e.account) },
    { key: 'debit', header: 'Debit', align: 'right', render: (e) => (e.direction === 'debit' ? <span className="font-semibold text-rose-500">{formatINR(e.amountPaise)}</span> : '') },
    { key: 'credit', header: 'Credit', align: 'right', render: (e) => (e.direction === 'credit' ? <span className="font-semibold text-emerald-600">{formatINR(e.amountPaise)}</span> : '') },
    { key: 'by', header: 'By', render: (e) => e.createdBy?.name || 'System' },
    { key: 'actions', header: '', align: 'right', render: (e) => (reversedIds.has(String(e._id)) ? <Badge status="reversed" /> : REVERSIBLE.includes(e.entryType) ? <Button size="xs" variant="danger-outline" disabledReason={reason} onClick={() => setModal({ type: 'reverse', item: e })}>Reverse</Button> : null) },
  ];
  return (
    <div>
      <PageHeader
        title="Ledger"
        subtitle="Append-only record of every rupee in and out — corrections are new entries, never edits"
        actions={
          <>
            <Button variant="outline" icon="fa-solid fa-flag-checkered" disabledReason={reason || (hasOpening ? 'An opening balance is already recorded — use an adjustment to correct it' : null)} onClick={() => setModal({ type: 'opening' })}>
              Opening balance
            </Button>
            <Button icon="fa-solid fa-scale-balanced" disabledReason={reason} onClick={() => setModal({ type: 'adjust' })}>
              Adjustment
            </Button>
          </>
        }
      />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'entry', 'entries')}</span>}>
          <Select value={entryType} onChange={(e) => setEntryType(e.target.value)} aria-label="Entry type" className="sm:w-52">
            <option value="">All entry types</option>
            {Object.entries(LEDGER_TYPES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account" className="sm:w-36">
            <option value="">All accounts</option>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
            <option value="gateway">Gateway</option>
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="sm:w-40" />
            <span className="text-xs text-gray-400">to</span>
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="sm:w-40" />
          </div>
          {(entryType || account || from || to) && (
            <Button size="xs" variant="ghost" onClick={() => (setEntryType(''), setAccount(''), setFrom(''), setTo(''))}>
              Clear
            </Button>
          )}
        </Toolbar>
        <DataTable testId="ledger-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} empty={<EmptyState compact icon="fa-solid fa-book" title="No ledger entries" message="Payments, expenses, income and adjustments are posted here automatically." />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
      <p className={cx('mt-3 text-[11px] text-brand-muted')}>Payments and expenses are reversed from their own pages so the linked invoice / expense stays consistent.</p>
      <OpeningModal open={modal?.type === 'opening'} onClose={() => setModal(null)} onSaved={reload} />
      <AdjustmentModal open={modal?.type === 'adjust'} onClose={() => setModal(null)} onSaved={reload} />
      <ReasonDialog open={modal?.type === 'reverse'} onClose={() => setModal(null)} onSubmit={(r) => reverse(r)} busy={reversing} title="Reverse ledger entry" confirmLabel="Reverse" message={`Posts an opposite entry of ${formatINR(modal?.item?.amountPaise)} for “${modal?.item?.category}”.`} />
    </div>
  );
}
