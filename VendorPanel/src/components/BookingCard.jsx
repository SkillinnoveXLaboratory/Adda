import { useCallback, useId, useState } from 'react';
import { api } from '../lib/api.js';
import { useAction } from '../lib/hooks.js';
import { dayParts, formatDateTime, formatPhone, humanize, money, paiseToRupeesInput, time12, toPaise } from '../lib/format.js';
import { rupeeError } from '../lib/validation.js';
import { Badge, Button, cx, Icon } from './ui.jsx';
import { Field, Input, Textarea } from './Form.jsx';
import { ConfirmDialog, Modal, NoteDialog } from './Modal.jsx';
import { BookingSettlement } from './Pricing.jsx';
import { useToast } from './Toast.jsx';

const ACTION = {
  accept: { label: 'Accept', variant: 'primary', icon: 'fa-solid fa-check', done: 'Booking accepted' },
  decline: { label: 'Decline', variant: 'danger-outline', icon: 'fa-solid fa-xmark', done: 'Booking declined' },
  complete: { label: 'Mark job done', variant: 'primary', icon: 'fa-solid fa-flag-checkered', done: 'Marked as done' },
  cancel: { label: 'Cancel booking', variant: 'danger-outline', icon: 'fa-solid fa-ban', done: 'Booking cancelled' },
};
const STATUS_LABEL = { requested: 'New request', accepted: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled', completed: 'Job done' };

/**
 * One booking of the vendor's service: customer contact, date, price, actions the server allows (`actions`),
 * cash "mark as paid" once after the job, and the settlement with NIVASA once paid.
 */
export function BookingCard({ booking: b, onChanged, compact = false }) {
  const toast = useToast();
  const [ask, setAsk] = useState(null); // 'decline' | 'cancel' | 'complete'
  const [paying, setPaying] = useState(false);
  const pr = b.pricing || {};
  const pay = b.payment || {};
  const paid = pay.status === 'paid';
  const day = dayParts(b.preferredDate);
  const contact = b.customer || {};
  // For a new request "Decline" is the vendor's way to say no; "Cancel" is kept for confirmed jobs.
  const actions = (b.actions || []).filter((a) => a !== 'mark-paid' && ACTION[a] && !(a === 'cancel' && b.actions.includes('decline')));

  const act = useCallback(
    async (action, note) => {
      await api.post(`/vendor/bookings/${b._id}/${action}`, note ? { note } : {});
      return action;
    },
    [b._id],
  );
  const [run, busy] = useAction(act, {
    toast,
    success: (a) => ACTION[a].done,
    onDone: () => {
      setAsk(null);
      onChanged?.();
    },
  });

  return (
    <article className="card p-4" data-testid="booking-card" data-status={b.status}>
      <div className="flex gap-3">
        <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-azea-purpleLight py-1.5 text-center">
          <span className="text-[9px] font-bold uppercase text-azea-purpleDark">{day.weekday}</span>
          <span className="text-lg font-bold leading-6 text-gray-800">{day.day}</span>
          <span className="text-[9px] font-bold uppercase text-gray-500">{day.month}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-bold text-gray-800">{b.offerTitle}</p>
          <p className="mt-0.5 text-[11px] text-azea-muted">
            {b.preferredTime ? time12(b.preferredTime) : 'Any time'}
            {contact.name ? ` · Customer: ${contact.name}` : ''}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge status={b.status}>{STATUS_LABEL[b.status] || humanize(b.status)}</Badge>
            {paid ? <Badge tone="success">Paid {money(pay.amountPaise)} · cash</Badge> : b.status === 'completed' ? <Badge tone="warning">Payment not recorded</Badge> : null}
          </div>
        </div>
      </div>

      <dl className="mt-3 space-y-1.5 text-xs text-gray-600">
        <div className="flex gap-2">
          <dt className="sr-only">Address</dt>
          <Icon name="fa-solid fa-location-dot" className="mt-0.5 w-3.5 text-center text-gray-400" />
          <dd className="min-w-0 break-words">{b.address}</dd>
        </div>
        {b.note ? (
          <div className="flex gap-2">
            <dt className="sr-only">Customer note</dt>
            <Icon name="fa-regular fa-comment" className="mt-0.5 w-3.5 text-center text-gray-400" />
            <dd className="min-w-0 break-words">{b.note}</dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="sr-only">Price</dt>
          <Icon name="fa-solid fa-tag" className="mt-0.5 w-3.5 text-center text-gray-400" />
          <dd className="min-w-0">
            {pr.listPricePaise ? money(pr.listPricePaise) : 'Price on request'}
            {pr.discountPaise ? ` · Coupon ${pr.couponCode} −${money(pr.discountPaise)} · Customer pays ${money(pr.payablePaise)}` : ''}
            {pr.commissionPercent !== undefined ? <span className="text-azea-muted"> · commission {pr.commissionPercent}%</span> : null}
          </dd>
        </div>
      </dl>

      {paid && <div className="mt-3">{<BookingSettlement payment={pay} />}</div>}

      {!compact && b.timeline?.length > 1 ? (
        <p className="mt-2 text-[11px] text-gray-400">
          Last update: {humanize(b.timeline[b.timeline.length - 1].status)} · {formatDateTime(b.timeline[b.timeline.length - 1].at)}
          {b.timeline[b.timeline.length - 1].note ? ` — “${b.timeline[b.timeline.length - 1].note}”` : ''}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {contact.phone && !['declined', 'cancelled'].includes(b.status) ? (
          <>
            <a href={`tel:+91${contact.phone}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50" aria-label={`Call ${contact.name || 'customer'} on ${formatPhone(contact.phone)}`}>
              <Icon name="fa-solid fa-phone" className="text-[11px]" /> {formatPhone(contact.phone)}
            </a>
            <a href={`https://wa.me/91${contact.phone}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
              <Icon name="fa-brands fa-whatsapp" /> WhatsApp
            </a>
          </>
        ) : null}
        {actions.map((a) => (
          <Button
            key={a}
            variant={ACTION[a].variant}
            icon={ACTION[a].icon}
            loading={busy && ask === null && a === 'accept'}
            disabled={busy}
            data-testid={`booking-${a}`}
            onClick={() => (a === 'accept' ? run('accept') : setAsk(a))}
          >
            {ACTION[a].label}
          </Button>
        ))}
        {b.actions?.includes('mark-paid') && (
          <Button variant="success" icon="fa-solid fa-indian-rupee-sign" onClick={() => setPaying(true)} data-testid="booking-mark-paid">
            Mark cash paid
          </Button>
        )}
      </div>

      <NoteDialog
        open={ask === 'decline' || ask === 'cancel'}
        onClose={() => !busy && setAsk(null)}
        busy={busy}
        title={ask === 'decline' ? 'Decline this booking?' : 'Cancel this booking?'}
        message="The customer will be notified. If they used a coupon, it is given back to them."
        label="Note for the customer"
        placeholder={ask === 'decline' ? 'e.g. Not available on that day' : 'e.g. Unable to come because of an emergency'}
        confirmLabel={ask === 'decline' ? 'Decline booking' : 'Cancel booking'}
        onSubmit={(note) => run(ask, note)}
      />
      <ConfirmDialog
        open={ask === 'complete'}
        onClose={() => !busy && setAsk(null)}
        busy={busy}
        tone="primary"
        title="Mark this job as done?"
        message="Do this after you finish the work. You can then record the cash the customer paid you."
        confirmLabel="Mark job done"
        onConfirm={() => run('complete')}
      />
      <MarkPaidDialog open={paying} booking={b} onClose={() => setPaying(false)} onDone={() => (setPaying(false), onChanged?.())} />
    </article>
  );
}

/** Record cash received once (prefilled with what the customer pays: list price − coupon). Immutable afterwards. */
function MarkPaidDialog({ open, booking: b, onClose, onDone }) {
  const toast = useToast();
  const payable = b.pricing?.payablePaise ?? b.pricePaise;
  const [amount, setAmount] = useState(() => paiseToRupeesInput(payable));
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const amountId = useId();
  const noteId = useId();
  const paise = toPaise(amount);

  const [save, busy] = useAction(
    useCallback(async () => {
      await api.post(`/vendor/bookings/${b._id}/mark-paid`, { amountPaise: paise, ...(note.trim() ? { note: note.trim() } : {}) });
    }, [b._id, paise, note]),
    { toast, success: 'Cash payment recorded', onDone, onError: (err) => (setConfirming(false), setError(err.message)) },
  );

  const next = () => {
    const problem = rupeeError(amount, { label: 'the amount you received', max: 1000000 });
    if (problem) return setError(problem);
    setError(null);
    setConfirming(true);
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && (setConfirming(false), onClose())}
      busy={busy}
      title={confirming ? `Record ${money(paise)} received in cash?` : 'Mark cash paid'}
      subtitle={b.offerTitle}
      icon="fa-solid fa-indian-rupee-sign"
      size="sm"
      testId="mark-paid-dialog"
      footer={
        confirming ? (
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Back
            </Button>
            <Button variant="success" onClick={() => save()} loading={busy} data-testid="mark-paid-confirm">
              Yes, record payment
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={next} data-testid="mark-paid-next">
              Continue
            </Button>
          </>
        )
      }
    >
      {confirming ? (
        <div className="space-y-2 text-xs leading-relaxed text-gray-600">
          <p>This can’t be changed later. The customer will see it, and the commission with NIVASA is fixed at this moment.</p>
          {error && (
            <p className="font-medium text-rose-600" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-gray-600">
            Record the cash the customer paid you in person.{' '}
            {b.pricing?.discountPaise ? `They used coupon ${b.pricing.couponCode} (−${money(b.pricing.discountPaise)}); NIVASA pays that part back to you.` : ''}
          </p>
          <Field label="Amount received in cash" error={error} htmlFor={amountId} hint={payable ? `Customer pays ${money(payable)}` : 'Price on request — enter the amount you agreed.'}>
            <Input id={amountId} name="amount" prefix="₹" inputMode="decimal" value={amount} onChange={(e) => (setAmount(e.target.value.replace(/[^\d.]/g, '')), setError(null))} invalid={Boolean(error)} placeholder="e.g. 499" maxLength={12} />
          </Field>
          <Field label="Note (optional)" htmlFor={noteId}>
            <Textarea id={noteId} name="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Paid in cash after the job" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

export function BookingListSkeleton({ rows = 3 }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading bookings">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cx('card skeleton h-44')} />
      ))}
    </div>
  );
}
