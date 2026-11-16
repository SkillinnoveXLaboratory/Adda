/** A stored location { lat, lng, label? } → usable numbers, or null when missing / out of range. */
export function validLocation(loc) {
  if (!loc || loc.lat === null || loc.lng === null || loc.lat === undefined || loc.lng === undefined) return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng, label: loc.label ? String(loc.label) : '' };
}

/** "22.572600, 88.363900" (6 decimals, as the pickers show them). */
export const formatCoords = (loc) => `${Number(loc.lat).toFixed(6)}, ${Number(loc.lng).toFixed(6)}`;

/** OpenStreetMap link with a marker at the point, zoomed to street level. */
export function osmUrl(loc) {
  const lat = Number(loc.lat).toFixed(6);
  const lng = Number(loc.lng).toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}
