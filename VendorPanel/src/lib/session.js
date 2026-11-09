/**
 * Session store: tokens + profile kept in memory and mirrored to sessionStorage (tab-scoped, cleared on
 * sign-out / browser close). Never localStorage, never a password. Listeners are notified on every change.
 */
const KEY = 'nivasa.vendor.session';

function safeRead(storage) {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeWrite(storage, value) {
  try {
    if (!storage) return;
    if (value) storage.setItem(KEY, JSON.stringify(value));
    else storage.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode) — memory copy still works for this tab */
  }
}

export function createSessionStore(storage = typeof window !== 'undefined' ? window.sessionStorage : undefined) {
  let state = safeRead(storage);
  const listeners = new Set();
  const emit = (reason) => listeners.forEach((fn) => fn(state, reason));

  return {
    get: () => state,
    get accessToken() {
      return state?.accessToken || null;
    },
    get refreshToken() {
      return state?.refreshToken || null;
    },
    /** Replace the whole session (sign-in / sign-up). */
    set(next, reason = 'set') {
      state = next ? { ...next } : null;
      safeWrite(storage, state);
      emit(reason);
    },
    /** Merge fields (profile refresh, token rotation). */
    patch(fields, reason = 'patch') {
      if (!state) return;
      state = { ...state, ...fields };
      safeWrite(storage, state);
      emit(reason);
    },
    setTokens(accessToken, refreshToken) {
      this.patch({ accessToken, refreshToken }, 'tokens');
    },
    clear(reason = 'logout') {
      state = null;
      safeWrite(storage, null);
      emit(reason);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const session = createSessionStore();
