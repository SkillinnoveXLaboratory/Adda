import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Data loader for pages. Keeps previous data while reloading (no flicker), exposes reload().
 * Re-runs when `deps` change.
 */
export function useQuery(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null, reloading: false });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const run = useCallback(async () => {
    const id = ++seq.current;
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
 * Wraps an async action with a busy flag and toast feedback. Prevents double submits (a second click while
 * busy is ignored, so a double-click sends one request). Returns [run, busy].
 */
export function useAction(action, { success, onDone, toast, onError } = {}) {
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
        if (onError) onError(err);
        else toast?.error(err?.message || 'Something went wrong. Please try again.');
        return undefined;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [action, success, onDone, toast, onError],
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
  const bind = (name, transform) => ({
    name,
    value: values[name] ?? '',
    onChange: (e) => {
      const raw = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
      set(name, transform ? transform(raw) : raw);
    },
    error: errors[name],
  });
  return { values, setValues, errors, setErrors, set, bind };
}

/** The document title for a page. */
export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Nivasa Vendor` : 'Nivasa Vendor';
  }, [title]);
}
