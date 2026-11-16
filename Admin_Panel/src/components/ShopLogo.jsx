import { useState } from 'react';
import { mediaHref } from '../lib/api.js';
import { cx, Icon } from './ui.jsx';

/** A shop / society logo, or a neutral placeholder when there is none or the image can't be loaded. */
export function ShopLogo({ url, alt = '', size = 'sm', icon = 'fa-solid fa-store', fit = 'cover', testId }) {
  const [failed, setFailed] = useState(null);
  const box = size === 'lg' ? 'h-14 w-14 rounded-xl' : 'h-8 w-8 rounded-lg';
  if (!url || failed === url) {
    return (
      <span className={cx('flex shrink-0 items-center justify-center border border-dashed border-gray-200 bg-gray-50 text-gray-300', box)} title={url ? 'Logo could not be loaded' : 'No logo uploaded'} aria-hidden={alt ? undefined : 'true'}>
        <Icon name={icon} className={size === 'lg' ? 'text-lg' : 'text-[11px]'} />
      </span>
    );
  }
  return <img src={mediaHref(url)} alt={alt} onError={() => setFailed(url)} loading="lazy" className={cx('shrink-0 border border-gray-100 bg-white', fit === 'contain' ? 'object-contain' : 'object-cover', box)} data-testid={testId} />;
}
