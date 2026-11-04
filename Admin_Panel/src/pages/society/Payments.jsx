import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useAction, usePaged, useQuery } from '../../lib/hooks.js';
import { formatDate, formatDateTime, formatINR, formatPeriod, humanize, rupeesToPaise, paiseToRupeesInput, plural } from '../../lib/format.js';
import { noPermissionReason } from '../../lib/roles.js';
import { downloadReceipt } from '../../lib/files.js';
import { amountRule, runRules } from '../../lib/validation.js';
import { Alert, Badge, Button, EmptyState, ErrorState, KeyValue, PageHeader, Skeleton, Tabs } from '../../components/ui.jsx';
import { DataTable, Pagination, Toolbar } from '../../components/DataTable.jsx';
import { Field, Input, Select, Textarea } from '../../components/Form.jsx';
import { Drawer, Modal, ReasonDialog } from '../../components/Modal.jsx';
import { useToast } from '../../components/Toast.jsx';
import { PAYMENT_METHODS } from '../../lib/finance.js';

function RefundModal({ open, onClose, payment, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const refundable = payment ? payment.amountPaise - (payment.refundedPaise || 0) : 0;
  const [save, busy] = useAction(() => api.post(`/society/payments/${payment._id}/refund`, { amountPaise: amount ? rupeesToPaise(amount) : undefined, reason: reason.trim() }), { toast, success: 'Refund requested with the payment gateway', onDone: () => (onDone(), onClose()) });
  const submit = (e) => {
    e?.preventDefault();
    const errs = runRules({ amount, reason }, { amount: [amountRule(), [(x) => !x || rupeesToPaise(x) <= refundable, `At most ${formatINR(refundable)}`]], reason: [[(x) => x.trim().length >= 3, 'Give a reason (at least 3 characters)']] });
    setErrors(errs);
    if (!Object.keys(errs).length) save();
  };
  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Refund online payment" subtitle={payment ? `Refundable ${formatINR(refundable)}` : ''} icon="fa-solid fa-rotate-left" footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="danger" onClick={submit} loading={busy}>Request refund</Button></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Amount" error={errors.amount} hint="Leave empty for a full refund">
          <Input name="amount" prefix="₹" inputMode="decimal" value={amount} placeholder={paiseToRupeesInput(refundable)} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(errors.amount)} />
        </Field>
        <Field label="Reason" error={errors.reason}>
          <Textarea name="reason" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} invalid={Boolean(errors.reason)} />
        </Field>
        <p className="text-[11px] text-brand-muted">The refund is processed by the payment gateway; the status updates when the gateway confirms it.</p>
      </form>
    </Modal>
  );
}

function PaymentDrawer({ id, onClose, reason, onChanged }) {
  const toast = useToast();
  const q = useQuery(() => (id ? api.get(`/society/payments/${id}`) : Promise.resolve(null)), [id]);
  const [modal, setModal] = useState(null);
  const [busyDl, setBusyDl] = useState(false);
  const p = q.data;
  const refresh = () => (q.reload(), onChanged());
  const [reverse, reversing] = useAction((r) => api.post(`/society/payments/${id}/reverse`, { reason: r }), { toast, success: 'Payment reversed', onDone: () => (setModal(null), refresh()) });
  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      title={p ? formatINR(p.amountPaise) : 'Payment'}
      subtitle={p ? `${p.receipt?.receiptNumber || 'No receipt'} · ${formatDate(p.paidOn || p.createdAt)}` : ''}
      footer={
        p && (
          <>
            {p.receipt && (
              <Button
                variant="outline"
                icon="fa-regular fa-file-pdf"
                loading={busyDl}
                onClick={async () => {
                  setBusyDl(true);
                  try {
                    await downloadReceipt(p.receipt);
                  } catch (err) {
                    toast.error(err.message);
                  } finally {
                    setBusyDl(false);
                  }
                }}
              >
                Download receipt
              </Button>
            )}
            {p.channel === 'offline' && (
              <Button variant="danger-outline" icon="fa-solid fa-rotate-left" disabledReason={reason || (p.status !== 'captured' ? `Payment is ${humanize(p.status).toLowerCase()}` : null)} onClick={() => setModal('reverse')}>
                Reverse
              </Button>
            )}
            {p.channel === 'online' && (
              <Button variant="danger-outline" icon="fa-solid fa-rotate-left" disabledReason={reason || (!['captured', 'partially_refunded'].includes(p.status) ? 'Only captured payments can be refunded' : null)} onClick={() => setModal('refund')}>
                Refund
              </Button>
            )}
          </>
        )
      }
    >
      {q.loading && !p ? (
        <Skeleton className="h-48" />
      ) : q.error && !p ? (
        <ErrorState error={q.error} onRetry={q.reload} compact />
      ) : p ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge status={p.status} />
            <Badge tone={p.channel === 'online' ? 'purple' : 'info'}>{humanize(p.channel)}</Badge>
          </div>
          <KeyValue
            items={[
              ['Amount', formatINR(p.amountPaise)],
              ['Method', PAYMENT_METHODS[p.method] || humanize(p.method)],
              ['Paid on', formatDate(p.paidOn || p.createdAt)],
              ['Receipt', p.receipt?.receiptNumber],
              ['Invoice', p.invoice ? `${p.invoice.invoiceNumber} (${formatPeriod(p.invoice.period)})` : '—'],
              ['Flat', p.flat?.number],
              ['Payer', p.payer?.name],
              ['Recorded by', p.recordedBy?.name || (p.channel === 'online' ? 'Payment gateway' : '—')],
              ['Reference', p.referenceNumber || p.providerPaymentId],
              p.refundedPaise ? ['Refunded', formatINR(p.refundedPaise)] : null,
              p.reversalReason ? ['Reversal reason', p.reversalReason] : null,
              p.note ? ['Note', p.note] : null,
              ['Recorded at', formatDateTime(p.createdAt)],
            ]}
          />
        </div>
      ) : null}
      <ReasonDialog open={modal === 'reverse'} onClose={() => setModal(null)} onSubmit={(r) => reverse(r)} busy={reversing} title="Reverse payment" confirmLabel="Reverse" message="The invoice balance is restored and a reversing ledger entry is posted. This can’t be undone." />
      <RefundModal open={modal === 'refund'} payment={p} onClose={() => setModal(null)} onDone={refresh} />
    </Drawer>
  );
}

export default function Payments() {
  const { can, role } = useAuth();
  const toast = useToast();
  const reason = can('finance') ? null : noPermissionReason(role);
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const list = usePaged((p) => api.get('/society/payments', { ...p, sort: '-createdAt' }), { channel, status });
  const [open, setOpen] = useState(null);
  const [dl, setDl] = useState(null);
  const charges = useQuery(() => api.get('/society/charges'), []);
  const online = charges.data?.onlinePayments;
  const columns = [
    { key: 'receipt', header: 'Receipt', render: (p) => <span className="font-mono text-[11px] font-semibold text-brand">{p.receipt?.receiptNumber || '—'}</span> },
    { key: 'date', header: 'Paid on', render: (p) => formatDate(p.paidOn || p.createdAt) },
    { key: 'flat', header: 'Flat', render: (p) => <span className="font-semibold text-gray-700">{p.flat?.number || '—'}</span> },
    { key: 'invoice', header: 'Invoice', render: (p) => (p.invoice ? <span>{p.invoice.invoiceNumber} <span className="text-gray-400">· {formatPeriod(p.invoice.period)}</span></span> : '—') },
    { key: 'method', header: 'Method', render: (p) => PAYMENT_METHODS[p.method] || humanize(p.method) },
    { key: 'channel', header: 'Channel', render: (p) => <Badge tone={p.channel === 'online' ? 'purple' : 'info'}>{humanize(p.channel)}</Badge> },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => <span className={p.status === 'reversed' ? 'text-gray-400 line-through' : 'font-semibold text-gray-800'}>{formatINR(p.amountPaise)}</span> },
    { key: 'status', header: 'Status', render: (p) => <Badge status={p.status} /> },
    {
      key: 'pdf',
      header: '',
      align: 'right',
      render: (p) =>
        p.receipt ? (
          <Button
            size="xs"
            variant="secondary"
            icon="fa-regular fa-file-pdf"
            loading={dl === p._id}
            onClick={async (e) => {
              e.stopPropagation();
              setDl(p._id);
              try {
                await downloadReceipt(p.receipt);
              } catch (err) {
                toast.error(err.message);
              } finally {
                setDl(null);
              }
            }}
            data-testid="receipt-download"
          >
            PDF
          </Button>
        ) : null,
    },
  ];
  return (
    <div>
      <PageHeader title="Payments" subtitle="Every payment received, with receipts" actions={<Button variant="outline" icon="fa-solid fa-rotate-right" onClick={list.reload} loading={list.reloading}>Refresh</Button>} />
      {online && !online.available && (
        <Alert tone="warning" className="mb-5" icon="fa-solid fa-credit-card" title="Online payments are unavailable">
          {online.reason}
        </Alert>
      )}
      <Tabs className="mb-4" tabs={[{ value: '', label: 'All' }, { value: 'offline', label: 'Offline' }, { value: 'online', label: 'Online' }]} value={channel} onChange={setChannel} />
      <div className="card">
        <Toolbar right={list.data && <span className="text-[11px] text-brand-muted">{plural(list.data.total, 'payment', 'payments')}</span>}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="sm:w-44">
            <option value="">All statuses</option>
            {['captured', 'reversed', 'created', 'failed', 'refunded', 'partially_refunded'].map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </Toolbar>
        <DataTable testId="payments-table" columns={columns} rows={list.data?.items} loading={list.loading} error={list.error} onRetry={list.reload} dim={list.reloading} onRowClick={(p) => setOpen(p._id)} empty={<EmptyState compact icon="fa-solid fa-indian-rupee-sign" title="No payments yet" message="Record offline payments from an invoice in Billing & invoices." />} />
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={list.limit} onPage={list.setPage} />}
      </div>
      <PaymentDrawer id={open} onClose={() => setOpen(null)} reason={reason} onChanged={list.reload} />
    </div>
  );
}
