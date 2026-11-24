import { parsePercent } from './validation.js';

/**
 * Per-vendor pricing (mirror of offerPricing in Backend/server.js — the server always recomputes; this is a preview):
 * Members see and pay the vendor's price; NIVASA's commission is taken OUT of it (members never see it). The optional
 * member discount is a share OF the commission, paid by NIVASA.
 *   commission  = round(vendorPrice × commissionBps / 10000)
 *   memberPrice = vendorPrice
 *   discount    = round(commission × discountBps / 10000)
 * ₹1,000 at 20% → members pay ₹1,000 (₹900 with a 50% discount); the vendor gets ₹800; NIVASA keeps ₹200 (₹100 after the discount).
 */

/** Example vendor price used on the vendor's Pricing card (₹1,000). */
export const EXAMPLE_PRICE_PAISE = 100_000;

export const PRICING_RATE_ERROR = 'Enter a number from 0 to 100 with up to 2 decimals, e.g. 20 or 12.5';

/** Typed rate → number (0–100, ≤2 decimals), or null when invalid. */
export const parseRate = (input) => parsePercent(input, { max: 100 });

/** Percent (≤2 decimals) → basis points, like the server (Math.round(percent × 100)). */
export const toBps = (percent) => Math.round(Number(percent || 0) * 100);

/** Every figure for a vendor price at the given rates (integer paise). */
export function pricingExample(vendorPricePaise, commissionPercent, memberDiscountPercent) {
  const commissionPaise = Math.round((vendorPricePaise * toBps(commissionPercent)) / 10_000);
  const memberPricePaise = vendorPricePaise;
  const discountPaise = Math.round((commissionPaise * toBps(memberDiscountPercent)) / 10_000);
  return {
    vendorPricePaise,
    commissionPaise,
    memberPricePaise,
    discountPaise,
    payableWithDiscountPaise: memberPricePaise - discountPaise,
    nivasaKeepsPaise: commissionPaise - discountPaise,
    vendorGetsPaise: vendorPricePaise - commissionPaise,
  };
}

/** Validates the two rate inputs. Returns { errors, body } — body null while invalid; only changed rates are sent. */
export function pricingPayload(values, saved = {}) {
  const errors = {};
  const commissionPercent = parseRate(values.commissionPercent);
  const memberDiscountPercent = parseRate(values.memberDiscountPercent);
  if (commissionPercent === null) errors.commissionPercent = PRICING_RATE_ERROR;
  if (memberDiscountPercent === null) errors.memberDiscountPercent = PRICING_RATE_ERROR;
  if (Object.keys(errors).length) return { errors, body: null };
  const body = {};
  if (commissionPercent !== Number(saved.commissionPercent ?? 0)) body.commissionPercent = commissionPercent;
  if (memberDiscountPercent !== Number(saved.memberDiscountPercent ?? 0)) body.memberDiscountPercent = memberDiscountPercent;
  return { errors, body };
}

/** "20%" / "12.5%" */
export const formatPercent = (n) => `${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
