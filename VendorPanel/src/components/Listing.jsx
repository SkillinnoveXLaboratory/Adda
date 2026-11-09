import { Link } from 'react-router';
import { mediaHref } from '../lib/api.js';
import { Badge, cx, Icon, Thumb } from './ui.jsx';

const MODERATION = { pending: ['In review', 'warning'], approved: ['Approved', 'success'], rejected: ['Not approved', 'danger'] };

export function ModerationBadge({ status }) {
  const [label, tone] = MODERATION[status] || [status, 'neutral'];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Status filter tabs shared by Services and Properties. `live(item)` decides "Live". */
export function listingTabs(items, live, pausedLabel = 'Paused') {
  const count = (fn) => items.filter(fn).length;
  return [
    { value: 'all', label: 'All', count: items.length, match: () => true },
    { value: 'live', label: 'Live', count: count(live), match: live },
    { value: 'pending', label: 'In review', count: count((i) => i.moderationStatus === 'pending'), match: (i) => i.moderationStatus === 'pending' },
    { value: 'rejected', label: 'Not approved', count: count((i) => i.moderationStatus === 'rejected'), match: (i) => i.moderationStatus === 'rejected' },
    { value: 'paused', label: pausedLabel, count: count((i) => i.moderationStatus === 'approved' && !live(i)), match: (i) => i.moderationStatus === 'approved' && !live(i) },
  ];
}

/** One listing (service or property) with its review status and actions. */
export function ListingCard({ item, icon, meta, price, extra, actions, editTo, testId = 'listing-card' }) {
  const photo = item.photos?.[0];
  return (
    <article className="card flex flex-col p-4" data-testid={testId} data-id={item._id}>
      <div className="flex gap-3">
        <Thumb src={photo ? mediaHref(photo.url) : null} icon={icon} className="h-20 w-24" alt="" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <ModerationBadge status={item.moderationStatus} />
            {extra}
          </div>
          <Link to={editTo} className="mt-1 block break-words text-sm font-bold text-gray-800 hover:text-azea-purple">
            {item.title}
          </Link>
          <p className="mt-0.5 text-sm font-semibold text-azea-purpleDark">{price}</p>
          <p className="mt-0.5 text-[11px] text-azea-muted">{meta}</p>
        </div>
      </div>
      {item.moderationStatus === 'rejected' && item.moderationNote ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[11px] leading-relaxed text-rose-700">
          <Icon name="fa-solid fa-circle-exclamation" className="mr-1" />
          {item.moderationNote} — edit and save to send it for review again.
        </p>
      ) : null}
      <div className={cx('mt-auto flex flex-wrap gap-2 pt-3')}>{actions}</div>
    </article>
  );
}
