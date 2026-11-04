/**
 * Public runtime configuration. EXPO_PUBLIC_* values are bundled into the app, so never put secrets here.
 * Production backend: https://adda.skillinnovex.in. Override for local testing with EXPO_PUBLIC_API_URL
 * (e.g. http://192.168.1.20:3013 for a phone on the same Wi-Fi, http://10.0.2.2:3013 for the Android emulator).
 */
const raw = (process.env.EXPO_PUBLIC_API_URL || 'https://adda.skillinnovex.in').trim();

export const API_URL = raw.replace(/\/+$/, '');
export const API_BASE = `${API_URL}/api/v1`;
export const REQUEST_TIMEOUT_MS = 20000;
