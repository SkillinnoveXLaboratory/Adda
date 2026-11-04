import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

/** Loader for public (unauthenticated) endpoints. */
export function usePublic(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    api(path, { auth: false })
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => {
      alive = false;
    };
  }, [path, attempt]);
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, reload };
}
