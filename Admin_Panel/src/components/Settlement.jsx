import { formatINR, plural } from '../lib/format.js';
import { cx } from './ui.jsx';
import { MetricCard } from './Charts.jsx';

/** Net settlement for NIVASA: positive = the vendor owes NIVASA, negative = NIVASA owes the vendor (coupon credit above commission). */
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
      <MetricCard tone="green" label="Cash collected" value={formatINR(t.cashCollectedPaise)} icon="fa-solid fa-money-bill-wave" footer={`${plural(t.paidBookings, 'paid booking')} · received by ${vendorScope ? 'the vendor' : 'vendors'}`} testId="settle-cash" />
      <MetricCard tone="orange" label="Coupon credits" value={formatINR(t.couponCreditsPaise)} icon="fa-solid fa-ticket" footer="Discounts NIVASA funds" testId="settle-coupons" />
      <MetricCard tone="purple" label="Commission" value={formatINR(t.commissionPaise)} icon="fa-solid fa-percent" footer="On the full price (cash + coupon)" testId="settle-commission" />
      <MetricCard tone="cyan" label={vendorScope ? 'Net payable by vendor' : 'Net payable by vendors'} value={<NetAmount paise={t.netToPlatformPaise ?? 0} className="!text-2xl !font-bold" />} icon="fa-solid fa-scale-balanced" footer={netCaption(t.netToPlatformPaise || 0, vendorScope)} testId="settle-net" />
    </div>
  );
}
