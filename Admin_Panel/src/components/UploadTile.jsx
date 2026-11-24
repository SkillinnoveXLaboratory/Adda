import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { checkUpload } from '../lib/validation.js';
import { cx, Icon } from './ui.jsx';

const isBlob = (u) => typeof u === 'string' && u.startsWith('blob:');

/**
 * One file slot for admin vendor uploads (POST /platform/vendors/uploads, purpose kyc | vendor_logo).
 * value = { _id, name, mimeType, preview?, sig? } | null. Shows a thumbnail (image) or PDF tile, Replace and Remove.
 * The thumbnail is a local object URL of the chosen file (private KYC files are never re-fetched for it).
 */
export function UploadTile({ label, value, onChange, purpose, allowPdf = true, error, testId, name, onBusyChange, disabled }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState(null);
  const current = useRef(value);
  current.current = value;
  // Free the last local preview when the tile goes away.
  useEffect(() => () => isBlob(current.current?.preview) && URL.revokeObjectURL(current.current.preview), []);

  const replace = (next) => {
    if (isBlob(value?.preview) && value.preview !== next?.preview) URL.revokeObjectURL(value.preview);
    onChange(next);
  };
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = checkUpload(file, { allowPdf });
    if (problem) return setLocalError(problem);
    setLocalError(null);
    setBusy(true);
    onBusyChange?.(true);
    try {
      const media = await api.upload('/platform/vendors/uploads', file, { purpose });
      const pdf = (media.mimeType || file.type) === 'application/pdf';
      replace({ _id: media._id, name: file.name, mimeType: media.mimeType || file.type, preview: pdf ? null : URL.createObjectURL(file), sig: `${file.name}:${file.size}:${file.lastModified}` });
    } catch (err) {
      setLocalError(err?.message || 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  const shown = localError || error;
  const pdf = value?.mimeType === 'application/pdf';
  return (
    <div className="min-w-0" data-testid={testId}>
      <p className="form-label">{label}</p>
      <button
        type="button"
        name={name}
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        className={cx(
          'group relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border bg-gray-50 text-gray-400 transition-colors hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed',
          shown ? 'border-rose-300' : value ? 'border-gray-200' : 'border-dashed border-gray-300',
        )}
        aria-label={value ? `Replace ${label}` : `Upload ${label}`}
      >
        {busy ? (
          <>
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand border-r-transparent" />
            <span className="text-[11px]">Uploading…</span>
          </>
        ) : value ? (
          pdf || !value.preview ? (
            <span className="flex flex-col items-center gap-1.5 px-2 text-center">
              <Icon name={pdf ? 'fa-regular fa-file-pdf text-rose-500' : 'fa-regular fa-file-image text-brand'} className="text-2xl" />
              <span className="text-[11px] font-semibold text-gray-600">{pdf ? 'PDF document' : 'Uploaded'}</span>
            </span>
          ) : (
            <img src={value.preview} alt={label} className="h-full w-full object-cover" />
          )
        ) : (
          <>
            <Icon name="fa-solid fa-cloud-arrow-up" className="text-xl" />
            <span className="text-[11px] font-semibold">Choose file</span>
            <span className="text-[10px]">{allowPdf ? 'JPG, PNG, WEBP or PDF' : 'JPG, PNG or WEBP'} · max 8 MB</span>
          </>
        )}
      </button>
      {value && !busy && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500" title={value.name}>
            {value.name || 'Uploaded file'}
          </span>
          <button type="button" className="link shrink-0 text-[11px]" onClick={() => inputRef.current?.click()} disabled={disabled}>
            Replace
          </button>
          <button type="button" className="shrink-0 text-[11px] text-gray-400 hover:text-rose-500" onClick={() => replace(null)} disabled={disabled} aria-label={`Remove ${label}`}>
            Remove
          </button>
        </div>
      )}
      {shown && (
        <p className="mt-1 flex items-start gap-1 text-[11px] font-medium text-rose-500" role="alert">
          <Icon name="fa-solid fa-circle-exclamation" className="mt-0.5 text-[10px]" />
          {shown}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={allowPdf ? '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf' : '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'}
        onChange={pick}
        data-testid={testId ? `${testId}-input` : undefined}
      />
    </div>
  );
}
