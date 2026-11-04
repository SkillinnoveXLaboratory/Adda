import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, cx, Icon } from './ui.jsx';
import { Field, Textarea } from './Form.jsx';

let openCount = 0;
function useBodyLock(open) {
  useEffect(() => {
    if (!open) return undefined;
    openCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      openCount -= 1;
      if (openCount <= 0) document.body.style.overflow = '';
    };
  }, [open]);
}

/** Esc closes (unless busy), focus moves into the dialog and returns to the opener on close. */
function useDialogBehaviour(open, onClose, busy, panelRef) {
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const onKey = (e) => {
      // Only the top-most dialog reacts.
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs.length && dialogs[dialogs.length - 1] !== panelRef.current) return;
      if (e.key === 'Escape' && !latest.current.busy) {
        e.stopPropagation();
        latest.current.onClose?.();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector('[data-autofocus],input:not([type=hidden]):not([disabled]),select,textarea') || panelRef.current;
      el?.focus?.();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
      if (opener && opener.focus && document.contains(opener)) opener.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', busy = false, icon }) {
  const panelRef = useRef(null);
  const titleId = useId();
  useBodyLock(open);
  useDialogBehaviour(open, onClose, busy, panelRef);
  if (!open) return null;
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-gray-900/40 backdrop-blur-[1px]" onClick={() => !busy && onClose?.()} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={cx('relative flex max-h-[92vh] w-full animate-pop-in flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-xl', width)}>
        <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
          {icon && (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-azea-purpleLight text-azea-purple">
              <Icon name={icon} className="text-xs" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-sm font-bold text-gray-800">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[11px] text-azea-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={() => !busy && onClose?.()} disabled={busy} className="-mr-1 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-40" aria-label="Close dialog">
            <Icon name="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3 sm:rounded-b-xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, busy = false, width = 'max-w-xl' }) {
  const panelRef = useRef(null);
  const titleId = useId();
  useBodyLock(open);
  useDialogBehaviour(open, onClose, busy, panelRef);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-gray-900/30" onClick={() => !busy && onClose?.()} aria-hidden="true" />
      <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={cx('relative flex h-full w-full animate-slide-in-right flex-col bg-white shadow-2xl outline-none', width)}>
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-100 px-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-sm font-bold text-gray-800">
              {title}
            </h2>
            {subtitle && <p className="truncate text-[11px] text-azea-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={() => !busy && onClose?.()} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-600" aria-label="Close panel">
            <Icon name="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/** Confirmation for a destructive or important action. onConfirm may be async; the dialog stays busy until it settles. */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'danger', busy = false, icon }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      busy={busy}
      icon={icon || (tone === 'danger' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-question')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-xs leading-relaxed text-gray-600">{message}</div>
    </Modal>
  );
}

/** Asks for a reason (required by the API for reject / suspend / remove / reverse / void / cancel). */
export function ReasonDialog({ open, onClose, onSubmit, title, message, label = 'Reason', placeholder = 'Explain the reason (visible in the audit log)…', confirmLabel = 'Submit', tone = 'danger', required = true, minLength = 3, busy = false }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);
  const submit = (e) => {
    e?.preventDefault();
    const r = reason.trim();
    if (required && r.length < minLength) {
      setError(r.length ? `Please write at least ${minLength} characters` : 'A reason is required');
      return;
    }
    onSubmit(r);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      busy={busy}
      icon={tone === 'danger' ? 'fa-solid fa-triangle-exclamation' : 'fa-regular fa-pen-to-square'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={submit} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        {message && <div className="text-xs leading-relaxed text-gray-600">{message}</div>}
        <Field label={`${label}${required ? '' : ' (optional)'}`} error={error}>
          <Textarea name="reason" rows={3} value={reason} maxLength={500} placeholder={placeholder} onChange={(e) => (setReason(e.target.value), setError(null))} invalid={Boolean(error)} />
        </Field>
      </form>
    </Modal>
  );
}
