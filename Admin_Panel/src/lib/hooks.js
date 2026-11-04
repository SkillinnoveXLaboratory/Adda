import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Data loader for pages. Keeps previous data while reloading (no flicker), exposes reload().
 * `fn` receives an AbortSignal. Re-runs when `deps` change.
 */
export function useQuery(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null, reloading: false });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const run = useCallback(async () => {
    const id = ++seq.current;
    // Keep showing the previous rows (dimmed via `reloading`) while new data loads.
    setState((s) => ({ ...s, loading: s.data === null, reloading: s.data !== null, error: null }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, loading: false, error: null, reloading: false });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, reloading: false, error }));
    }
  }, []);

  useEffect(() => {
    run();
    return () => {
      seq.current += 1; // ignore responses that arrive after unmount / deps change
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: run, setData };
}

/**
 * Paged list: `fetcher(params)` gets filters + page; page resets to 1 when filters change.
 * Returns the useQuery result plus { page, setPage }.
 */
export function usePaged(fetcher, filters = {}, limit = 20) {
  const key = JSON.stringify(filters);
  const [state, setState] = useState({ key, page: 1 });
  const page = state.key === key ? state.page : 1;
  const setPage = useCallback((p) => setState({ key, page: p }), [key]);
  const q = useQuery(() => fetcher({ ...filters, page, limit }), [key, page]);
  return { ...q, page, setPage, limit };
}

/** Debounced value (search boxes). */
export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Wraps an async action with a busy flag and toast feedback. Prevents double submits.
 * Returns [run, busy]. run(...args) resolves to the action result or undefined on failure.
 */
export function useAction(action, { success, onDone, toast } = {}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const run = useCallback(
    async (...args) => {
      if (busyRef.current) return undefined;
      busyRef.current = true;
      setBusy(true);
      try {
        const result = await action(...args);
        if (success && toast) toast.success(typeof success === 'function' ? success(result) : success);
        await onDone?.(result);
        return result;
      } catch (err) {
        if (err?.code !== 'CANCELLED') toast?.error(err?.message || 'Something went wrong. Please try again.');
        return undefined;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
     
    [action, success, onDone, toast],
  );
  return [run, busy];
}

/** Simple form state helper. */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const set = useCallback((name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);
  const bind = (name) => ({
    name,
    value: values[name] ?? '',
    onChange: (e) => set(name, e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e),
    error: errors[name],
  });
  return { values, setValues, errors, setErrors, set, bind, reset: () => (setValues(initial), setErrors({})) };
}
