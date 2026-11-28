/**
 * Cashfree Easy Split "line of business" (sent as kyc_details.business_type — Cashfree refuses a vendor without it).
 * Exact strings; same list as CF_LINES_OF_BUSINESS in Backend/server.js and Admin_Panel/src/lib/vendorOnboarding.js.
 */
export const CF_LINES_OF_BUSINESS = [
  'Professional Services (Doctors, Lawyers, Architects, CAs, and other Professionals)',
  'Retail and Shopping',
  'Real Estate, Housing, Rentals',
  'Grocery',
  'Food and Beverages',
  'E-commerce',
  'Readymade',
  'Pharmacy',
  'Health care',
  'Education',
  'Travel and Hospitality',
  'Logistics',
  'Utilities',
  'Telecom',
  'Jewellery',
  'Pan shop',
  'Digital Goods',
  'SaaS',
  'B2B',
  'Society/Trust/Club/Association',
  'Miscellaneous',
];

/** Friendlier label for the picker; the value sent is always the exact Cashfree string. */
export const lineOfBusinessLabel = (v) => (v?.startsWith('Professional Services') ? 'Home & professional services (plumber, electrician, cleaning, doctor, CA…)' : v === 'Readymade' ? 'Readymade garments' : v === 'Real Estate, Housing, Rentals' ? 'Real estate, housing & rentals' : v || '');

export const GSTIN_RX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** GSTIN problem (null when blank or valid). A GSTIN carries the PAN in characters 3–12. */
export function gstinProblem(gstin, pan) {
  const g = String(gstin ?? '').trim().toUpperCase();
  if (!g) return null;
  if (!GSTIN_RX.test(g)) return 'GSTIN is 15 characters, e.g. 27ABCDE1234F1Z5';
  const p = String(pan ?? '').trim().toUpperCase();
  if (p.length === 10 && g.slice(2, 12) !== p) return 'This GSTIN belongs to a different PAN — characters 3 to 12 must be your PAN';
  return null;
}
