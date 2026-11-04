import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Session tokens live in the device keystore (SecureStore). The web preview falls back to sessionStorage. */
const isWeb = Platform.OS === 'web';

export async function getItem(key) {
  try {
    if (isWeb) return globalThis.sessionStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key, value) {
  try {
    if (isWeb) return globalThis.sessionStorage?.setItem(key, value);
    return await SecureStore.setItemAsync(key, value);
  } catch {
    // Storage failure only means the user must sign in again next launch.
  }
}

export async function removeItem(key) {
  try {
    if (isWeb) return globalThis.sessionStorage?.removeItem(key);
    return await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}
