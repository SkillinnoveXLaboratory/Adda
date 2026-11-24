import { formatINR, plural } from '../lib/format.js';
import { cx } from './ui.jsx';
import { MetricCard } from './Charts.jsx';

/**
 * NIVASA's net on paid bookings (commission − member discounts). Vendors collect the cash, so a positive net is what
 * the vendor owes NIVASA; a negative one (possible only on bookings made before per-vendor pricing) is owed to the vendor.
 */
export function NetAmount({ paise, className = '' }) {
  if (paise === null || paise === undefined) return <span className="text-gray-300">—</span>;
  const n = Number(paise);
  return (
    <span className={cx('whitespace-nowrap font-semibold', n > 0 ? 'text-emerald-600' : n < 0 ? 'text-rose-500' : 'text-gray-500', className)} title={n > 0 ? 'Vendor owes NIVASA' : n < 0 ? 'NIVASA owes the vendor' : 'Nothing to settle'}>
      {n > 0 ? '+' : ''}
      {formatINR(n)}
    </span>
  );
}

export const netCaption = (paise, oneVendor = false) => (paise > 0 ? (oneVendor ? 'Vendor owes NIVASA' : 'Vendors owe NIVASA') : paise < 0 ? (oneVendor ? 'NIVASA owes the vendor' : 'NIVASA owes vendors') : 'Nothing to settle');

/** Settlement totals for a set of paid bookings (platform list or one vendor). */
export function SettlementCards({ totals, vendorScope = false }) {
  const t = totals || {};
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 2xl:grid-cols-5">
      <MetricCard tone="green" label="Cash collected" value={formatINR(t.cashCollectedPaise)} icon="fa-solid fa-money-bill-wave" footer={`${plural(t.paidBookings, 'paid booking')} · received by ${vendorScope ? 'the vendor' : 'vendors'}`} testId="settle-cash" />
      <MetricCard tone="purple" label="Commission" value={formatINR(t.commissionPaise)} icon="fa-solid fa-percent" footer="Taken out of the vendor’s price" testId="settle-commission" />
      <MetricCard tone="orange" label="Member discounts" value={formatINR(t.memberDiscountsPaise)} icon="fa-solid fa-tag" footer="Given back out of the commission" testId="settle-discounts" />
      <MetricCard tone="cyan" label="NIVASA net" value={<NetAmount paise={t.netToPlatformPaise ?? 0} className="!text-2xl !font-bold" />} icon="fa-solid fa-scale-balanced" footer={netCaption(t.netToPlatformPaise || 0, vendorScope)} testId="settle-net" />
      <MetricCard tone="green" label="Vendor earnings" value={formatINR(t.vendorEarningsPaise)} icon="fa-solid fa-wallet" footer="Cash − NIVASA net" testId="settle-vendor" />
    </div>
  );
}
