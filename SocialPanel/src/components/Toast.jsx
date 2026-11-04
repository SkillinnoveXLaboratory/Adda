import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { cx, Icon } from './ui.jsx';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone, message, ms) => {
      const id = ++idRef.current;
      setToasts((t) => [...t.slice(-3), { id, tone, message }]);
      setTimeout(() => dismiss(id), ms ?? (tone === 'error' ? 6500 : 4000));
      return id;
    },
    [dismiss],
  );
  const api = useMemo(() => ({ success: (m, ms) => push('success', m, ms), error: (m, ms) => push('error', m, ms), info: (m, ms) => push('info', m, ms) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:top-5 sm:items-end" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            data-testid={`toast-${t.tone}`}
            className={cx(
              'pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border bg-white px-4 py-3 text-xs shadow-lg',
              t.tone === 'error' ? 'border-rose-100' : t.tone === 'success' ? 'border-emerald-100' : 'border-gray-100',
            )}
          >
            <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] text-white', t.tone === 'error' ? 'bg-azea-orange' : t.tone === 'success' ? 'bg-azea-green' : 'bg-azea-purple')}>
              <Icon name={t.tone === 'error' ? 'fa-solid fa-xmark' : t.tone === 'success' ? 'fa-solid fa-check' : 'fa-solid fa-info'} />
            </span>
            <p className="min-w-0 flex-1 break-words font-medium leading-relaxed text-gray-700">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} className="text-gray-400 hover:text-gray-600" aria-label="Dismiss notification">
              <Icon name="fa-solid fa-xmark" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
