import * as Location from 'expo-location';
import { api } from './api';

/** A location as the API takes it: { lat, lng, label? } — lat −90…90, lng −180…180, label ≤ 200 chars. */
export const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;
export const validLatLng = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
export const toApiLocation = (loc) => (loc && validLatLng(loc.lat, loc.lng) ? { lat: round6(loc.lat), lng: round6(loc.lng), ...(loc.label ? { label: String(loc.label).slice(0, 200) } : {}) } : null);
export const coordsText = (loc) => (loc ? `${Number(loc.lat).toFixed(6)}, ${Number(loc.lng).toFixed(6)}` : '');

/**
 * The device position (foreground permission only). Throws an Error with a message people can act on:
 * denied → explains and points to search; services off / timeout → says so.
 */
export async function currentPosition() {
  let perm;
  try {
    perm = await Location.requestForegroundPermissionsAsync();
  } catch {
    throw new Error('Location is not available on this device. Search for the address instead.');
  }
  if (perm.status !== 'granted') {
    throw new Error('Location permission was not given. Search for the address instead, or allow location for NIVASA in your phone settings.');
  }
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
    ]);
    return { lat: round6(pos.coords.latitude), lng: round6(pos.coords.longitude) };
  } catch {
    throw new Error('Could not get your location. Turn on location (GPS) and try again, or search for the address.');
  }
}

/** Address search through the server proxy (never OpenStreetMap directly). → [{label,lat,lng}] */
export async function searchPlaces(q) {
  const r = await api('/public/geocode', { auth: false, query: { q } });
  return r?.items || [];
}

/** Best-effort address for a point; null when the service is unavailable. */
export async function placeName(lat, lng) {
  try {
    const r = await api('/public/geocode/reverse', { auth: false, query: { lat: round6(lat), lng: round6(lng) } });
    return r?.label || null;
  } catch {
    return null;
  }
}
