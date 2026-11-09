import { commissionOf, money } from '../lib/format.js';
import { cx } from './ui.jsx';

function Row({ label, value, strong, tone, testId }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cx('min-w-0 text-xs', strong ? 'font-bold text-gray-800' : 'text-gray-600')}>{label}</span>
      <span className={cx('whitespace-nowrap', strong ? 'text-sm font-bold' : 'text-xs font-semibold', tone || (strong ? 'text-gray-800' : 'text-gray-700'))} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

/**
 * Vendor's view while publishing a service: price, the platform commission at the admin's current rate,
 * and what the vendor earns. "Price on request" services show the rate only.
 */
export function CommissionBreakdown({ pricePaise, percent = 0, onQuote }) {
  if (onQuote || !(pricePaise > 0)) {
    return (
      <div className="rounded-xl border border-violet-100 bg-azea-purpleLight/40 p-4 text-xs leading-relaxed text-gray-600" data-testid="commission-breakdown">
        {percent > 0 ? `NIVASA keeps a ${percent}% platform commission on the amount you collect for each booking.` : 'No platform commission is charged right now.'}
      </div>
    );
  }
  const commission = commissionOf(pricePaise, percent);
  return (
    <div className="space-y-2 rounded-xl border border-violet-100 bg-azea-purpleLight/40 p-4" data-testid="commission-breakdown">
      <Row label="Price members see" value={money(pricePaise)} testId="commission-price" />
      <Row label={`NIVASA commission (${percent}%)`} value={percent > 0 ? `− ${money(commission)}` : money(0)} tone={percent > 0 ? 'text-rose-600' : undefined} testId="commission-amount" />
      <div className="border-t border-violet-100" />
      <Row label="You earn" value={money(pricePaise - commission)} strong testId="commission-earn" />
      <p className="pt-1 text-[11px] leading-relaxed text-azea-muted">Members pay you directly. The commission is settled with NIVASA later. Coupons members use are paid back to you by NIVASA.</p>
    </div>
  );
}

/** Settlement with NIVASA for paid jobs (dashboard totals). */
export function SettlementSummary({ settlement = {}, commissionPercent = 0 }) {
  const net = settlement.netToPlatformPaise || 0;
  return (
    <div className="space-y-2" data-testid="vendor-settlement">
      <Row label={`Cash recorded (${settlement.paidBookings || 0} paid job${settlement.paidBookings === 1 ? '' : 's'})`} value={money(settlement.cashCollectedPaise || 0)} testId="settle-cash" />
      <Row label="Commission on paid jobs" value={money(settlement.commissionPaise || 0)} testId="settle-commission" />
      <Row label="Coupon credits (NIVASA pays you)" value={`− ${money(settlement.couponCreditsPaise || 0)}`} tone="text-emerald-700" testId="settle-coupons" />
      <div className="border-t border-gray-100 pt-2">
        <Row label={net < 0 ? 'NIVASA owes you' : 'You owe NIVASA'} value={money(Math.abs(net))} strong tone={net > 0 ? 'text-amber-700' : 'text-emerald-700'} testId="settle-net" />
      </div>
      <p className="text-[11px] leading-relaxed text-azea-muted">Platform commission now: {commissionPercent || 0}% · applies to services you publish or edit. Each booking keeps the rate it was booked at.</p>
    </div>
  );
}

/** Settlement of one paid booking (vendor view only — the server sends these fields only to the vendor). */
export function BookingSettlement({ payment }) {
  if (!payment || payment.status !== 'paid' || payment.commissionPaise === undefined) return null;
  const net = payment.netToPlatformPaise || 0;
  return (
    <div className="space-y-1.5 rounded-lg bg-azea-bg p-3" data-testid="booking-settlement">
      <Row label="Cash received" value={money(payment.amountPaise)} />
      {payment.discountPaise ? <Row label="Coupon credit from NIVASA" value={`+ ${money(payment.discountPaise)}`} tone="text-emerald-700" /> : null}
      <Row label="Gross for commission" value={money(payment.grossPaise)} />
      <Row label="Commission" value={money(payment.commissionPaise)} />
      <div className="border-t border-gray-200 pt-1.5">
        <Row label={net > 0 ? 'You owe NIVASA' : net < 0 ? 'NIVASA owes you' : 'Nothing to settle'} value={money(Math.abs(net))} strong tone={net > 0 ? 'text-amber-700' : 'text-emerald-700'} testId="booking-net" />
      </div>
    </div>
  );
}
