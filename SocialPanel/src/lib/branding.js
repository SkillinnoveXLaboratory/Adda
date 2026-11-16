/** Society branding helpers (skills/society-branding). */

/** Two letters for the logo tile: "Green Meadows CHS" → "GM", "Sunrise" → "SU". */
export function societyInitials(name) {
  const words = String(name || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 'S';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Returns an error message or null. PNG / JPG / WEBP, at most 2 MB. */
export function checkLogoFile(file) {
  if (!file) return 'Choose an image';
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  if (!LOGO_TYPES.includes(file.type) && !['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'The logo must be a PNG, JPG or WEBP image';
  if (file.size > LOGO_MAX_BYTES) return `The logo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Use an image up to 2 MB.`;
  return null;
}
