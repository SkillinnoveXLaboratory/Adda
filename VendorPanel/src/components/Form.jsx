import { forwardRef, useId, useRef, useState } from 'react';
import { cx, Icon, Spinner } from './ui.jsx';
import { mediaHref, uploadFile } from '../lib/api.js';
import { checkUpload } from '../lib/validation.js';

export function Field({ label, hint, error, children, className = '', required, htmlFor }) {
  return (
    <div className={className}>
      {label && (
        <label className="form-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-azea-orange">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 flex items-start gap-1 text-[11px] font-medium text-rose-600" role="alert">
          <Icon name="fa-solid fa-circle-exclamation" className="mt-0.5 text-[10px]" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] leading-relaxed text-azea-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ invalid, className = '', prefix, suffix, ...rest }, ref) {
  if (prefix || suffix) {
    return (
      <div className={cx('flex min-h-[40px] items-stretch overflow-hidden rounded-lg border bg-white transition-colors focus-within:ring-2', invalid ? 'border-rose-300 focus-within:ring-rose-200' : 'border-gray-200 focus-within:border-azea-purple focus-within:ring-azea-purple/20', className)}>
        {prefix && <span className="flex items-center border-r border-gray-100 bg-gray-50 px-2.5 text-xs font-semibold text-gray-500">{prefix}</span>}
        <input ref={ref} aria-invalid={invalid || undefined} className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-[13px] text-gray-700 placeholder-gray-400 focus:outline-none disabled:bg-gray-50" {...rest} />
        {suffix && <span className="flex items-center px-2.5 text-xs text-gray-400">{suffix}</span>}
      </div>
    );
  }
  return <input ref={ref} aria-invalid={invalid || undefined} className={cx('form-input', invalid && 'form-input-error', className)} {...rest} />;
});

export const Select = forwardRef(function Select({ invalid, className = '', children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} aria-invalid={invalid || undefined} className={cx('form-input appearance-none pr-8', invalid && 'form-input-error', className)} {...rest}>
        {children}
      </select>
      <Icon name="fa-solid fa-chevron-down" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-gray-400" />
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ invalid, className = '', ...rest }, ref) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cx('form-input resize-y leading-relaxed', invalid && 'form-input-error', className)} {...rest} />;
});

/** Labelled control bound to a useForm field. */
export function FormField({ label, hint, required, field, as = 'input', className = '', children, ...rest }) {
  const id = useId();
  const { error, ...bind } = field;
  const Comp = as === 'select' ? Select : as === 'textarea' ? Textarea : Input;
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} htmlFor={id}>
      <Comp id={id} invalid={Boolean(error)} {...bind} {...rest}>
        {children}
      </Comp>
    </Field>
  );
}

export function Toggle({ checked, onChange, label, description, disabled, name }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-xs font-semibold text-gray-700">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[11px] leading-relaxed text-azea-muted">{description}</p>}
      </div>
      <button id={id} name={name} type="button" role="switch" aria-checked={Boolean(checked)} disabled={disabled} onClick={() => onChange(!checked)} className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg disabled:opacity-50">
        <span className={cx('relative inline-flex h-5 w-9 items-center rounded-full transition-colors', checked ? 'bg-azea-purple' : 'bg-gray-200')}>
          <span className={cx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
        </span>
      </button>
    </div>
  );
}

/** Segmented choice (radio group) — e.g. For rent / For sale, price type. */
export function Segmented({ options, value, onChange, label, name }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            name={name}
            data-testid={name ? `${name}-${o.value || 'none'}` : undefined}
            onClick={() => onChange(o.value)}
            className={cx('min-h-[40px] rounded-lg border px-3.5 text-xs font-semibold transition-colors', on ? 'border-azea-purple bg-azea-purpleLight text-azea-purpleDark' : 'border-gray-200 bg-white text-gray-600 hover:border-violet-300')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Photo picker that uploads each chosen file to POST /uploads (purpose property | service | kyc) and keeps the
 * media objects. `value` = [{ _id, url, mimeType, originalName }]. Images show as thumbnails.
 */
export function PhotoUploader({ value, onChange, purpose, max = 6, allowPdf = false, label = 'Add photos', hint, error, testId, disabled }) {
  const inputRef = useRef(null);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const pick = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    setProblem(null);
    let current = value;
    for (const file of list) {
      if (current.length >= max) {
        setProblem(max === 1 ? 'Only one file here — remove the current one first' : `At most ${max} files`);
        break;
      }
      const bad = checkUpload(file, { allowPdf });
      if (bad) {
        setProblem(`${file.name}: ${bad}`);
        continue;
      }
      setBusy(true);
      try {
        const media = await uploadFile(file, purpose);
        current = [...current, { ...media, originalName: media.originalName || file.name, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null }];
        onChange(current);
      } catch (err) {
        setProblem(`${file.name}: ${err.message}`);
      } finally {
        setBusy(false);
      }
    }
  };
  const full = value.length >= max;
  return (
    <div data-testid={testId}>
      <div className="flex flex-wrap gap-3">
        {value.map((m) => {
          const src = m.preview || (m.mimeType?.startsWith('image/') ? mediaHref(m.url) : null);
          return (
            <div key={m._id} className="relative h-24 w-28 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
              {src ? (
                <img src={src} alt={m.originalName || 'Uploaded photo'} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-[10px] text-gray-500">
                  <Icon name="fa-regular fa-file-pdf" className="text-lg text-rose-400" />
                  <span className="w-full truncate">{m.originalName || 'Document'}</span>
                </span>
              )}
              <button type="button" onClick={() => onChange(value.filter((x) => x._id !== m._id))} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-white" aria-label={`Remove ${m.originalName || 'photo'}`} disabled={disabled}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900/60">
                  <Icon name="fa-solid fa-xmark" className="text-[10px]" />
                </span>
              </button>
            </div>
          );
        })}
        {!full && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            className={cx('flex h-24 w-28 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-gray-50/60 px-2 text-center text-[11px] font-semibold text-gray-600 transition-colors hover:border-azea-purple hover:bg-azea-purpleLight hover:text-azea-purple disabled:cursor-not-allowed disabled:opacity-60', error ? 'border-rose-300' : 'border-gray-300')}
          >
            {busy ? <Spinner className="h-4 w-4" /> : <Icon name="fa-solid fa-camera" className="text-base" />}
            <span>{busy ? 'Uploading…' : label}</span>
          </button>
        )}
      </div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input id={id} ref={inputRef} type="file" className="sr-only" tabIndex={-1} multiple={max > 1} accept={allowPdf ? '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf' : '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'} onChange={pick} data-testid={testId ? `${testId}-input` : 'file-input'} />
      <p className="mt-1.5 text-[11px] text-azea-muted">{hint || `${allowPdf ? 'JPG, PNG, WEBP or PDF' : 'JPG, PNG or WEBP'} · max 8 MB · up to ${max}`}</p>
      {(problem || error) && (
        <p className="mt-1 text-[11px] font-medium text-rose-600" role="alert">
          {problem || error}
        </p>
      )}
    </div>
  );
}

/** Password input with show/hide. */
export const PasswordInput = forwardRef(function PasswordInput({ invalid, className = '', ...rest }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={show ? 'text' : 'password'} invalid={invalid} className={cx('pr-11', className)} {...rest} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 hover:text-azea-purple" aria-label={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} className="text-xs" />
      </button>
    </div>
  );
});
