import { forwardRef, useId, useRef, useState } from 'react';
import { cx, Icon } from './ui.jsx';
import { formatBytes } from '../lib/format.js';
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
        <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-500" role="alert">
          <Icon name="fa-solid fa-circle-exclamation" className="text-[10px]" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-azea-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ invalid, className = '', prefix, suffix, ...rest }, ref) {
  if (prefix || suffix) {
    return (
      <div className={cx('flex items-stretch overflow-hidden rounded-lg border bg-white transition-colors focus-within:ring-2', invalid ? 'border-rose-300 focus-within:ring-rose-200' : 'border-gray-200 focus-within:border-azea-purple focus-within:ring-azea-purple/20', className)}>
        {prefix && <span className="flex items-center border-r border-gray-100 bg-gray-50 px-2.5 text-xs font-semibold text-gray-500">{prefix}</span>}
        <input ref={ref} aria-invalid={invalid || undefined} className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-xs text-gray-700 placeholder-gray-400 focus:outline-none disabled:bg-gray-50" {...rest} />
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
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-xs font-semibold text-gray-700">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[11px] leading-relaxed text-azea-muted">{description}</p>}
      </div>
      <button
        id={id}
        name={name}
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-azea-purple' : 'bg-gray-200')}
      >
        <span className={cx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, name }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-gray-600">
      <input type="checkbox" name={name} checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300 text-azea-purple accent-[#705ec8] focus:ring-azea-purple/30" />
      {label}
    </label>
  );
}

/**
 * File picker with client-side checks (type + size) and an async uploader.
 * `onUpload(file)` must return the uploaded media `{ _id, originalName, size }`.
 */
export function FileUploader({ files, onChange, onUpload, max = 6, allowPdf = true, label = 'Attach files', hint, disabled, onError }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pick = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    setError(null);
    for (const file of list) {
      if (files.length >= max) {
        setError(`At most ${max} files`);
        break;
      }
      const problem = checkUpload(file, { allowPdf });
      if (problem) {
        setError(`${file.name}: ${problem}`);
        continue;
      }
      setBusy(true);
      try {
        const media = await onUpload(file);
        files = [...files, { ...media, originalName: media.originalName || file.name, size: media.size || file.size }];
        onChange(files);
      } catch (err) {
        setError(`${file.name}: ${err.message}`);
        onError?.(err);
      } finally {
        setBusy(false);
      }
    }
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || busy || files.length >= max}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-3.5 py-2 text-xs font-semibold text-gray-600 hover:border-azea-purple hover:bg-azea-purpleLight hover:text-azea-purple disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <Icon name="fa-solid fa-paperclip" />}
          {busy ? 'Uploading…' : label}
        </button>
        <span className="text-[11px] text-azea-muted">{hint || `${allowPdf ? 'JPG, PNG, WEBP or PDF' : 'JPG, PNG or WEBP'} · max 8 MB · up to ${max}`}</span>
      </div>
      <input ref={inputRef} type="file" className="hidden" multiple={max > 1} accept={allowPdf ? '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf' : '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'} onChange={pick} data-testid="file-input" />
      {error && (
        <p className="mt-1.5 text-[11px] font-medium text-rose-500" role="alert">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <li key={f._id} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2">
              <Icon name={f.mimeType === 'application/pdf' ? 'fa-regular fa-file-pdf text-rose-400' : 'fa-regular fa-file-image text-azea-purple'} />
              <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{f.originalName}</span>
              <span className="text-[11px] text-gray-400">{formatBytes(f.size)}</span>
              <button type="button" onClick={() => onChange(files.filter((x) => x._id !== f._id))} className="text-gray-400 hover:text-rose-500" aria-label={`Remove ${f.originalName}`}>
                <Icon name="fa-solid fa-xmark" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={cx('relative', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
        <Icon name="fa-solid fa-magnifying-glass" className="text-xs" />
      </span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="form-input pl-8" />
    </div>
  );
}

/** Billing-month picker (YYYY-MM). Works in every browser, unlike <input type="month">. */
export function PeriodSelect({ value, onChange, allLabel, past = 24, future = 2, className = '', ...rest }) {
  const now = new Date(Date.now() + 330 * 60000);
  const options = [];
  for (let i = future; i >= -past; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const v = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    options.push([v, d.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })]);
  }
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className} {...rest}>
      {allLabel && <option value="">{allLabel}</option>}
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </Select>
  );
}
