/** Map location helpers (skills/location-maps). A location is `{ lat, lng, label? }` in the API. */

export const INDIA_CENTER = { lat: 22.5, lng: 79 };
export const LABEL_MAX = 200;

/** Read-only display with 6 decimals ('' when not a number). */
export const formatCoord = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(6) : '');

export const isValidLatLng = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/** Normalised location (6 decimals, label trimmed to 200) or null when the coordinates are invalid. */
export function makeLocation(lat, lng, label) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!isValidLatLng(la, ln)) return null;
  const l = String(label ?? '').trim().slice(0, LABEL_MAX);
  return { lat: round6(la), lng: round6(ln), label: l || null };
}

/** API body value: `{ lat, lng, label? }`, or null to clear. */
export function locationPayload(v) {
  const loc = v ? makeLocation(v.lat, v.lng, v.label) : null;
  if (!loc) return null;
  return loc.label ? loc : { lat: loc.lat, lng: loc.lng };
}

/** Same point (to 6 decimals) and same label. */
export function sameLocation(a, b) {
  const x = a ? locationPayload(a) : null;
  const y = b ? locationPayload(b) : null;
  if (!x || !y) return !x && !y;
  return x.lat === y.lat && x.lng === y.lng && (x.label || null) === (y.label || null);
}

/** Browser geolocation error → a sentence the user can act on. */
export function geolocationMessage(err) {
  if (!err) return null;
  if (err.code === 1) return 'Location permission was denied. Allow location for this site in your browser settings, or search for the address / drag the pin instead.';
  if (err.code === 2) return 'Your device could not find its location. Search for the address or drag the pin instead.';
  if (err.code === 3) return 'Finding your location took too long. Try again, or search for the address instead.';
  if (err.code === 'UNSUPPORTED') return 'This browser cannot share your location. Search for the address or drag the pin instead.';
  return 'Could not get your location. Search for the address or drag the pin instead.';
}

/** Address-search error → message (503 = the map search service is down; the pin still works). */
export function geocodeMessage(err) {
  if (!err) return null;
  if (err.status === 503 || err.code === 'GEOCODER_UNAVAILABLE') return 'Address search is unavailable right now. Use your current location or drag the pin on the map instead.';
  if (err.status === 0) return 'Cannot reach the server for address search. Use your current location or drag the pin instead.';
  if (err.status === 429) return 'Too many searches. Wait a moment and try again.';
  if (err.status === 400) return null; // query too short — just no suggestions
  return err.message || 'Address search failed. Drag the pin instead.';
}
