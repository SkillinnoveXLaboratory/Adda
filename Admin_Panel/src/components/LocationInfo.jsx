import { formatCoords, osmUrl, validLocation } from '../lib/location.js';
import { Icon } from './ui.jsx';

/**
 * A saved map location: label, coordinates (6 decimals) and an "Open map" link to OpenStreetMap at the point.
 * `empty` is shown when no location was saved.
 */
export function LocationInfo({ location, empty = 'No map location saved', testId }) {
  const loc = validLocation(location);
  if (!loc) return <span className="text-gray-400" data-testid={testId}>{empty}</span>;
  return (
    <span className="block min-w-0" data-testid={testId}>
      {loc.label && <span className="block break-words text-gray-700">{loc.label}</span>}
      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[11px] text-gray-500" data-testid={testId ? `${testId}-coords` : undefined}>
          {formatCoords(loc)}
        </span>
        <a href={osmUrl(loc)} target="_blank" rel="noopener noreferrer" className="link inline-flex min-h-[24px] items-center gap-1 text-[11px]" data-testid={testId ? `${testId}-map` : undefined}>
          <Icon name="fa-solid fa-map-location-dot" className="text-[10px]" /> Open map
          <span className="sr-only">(OpenStreetMap, opens in a new tab)</span>
        </a>
      </span>
    </span>
  );
}
