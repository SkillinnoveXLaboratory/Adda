import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from '../lib/api';

/**
 * Loads an API resource. Re-fetches silently when the screen regains focus (so lists stay fresh after
 * creating/editing on another screen) and supports pull-to-refresh.
 */
export function useApi(path, { query, enabled = true, refetchOnFocus = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !!(enabled && path) });
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const key = `${path}?${JSON.stringify(query || {})}`;
  const firstFocus = useRef(true);

  const run = useCallback(
    async (mode = 'load') => {
      if (!enabled || !path) return;
      if (mode === 'refresh') setRefreshing(true);
      else if (mode === 'load') setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await api(path, { query });
        if (mounted.current) setState({ data, error: null, loading: false });
      } catch (error) {
        if (mounted.current) setState((s) => ({ data: mode === 'silent' ? s.data : s.data, error, loading: false }));
      } finally {
        if (mounted.current) setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, enabled],
  );

  useEffect(() => {
    mounted.current = true;
    run('load');
    return () => {
      mounted.current = false;
    };
  }, [run]);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      if (refetchOnFocus) run('silent');
    }, [run, refetchOnFocus]),
  );

  return {
    ...state,
    refreshing,
    reload: () => run('load'),
    refresh: () => run('refresh'),
    setData: (updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })),
  };
}

/** Wraps an async action with busy state and toast-friendly error capture. */
export function useAction(fn) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const run = useCallback(
    async (...args) => {
      if (busyRef.current) return undefined; // prevents double submits
      busyRef.current = true;
      setBusy(true);
      try {
        return await fn(...args);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [fn],
  );
  return [run, busy];
}
