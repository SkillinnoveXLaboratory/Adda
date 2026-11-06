import { Badge } from './ui.jsx';

export const KYC_LABEL = { not_submitted: 'KYC not submitted', pending: 'KYC pending review', approved: 'KYC approved', rejected: 'KYC rejected' };
const SHORT = { not_submitted: 'Not submitted', pending: 'Pending review', approved: 'Approved', rejected: 'Rejected' };

/** Vendor KYC status. `long` adds "KYC" to the label (for places where the context isn't obvious). */
export function KycBadge({ status, long = false }) {
  const s = status || 'not_submitted';
  return (
    <Badge status={s === 'not_submitted' ? 'draft' : s} tone={s === 'pending' ? 'warning' : undefined}>
      {long ? KYC_LABEL[s] : SHORT[s]}
    </Badge>
  );
}
