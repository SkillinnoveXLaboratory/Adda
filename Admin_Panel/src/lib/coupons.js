import { paiseToRupeesInput, rupeesToPaise, todayIST } from './format.js';

export const COUPON_CODE_RE = /^[A-Z0-9-]{3,20}$/;
export const COUPON_MAX_USES = 100000;

/** Coupon list status → badge. `used_up` = every allowed member has used it. */
export const COUPON_STATUS = {
  active: ['success', 'Active'],
  inactive: ['neutral', 'Off'],
  expired: ['neutral', 'Expired'],
  used_up: ['warning', 'Used up'],
};

/** Typed code → what the server stores: upper case, no spaces, only A–Z 0–9 and dashes kept. */
export const normalizeCouponCode = (v) => String(v || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '').slice(0, 20);

/** Editable form values for a coupon (or a blank one). */
export function couponForm(c) {
  return {
    code: c?.code || '',
    description: c?.description || '',
    discount: c ? paiseToRupeesInput(c.discountPaise) : '',
    maxUses: c ? String(c.maxUses) : '100',
    audience: c && !c.allMembers ? 'societies' : 'all',
    societies: c?.allMembers ? [] : (c?.societies || []).map((s) => ({ _id: s._id, name: s.name || 'Society', city: s.city })),
    active: c ? c.active !== false : true,
    expiresOn: c?.expiresAt ? todayIST(new Date(c.expiresAt)) : '',
  };
}

/**
 * Validates the form (mirrors the server) and builds the request body.
 * Returns { errors, body }; body is null while there are errors. `usedCount` comes from the coupon being edited.
 */
export function couponPayload(v, { editing = false, usedCount = 0, today = todayIST() } = {}) {
  const errors = {};
  const code = normalizeCouponCode(v.code);
  if (!COUPON_CODE_RE.test(code)) errors.code = 'Use 3 to 20 letters, numbers or dashes';
  if (String(v.description || '').trim().length > 200) errors.description = 'Keep the description under 200 characters';
  const discountPaise = rupeesToPaise(v.discount);
  if (discountPaise === null) errors.discount = 'Enter the discount in rupees (up to 2 decimals)';
  else if (discountPaise < 100) errors.discount = 'The discount must be at least ₹1';
  const uses = String(v.maxUses ?? '').trim();
  if (!/^\d{1,6}$/.test(uses) || Number(uses) < 1 || Number(uses) > COUPON_MAX_USES) errors.maxUses = `Enter a whole number from 1 to ${COUPON_MAX_USES.toLocaleString('en-IN')}`;
  else if (Number(uses) < usedCount) errors.maxUses = `${usedCount} members already used it — allow at least ${usedCount}`;
  if (v.audience === 'societies' && !v.societies?.length) errors.societies = 'Choose at least one society';
  if (v.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(v.expiresOn)) errors.expiresOn = 'Choose a valid date';
  else if (v.expiresOn && !editing && v.expiresOn < today) errors.expiresOn = 'The last day can’t be in the past';
  if (Object.keys(errors).length) return { errors, body: null };
  const body = {
    code,
    description: String(v.description || '').trim() || undefined,
    discountPaise,
    maxUses: Number(uses),
    societyIds: v.audience === 'societies' ? v.societies.map((s) => s._id) : [],
    active: Boolean(v.active),
  };
  if (v.expiresOn) body.expiresOn = v.expiresOn;
  else if (editing) body.expiresOn = null;
  return { errors, body };
}
