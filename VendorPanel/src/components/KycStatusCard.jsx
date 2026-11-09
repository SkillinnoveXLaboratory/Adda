import { Link } from 'react-router';
import { cx, Icon } from './ui.jsx';

const COPY = {
  not_submitted: ['Complete your KYC to start listing', 'Add PAN, Aadhaar and bank details with photos. It takes about 3 minutes.', 'Start KYC', 'border-amber-200 bg-amber-50'],
  pending: ['KYC under review', 'NIVASA is checking your documents. You can list properties and services once it is approved.', 'View details', 'border-violet-200 bg-azea-purpleLight/60'],
  rejected: ['KYC needs changes', null, 'Fix and resubmit', 'border-rose-200 bg-rose-50'],
};

/** Vendor KYC prompt; renders nothing once KYC is approved. */
export function KycStatusCard({ status, note, className = '' }) {
  const c = COPY[status || 'not_submitted'];
  if (!c) return null;
  const [title, body, cta, tone] = c;
  return (
    <div className={cx('flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center', tone, className)} data-testid="kyc-banner">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-azea-purple shadow-sm">
        <Icon name="fa-solid fa-shield-halved" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-800">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{body || (note ? `Reason: ${note}` : 'Please check your details and documents and submit again.')}</p>
      </div>
      <Link to="/kyc" className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 self-start rounded-lg bg-azea-purple px-4 text-xs font-semibold text-white shadow-sm hover:bg-azea-purpleDark sm:self-center">
        {cta}
        <Icon name="fa-solid fa-arrow-right" className="text-[10px]" />
      </Link>
    </div>
  );
}
