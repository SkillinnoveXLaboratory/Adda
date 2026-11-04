import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction, useDebounced, usePaged, useQuery } from '../../lib/hooks.js';
import { currentPeriodIST, formatDate, formatINR, formatNumber, formatPeriod, humanize, paiseToRupeesInput, rupeesToPaise, todayIST, plural } from '../../lib/format.js';
import { amountRule, maxLen, minLen, req, runRules } from '../../lib/validation.js';
import { noPermissionReason } from '../../lib/roles.js';
import { downloadReceipt, newIdempotencyKey } from '../../lib/files.js';
import { Alert, Badge, Button, Card, cx, EmptyState, ErrorState, KeyValue, PageHeader, Skeleton, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Checkbox, Field, Input, PeriodSelect, SearchInput, Select, Textarea, Toggle } from '../../components/Form.jsx';
import { ConfirmDialog, Drawer, Modal, ReasonDialog } from '../../components/Modal.jsx';
import { MetricCard } from '../../components/Charts.jsx';
import { BillingSettingsForm } from '../../components/BillingSettings.jsx';
import { useToast } from '../../components/Toast.jsx';

import { PAYMENT_METHODS } from '../../lib/finance.js';
export { PAYMENT_METHODS };

function GenerateModal({ open, onClose, buildings, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (open) {
      setV({ period: currentPeriodIST(), buildingId: '', dueDate: '' });
      setErrors({});
      setResult(null);
    }
  }, [open]);
  const [run, busy] = useAction(() => api.post('/society/invoices/generate', { period: v.period, buildingId: v.buildingId || undefined, dueDate: v.dueDate || undefined }), {
    toast,
    success: (r) => (r.created ? `${r.created} bills generated for ${formatPeriod(r.period)}` : `No new bills for ${formatPeriod(r.period)}`),
    onDone: (r) => (setResult(r), onDone()),
  });
  const submit = (e) => {
    e?.preventDefault();
    const errs = {};
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v.period || '')) errs.period = 'Choose a billing month';
    if (v.dueDate && v.period && v.dueDate < `${v.period}-01`) errs.dueDate = 'Due date can’t be before the billing month';
    setErrors(errs);
    if (!Object.keys(errs).length) run();
  };
  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Generate maintenance bills" subtitle="One invoice per active flat — flats already billed for the month are skipped" icon="fa-solid fa-file-invoice" footer={result ? <Button onClick={onClose}>Done</Button> : <><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} icon="fa-solid fa-bolt" data-testid="generate-submit">Generate bills</Button></>}>
      {result ? (
        <div className="space-y-4" data-testid="generate-result">
          <p className="text-xs text-gray-600">
            Results for <span className="font-semibold text-gray-800">{formatPeriod(result.period)}</span>:
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Created', result.created, 'text-emerald-600'],
              ['Already billed', result.alreadyBilled, 'text-amber-600'],
              ['Zero amount', result.zeroAmount, 'text-gray-500'],
            ].map(([k, n, c]) => (
              <div key={k} className="rounded-xl bg-azea-bg p-4">
                <p className={cx('text-2xl font-bold', c)} data-testid={`generate-${k.toLowerCase().replace(' ', '-')}`}>
                  {formatNumber(n)}
                </p>
                <p className="text-[11px] text-gray-500">{k}</p>
              </div>
            ))}
          </div>
          {result.zeroAmount > 0 && <Alert tone="warning">{result.zeroAmount} flat(s) had no applicable charge (no charge heads, override or default amount), so no bill was raised.</Alert>}
          {result.created > 0 && <Alert tone="success">Residents of billed flats were notified in the adda app.</Alert>}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Billing month" required error={errors.period}>
              <PeriodSelect name="period" value={v.period || ''} onChange={(p) => (setV({ ...v, period: p }), setErrors({}))} invalid={Boolean(errors.period)} past={12} />
            </Field>
            <Field label="Building">
              <Select name="buildingId" value={v.buildingId || ''} onChange={(e) => setV({ ...v, buildingId: e.target.value })}>
                <option value="">All buildings</option>
                {buildings.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Due date" error={errors.dueDate} hint="Optional — defaults to the due day in billing settings">
            <Input type="date" name="dueDate" value={v.dueDate || ''} onChange={(e) => (setV({ ...v, dueDate: e.target.value }), setErrors({}))} invalid={Boolean(errors.dueDate)} />
          </Field>
          <Alert tone="info">Amounts come from: a flat’s maintenance override → active charge heads → the default monthly amount. Unpaid earlier bills are shown as arrears.</Alert>
        </form>
      )}
    </Modal>
  );
}

function RecordPaymentModal({ open, onClose, invoice, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  const [key, setKey] = useState('');
  useEffect(() => {
    if (open && invoice) {
      setV({ amount: paiseToRupeesInput(invoice.balancePaise), method: 'cash', paidOn: todayIST(), referenceNumber: '', note: '' });
      setErrors({});
      setKey(newIdempotencyKey());
    }
  }, [open, invoice]);
  const [save, busy] = useAction(
    () =>
      api.post(`/society/invoices/${invoice._id}/payments`, {
        amountPaise: rupeesToPaise(v.amount),
        method: v.method,
        paidOn: v.paidOn || undefined,
        referenceNumber: v.referenceNumber.trim() || undefined,
        note: v.note.trim() || undefined,
        idempotencyKey: key,
      }),
    { toast, success: 'Payment recorded and receipt issued', onDone: (p) => (onDone(p), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, {
      amount: [req('Enter the amount received'), amountRule(), [(x) => rupeesToPaise(x) <= invoice.balancePaise, `Can’t exceed the balance of ${formatINR(invoice.balancePaise)}`]],
      paidOn: [req('Pick the date'), [(x) => x <= todayIST(), 'Can’t be in the future']],
      referenceNumber: v.method === 'cheque' || v.method === 'bank_transfer' ? [req(v.method === 'cheque' ? 'Enter the cheque number' : 'Enter the transaction reference'), maxLen(100)] : [maxLen(100)],
    });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Record offline payment" subtitle={invoice ? `${invoice.invoiceNumber} · balance ${formatINR(invoice.balancePaise)}` : ''} icon="fa-solid fa-indian-rupee-sign" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} data-testid="payment-submit">Record payment</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Amount received" required error={errors.amount}>
            <Input name="amount" prefix="₹" inputMode="decimal" value={v.amount ?? ''} onChange={set('amount')} invalid={Boolean(errors.amount)} />
          </Field>
          <Field label="Method">
            <Select name="method" value={v.method || 'cash'} onChange={set('method')}>
              {['cash', 'bank_transfer', 'cheque', 'upi_direct'].map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHODS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Received on" required error={errors.paidOn}>
            <Input type="date" name="paidOn" max={todayIST()} value={v.paidOn || ''} onChange={set('paidOn')} invalid={Boolean(errors.paidOn)} />
          </Field>
          <Field label={v.method === 'cheque' ? 'Cheque number' : 'Reference'} error={errors.referenceNumber}>
            <Input name="referenceNumber" value={v.referenceNumber || ''} onChange={set('referenceNumber')} invalid={Boolean(errors.referenceNumber)} placeholder={v.method === 'upi_direct' ? 'UPI transaction ID' : v.method === 'cash' ? 'Optional' : ''} />
          </Field>
        </div>
        <Field label="Note (optional)">
          <Textarea name="note" rows={2} maxLength={500} value={v.note || ''} onChange={set('note')} />
        </Field>
        <p className="text-[11px] text-azea-muted">A numbered receipt is issued and the amount is posted to the ledger. Mistakes are corrected by reversing the payment, never by editing it.</p>
      </form>
    </Modal>
  );
}

function InvoiceDrawer({ id, onClose, reason, onChanged }) {
  const toast = useToast();
  const q = useQuery(() => (id ? api.get(`/society/invoices/${id}`) : Promise.resolve(null)), [id]);
  const [modal, setModal] = useState(null);
  const inv = q.data;
  const refresh = () => (q.reload(), onChanged());
  const [cancel, cancelling] = useAction((r) => api.post(`/society/invoices/${id}/cancel`, { reason: r }), { toast, success: 'Invoice cancelled', onDone: () => (setModal(null), refresh()) });
  const [reverse, reversing] = useAction((r) => api.post(`/society/payments/${modal.payment._id}/reverse`, { reason: r }), { toast, success: 'Payment reversed', onDone: () => (setModal(null), refresh()) });
  const [downloading, setDownloading] = useState(null);
  const dl = async (p) => {
    setDownloading(p._id);
    try {
      await downloadReceipt(p.receipt);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDownloading(null);
    }
  };
  const livePayments = inv?.payments?.filter((p) => ['captured', 'partially_refunded'].includes(p.status)) || [];
  const open = inv && ['unpaid', 'partially_paid'].includes(inv.status);
  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      title={inv ? inv.invoiceNumber : 'Invoice'}
      subtitle={inv ? `${formatPeriod(inv.period)} · ${[inv.building?.name, inv.flat?.number].filter(Boolean).join(' ')}` : ''}
      footer={
        inv && (
          <>
            <Button variant="danger-outline" icon="fa-solid fa-ban" disabledReason={reason || (inv.status === 'cancelled' ? 'Already cancelled' : livePayments.length ? 'Has payments — reverse them first' : null)} onClick={() => setModal({ type: 'cancel' })}>
              Cancel invoice
            </Button>
            <Button icon="fa-solid fa-indian-rupee-sign" disabledReason={reason || (!open ? `Invoice is ${humanize(inv.status).toLowerCase()}` : null)} onClick={() => setModal({ type: 'pay' })} data-testid="open-record-payment">
              Record payment
            </Button>
          </>
        )
      }
    >
      {q.loading && !inv ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </div>
      ) : q.error && !inv ? (
        <ErrorState error={q.error} onRetry={q.reload} compact />
      ) : inv ? (
        <div className="space-y-6" data-testid="invoice-detail">
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={inv.status} />
            {inv.overdue && <Badge status="overdue" />}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Total', inv.totalPaise, 'text-gray-800'],
              ['Paid', inv.paidPaise, 'text-emerald-600'],
              ['Balance', inv.balancePaise, inv.balancePaise > 0 ? 'text-azea-orange' : 'text-gray-400'],
            ].map(([k, n, c]) => (
              <div key={k} className="rounded-xl bg-azea-bg p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</p>
                <p className={cx('mt-0.5 text-sm font-bold', c)} data-testid={`invoice-${k.toLowerCase()}`}>
                  {formatINR(n)}
                </p>
              </div>
            ))}
          </div>
          <KeyValue
            items={[
              ['Due date', formatDate(inv.dueDate)],
              ['Issued', formatDate(inv.createdAt)],
              ['Flat area', inv.flat?.areaSqft ? `${formatNumber(inv.flat.areaSqft)} sq ft` : '—'],
              ['Arrears at issue', inv.arrearsAtIssuePaise ? formatINR(inv.arrearsAtIssuePaise) : 'None'],
              inv.cancelReason && ['Cancellation reason', inv.cancelReason],
            ]}
          />
          <div>
            <p className="form-label">Charges</p>
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="min-w-full text-xs">
                <tbody>
                  {inv.lines?.map((l, i) => (
                    <tr key={l._id || i} className="border-b border-gray-50">
                      <td className="px-4 py-2.5 text-gray-600">
                        {l.label}
                        {l.kind && l.kind !== 'charge' && <span className="ml-2 text-[10px] text-gray-400">({humanize(l.kind)})</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-700">{formatINR(l.amountPaise)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50/70">
                    <td className="px-4 py-2.5 font-bold text-gray-700">Total</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-800">{formatINR(inv.totalPaise)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <p className="form-label">Payments</p>
            {inv.payments?.length ? (
              <ul className="space-y-2">
                {inv.payments.map((p) => (
                  <li key={p._id} className="rounded-xl border border-gray-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800">
                          {formatINR(p.amountPaise)} <span className="font-normal text-gray-400">· {PAYMENT_METHODS[p.method] || humanize(p.method)}</span>
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {formatDate(p.paidOn || p.createdAt)}
                          {p.receipt?.receiptNumber ? ` · ${p.receipt.receiptNumber}` : ''}
                          {p.referenceNumber ? ` · Ref ${p.referenceNumber}` : ''}
                          {p.recordedBy?.name ? ` · by ${p.recordedBy.name}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge status={p.status} />
                        {p.receipt && (
                          <Button size="xs" variant="secondary" icon="fa-regular fa-file-pdf" loading={downloading === p._id} onClick={() => dl(p)}>
                            Receipt
                          </Button>
                        )}
                        {p.channel === 'offline' && p.status === 'captured' && (
                          <Button size="xs" variant="danger-outline" disabledReason={reason} onClick={() => setModal({ type: 'reverse', payment: p })}>
                            Reverse
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-azea-bg px-4 py-3 text-xs text-azea-muted">No payments recorded yet.</p>
            )}
          </div>
        </div>
      ) : null}
      <RecordPaymentModal open={modal?.type === 'pay'} invoice={inv} onClose={() => setModal(null)} onDone={refresh} />
      <ReasonDialog open={modal?.type === 'cancel'} onClose={() => setModal(null)} onSubmit={(r) => cancel(r)} busy={cancelling} title="Cancel invoice" confirmLabel="Cancel invoice" message="The invoice stays on record as cancelled and no longer counts towards dues." />
      <ReasonDialog open={modal?.type === 'reverse'} onClose={() => setModal(null)} onSubmit={(r) => reverse(r)} busy={reversing} title="Reverse payment" confirmLabel="Reverse" message={`Reverses ${formatINR(modal?.payment?.amountPaise)} with a balancing ledger entry. The receipt stays on record as reversed.`} />
    </Drawer>
  );
}

function ChargeModal({ open, onClose, item, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) {
      setV({ name: item?.name || '', calculation: item?.calculation || 'fixed', amount: paiseToRupeesInput(item?.amountPaise ?? ''), flatCategory: item?.flatCategory || '', active: item ? item.active !== false : true });
      setErrors({});
    }
  }, [open, item]);
  const [save, busy] = useAction(
    () => {
      const body = { name: v.name.trim(), calculation: v.calculation, amountPaise: rupeesToPaise(v.amount), flatCategory: v.flatCategory.trim() || undefined, active: v.active };
      return item ? api.patch(`/society/charges/${item._id}`, body) : api.post('/society/charges', body);
    },
    { toast, success: item ? 'Charge head updated' : 'Charge head added', onDone: () => (onSaved(), onClose()) },
  );
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules(v, { name: [req('Name the charge'), minLen(2), maxLen(80)], amount: [req('Enter the amount'), amountRule(undefined, { allowZero: true })], flatCategory: [maxLen(40)] });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  const set = (k) => (e) => (setV({ ...v, [k]: e.target.value }), setErrors((x) => ({ ...x, [k]: undefined })));
  return (
    <Modal open={open} onClose={onClose} busy={busy} title={item ? 'Edit charge head' : 'Add charge head'} icon="fa-solid fa-list-check" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} data-testid="charge-save">{item ? 'Save' : 'Add charge'}</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Name" required error={errors.name}>
          <Input name="name" value={v.name || ''} onChange={set('name')} invalid={Boolean(errors.name)} placeholder="e.g. Maintenance, Sinking fund, Water" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['fixed', 'Fixed per flat', 'Same amount for every flat'],
            ['per_sqft', 'Per sq ft', 'Rate × flat area'],
          ].map(([val, label, hint]) => (
            <button key={val} type="button" onClick={() => setV({ ...v, calculation: val })} className={cx('rounded-xl border p-3 text-left', v.calculation === val ? 'border-azea-purple bg-azea-purpleLight/60' : 'border-gray-100 hover:border-gray-200')}>
              <span className={cx('block text-xs font-semibold', v.calculation === val ? 'text-azea-purple' : 'text-gray-700')}>{label}</span>
              <span className="block text-[11px] text-gray-500">{hint}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={v.calculation === 'per_sqft' ? 'Rate per sq ft' : 'Amount per month'} required error={errors.amount}>
            <Input name="amount" prefix="₹" suffix={v.calculation === 'per_sqft' ? '/ sq ft' : undefined} inputMode="decimal" value={v.amount ?? ''} onChange={set('amount')} invalid={Boolean(errors.amount)} />
          </Field>
          <Field label="Only for flat category" error={errors.flatCategory} hint="Optional — e.g. 3BHK">
            <Input name="flatCategory" value={v.flatCategory || ''} onChange={set('flatCategory')} />
          </Field>
        </div>
        <Toggle label="Active" description="Inactive charge heads are not added to new bills." checked={v.active} onChange={(x) => setV({ ...v, active: x })} />
      </form>
    </Modal>
  );
}

function ChargesTab({ charges, reload, canWrite, reason }) {
  const [modal, setModal] = useState(null);
  const columns = [
    { key: 'name', header: 'Charge head', render: (c) => <span className="font-semibold text-gray-700">{c.name}</span> },
    { key: 'calc', header: 'Calculation', render: (c) => (c.calculation === 'per_sqft' ? 'Per sq ft' : 'Fixed') },
    { key: 'amount', header: 'Amount', align: 'right', render: (c) => <span className="font-semibold text-gray-700">{formatINR(c.amountPaise)}{c.calculation === 'per_sqft' && <span className="text-[10px] font-normal text-gray-400"> / sq ft</span>}</span> },
    { key: 'cat', header: 'Applies to', render: (c) => c.flatCategory || 'All flats' },
    { key: 'active', header: 'Status', render: (c) => <Badge status={c.active === false ? 'inactive' : 'active'} /> },
    { key: 'actions', header: '', align: 'right', render: (c) => <Button size="xs" variant="secondary" icon="fa-regular fa-pen-to-square" disabledReason={reason} onClick={() => setModal({ item: c })}>Edit</Button> },
  ];
  return (
    <div className="card">
      <Toolbar right={<Button icon="fa-solid fa-plus" disabledReason={reason} onClick={() => setModal({})} data-testid="add-charge">Add charge head</Button>}>
        <p className="text-xs text-gray-500">Every active charge head is added to each flat’s monthly bill (unless the flat has an override).</p>
      </Toolbar>
      <DataTable columns={columns} rows={charges} empty={<EmptyState compact icon="fa-solid fa-list-check" title="No charge heads" message="Without charge heads, bills use the default monthly amount from billing settings." action={canWrite && <Button icon="fa-solid fa-plus" onClick={() => setModal({})}>Add charge head</Button>} />} />
      <ChargeModal open={Boolean(modal)} item={modal?.item} onClose={() => setModal(null)} onSaved={reload} />
    </div>
  );
}

function InvoicesTab({ buildings, canWrite, reason, refreshKey }) {
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const list = usePaged((p) => api.get('/society/invoices', p), { period, buildingId, status, overdue: overdue ? 'true' : undefined, q, refreshKey });
  const t = list.data?.totals;
  const columns = [
    { key: 'no', header: 'Invoice', render: (i) => <span className="font-mono text-[11px] font-semibold text-azea-purple">{i.invoiceNumber}</span> },
    { key: 'period', header: 'Period', render: (i) => formatPeriod(i.period) },
    { key: 'flat', header: 'Flat', render: (i) => <span className="font-semibold text-gray-700">{[i.building?.name, i.flat?.number].filter(Boolean).join(' · ')}</span> },
    { key: 'total', header: 'Total', align: 'right', render: (i) => formatINR(i.totalPaise) },
    { key: 'paid', header: 'Paid', align: 'right', render: (i) => <span className="text-emerald-600">{formatINR(i.paidPaise)}</span> },
    { key: 'bal', header: 'Balance', align: 'right', render: (i) => <span className={cx('font-semibold', i.balancePaise > 0 ? 'text-gray-800' : 'text-gray-300')}>{formatINR(i.balancePaise)}</span> },
    { key: 'due', header: 'Due', render: (i) => <span className={i.overdue ? 'font-semibold text-rose-500' : ''}>{formatDate(i.dueDate)}</span> },
    { key: 'status', header: 'Status', render: (i) => <span className="flex gap-1">{<Badge status={i.status} />}{i.overdue && <Badge status="overdue" />}</span> },
  ];
  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <MetricCard tone="purple" label="Billed" value={t ? formatINR(t.billedPaise, { whole: true }) : '—'} title={t && formatINR(t.billedPaise)} footer="For the current filters" footerIcon="fa-solid fa-filter" icon="fa-solid fa-file-invoice" testId="totals-billed" />
        <MetricCard tone="green" label="Collected" value={t ? formatINR(t.collectedPaise, { whole: true }) : '—'} title={t && formatINR(t.collectedPaise)} footer={t && t.billedPaise ? `${Math.round((t.collectedPaise / t.billedPaise) * 100)}% collection rate` : 'No bills yet'} footerIcon="fa-solid fa-chart-line" icon="fa-solid fa-indian-rupee-sign" testId="totals-collected" />
        <MetricCard tone="orange" label="Outstanding" value={t ? formatINR(t.outstandingPaise, { whole: true }) : '—'} title={t && formatINR(t.outstandingPaise)} footer="Billed minus collected" footerIcon="fa-solid fa-hourglass-half" icon="fa-solid fa-hourglass-half" testId="totals-outstanding" />
      </div>
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-azea-muted">{plural(list.data.total, 'invoice', 'invoices')}</span>}>
          <SearchInput value={search} onChange={setSearch} placeholder="Invoice number…" className="w-full sm:w-48" />
          <PeriodSelect value={period} onChange={setPeriod} allLabel="All months" aria-label="Billing month" className="sm:w-44" />
          <Select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} aria-label="Building" className="sm:w-40">
            <option value="">All buildings</option>
            {buildings.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="sm:w-40">
            <option value="">All statuses</option>
            <option value="open">Open (unpaid + partial)</option>
            {['unpaid', 'partially_paid', 'paid', 'cancelled'].map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
          <Checkbox checked={overdue} onChange={setOverdue} label="Overdue only" />
          {(period || buildingId || status || overdue || search) && (
            <Button size="xs" variant="ghost" onClick={() => (setPeriod(''), setBuildingId(''), setStatus(''), setOverdue(false), setSearch(''))}>
              Clear
            </Button>
          )}
        </Toolbar>
        <DataTable testId="invoices-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} onRowClick={(i) => setParams({ invoice: i._id })} empty={<EmptyState compact icon="fa-solid fa-file-invoice" title={period || buildingId || status || overdue || q ? 'No invoices match' : 'No invoices yet'} message={period || buildingId || status || overdue || q ? 'Try clearing the filters.' : 'Generate bills for a month to create invoices for every flat.'} />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
      <InvoiceDrawer id={params.get('invoice')} onClose={() => setParams({})} canWrite={canWrite} reason={reason} onChanged={list.reload} />
    </>
  );
}

export default function Billing() {
  const { can, role } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const canWrite = can('finance');
  const reason = canWrite ? null : noPermissionReason(role);
  const charges = useQuery(() => api.get('/society/charges'), []);
  const buildings = useQuery(() => api.get('/society/buildings'), []);
  const [tab, setTab] = useState('invoices');
  const [modal, setModal] = useState(params.get('generate') === '1' && canWrite ? 'generate' : null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [remind, reminding] = useAction(() => api.post('/society/invoices/reminders'), { toast, success: (r) => (r.reminded ? `Reminders sent for ${r.reminded} open invoice${r.reminded === 1 ? '' : 's'}` : 'No open invoices — nothing to remind'), onDone: () => setModal(null) });
  const online = charges.data?.onlinePayments;
  return (
    <div>
      <PageHeader
        title="Billing & invoices"
        subtitle="Charge heads, monthly bills and collections"
        actions={
          <>
            <Button variant="outline" icon="fa-regular fa-bell" disabledReason={reason} onClick={() => setModal('remind')}>
              Send reminders
            </Button>
            <Button icon="fa-solid fa-file-invoice" disabledReason={reason} onClick={() => setModal('generate')} data-testid="open-generate">
              Generate bills
            </Button>
          </>
        }
      />
      {online && !online.available && (
        <Alert tone="warning" title="Online payments are unavailable" className="mb-5" icon="fa-solid fa-credit-card">
          {online.reason} Residents see the same message in the app. Record cash, cheque, bank transfer and UPI payments here as offline payments.
        </Alert>
      )}
      {online?.available && (
        <Alert tone="success" className="mb-5" icon="fa-solid fa-credit-card">
          Online payments are enabled — residents can pay their bills from the adda app.
        </Alert>
      )}
      <Tabs
        className="mb-4"
        tabs={[
          { value: 'invoices', label: 'Invoices', icon: 'fa-solid fa-file-invoice' },
          { value: 'charges', label: 'Charge heads', icon: 'fa-solid fa-list-check', count: charges.data?.items?.length },
          { value: 'settings', label: 'Billing settings', icon: 'fa-solid fa-sliders' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'invoices' && <InvoicesTab buildings={buildings.data?.items || []} canWrite={canWrite} reason={reason} refreshKey={refreshKey} />}
      {tab === 'charges' &&
        (charges.loading && !charges.data ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : charges.error && !charges.data ? (
          <div className="card">
            <ErrorState error={charges.error} onRetry={charges.reload} />
          </div>
        ) : (
          <ChargesTab charges={charges.data.items} reload={charges.reload} canWrite={canWrite} reason={reason} />
        ))}
      {tab === 'settings' && (
        <Card title="Billing settings">
          {charges.data ? <BillingSettingsForm billing={charges.data.billing} canEdit={canWrite} reason={`${reason || ''} Only the admin and treasurer can change billing settings.`} onSaved={charges.reload} /> : <Skeleton className="h-48" />}
        </Card>
      )}
      <GenerateModal
        open={modal === 'generate'}
        onClose={() => {
          setModal(null);
          if (params.get('generate')) setParams({});
        }}
        buildings={buildings.data?.items || []}
        onDone={() => setRefreshKey((k) => k + 1)}
      />
      <ConfirmDialog open={modal === 'remind'} onClose={() => setModal(null)} onConfirm={() => remind()} busy={reminding} tone="primary" icon="fa-regular fa-bell" title="Send payment reminders" confirmLabel="Send reminders" message="Every resident with an unpaid or partially paid bill gets an in-app reminder (overdue bills are marked overdue)." />
    </div>
  );
}
