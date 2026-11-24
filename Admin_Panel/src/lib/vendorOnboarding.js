/**
 * Master Admin "Add vendor" + "Enter KYC details" (skills/admin-vendor-onboarding). Pure helpers: client-side checks
 * that mirror the server's zod rules (the server stays the authority), request bodies, and server error → field mapping.
 */
import { isAadhaar, isBankAccount, isEmail, isIfsc, isIndianMobile, isPan, kycDigits, normalizePhone, passwordProblems } from './validation.js';
import { parseRate, PRICING_RATE_ERROR } from './pricing.js';

export const KYC_DOC_FIELDS = [
  ['panPhoto', 'PAN card photo'],
  ['aadhaarFront', 'Aadhaar · front'],
  ['aadhaarBack', 'Aadhaar · back'],
];

/** A blank KYC form. Documents are upload objects `{ _id, name, mimeType, preview?, sig? }` or null. */
export const emptyKyc = () => ({
  businessName: '',
  businessType: 'individual',
  city: '',
  address: '',
  pan: '',
  aadhaar: '',
  bankAccountHolder: '',
  bankAccountNumber: '',
  bankAccountConfirm: '',
  bankIfsc: '',
  bankName: '',
  panPhoto: null,
  aadhaarFront: null,
  aadhaarBack: null,
  vendorConsent: false,
  approve: false,
});

const blank = (v) => String(v ?? '').trim() === '';
const lenBetween = (v, min, max) => {
  const n = String(v ?? '').trim().length;
  return n >= min && n <= max;
};

/** KYC section errors, keyed by field name (empty object when valid). */
export function kycErrors(k) {
  const e = {};
  if (!lenBetween(k.businessName, 2, 120)) e.businessName = 'Enter the business or full name as on PAN (2–120 characters)';
  if (!['individual', 'business'].includes(k.businessType)) e.businessType = 'Choose individual or business';
  if (!lenBetween(k.city, 2, 80)) e.city = 'Enter the city (2–80 characters)';
  if (String(k.address ?? '').trim().length > 300) e.address = 'Keep the address under 300 characters';
  if (blank(k.pan)) e.pan = 'Enter the PAN';
  else if (!isPan(k.pan)) e.pan = 'PAN is 5 letters, 4 digits, 1 letter — e.g. ABCDE1234F';
  const aad = kycDigits(k.aadhaar);
  if (!aad) e.aadhaar = 'Enter the Aadhaar number';
  else if (!/^\d{12}$/.test(aad)) e.aadhaar = 'Aadhaar is 12 digits';
  else if (!/^[2-9]/.test(aad)) e.aadhaar = 'Aadhaar never starts with 0 or 1 — check the number';
  else if (!isAadhaar(aad)) e.aadhaar = 'This Aadhaar number fails the checksum — one digit is probably mistyped';
  if (!lenBetween(k.bankAccountHolder, 2, 120)) e.bankAccountHolder = 'Enter the account holder name (2–120 characters)';
  if (blank(k.bankAccountNumber)) e.bankAccountNumber = 'Enter the bank account number';
  else if (!isBankAccount(k.bankAccountNumber)) e.bankAccountNumber = 'Account number is 9 to 18 digits';
  if (!e.bankAccountNumber) {
    if (blank(k.bankAccountConfirm)) e.bankAccountConfirm = 'Re-enter the account number';
    else if (kycDigits(k.bankAccountConfirm) !== kycDigits(k.bankAccountNumber)) e.bankAccountConfirm = 'Account numbers do not match';
  }
  if (blank(k.bankIfsc)) e.bankIfsc = 'Enter the IFSC';
  else if (!isIfsc(k.bankIfsc)) e.bankIfsc = 'IFSC is 4 letters, 0, then 6 letters/digits — e.g. SBIN0001234';
  if (String(k.bankName ?? '').trim().length > 120) e.bankName = 'Keep the bank name under 120 characters';
  for (const [key, label] of KYC_DOC_FIELDS) if (!k[key]?._id) e[key] = `Upload the ${label.replace(' · ', ' ').toLowerCase()}`;
  const docs = KYC_DOC_FIELDS.map(([key]) => k[key]).filter((d) => d?._id);
  const sameId = new Set(docs.map((d) => String(d._id))).size !== docs.length;
  const sigs = docs.map((d) => d.sig).filter(Boolean);
  const sameFile = new Set(sigs).size !== sigs.length;
  if (docs.length === 3 && (sameId || sameFile)) e.documents = 'Upload a separate file for PAN, Aadhaar front and Aadhaar back';
  if (k.vendorConsent !== true) e.vendorConsent = 'Confirm that the vendor agreed to KYC verification';
  return e;
}

/** KycDetails request body (PUT /platform/vendors/:id/kyc-details, or `kyc` in POST /platform/vendors). */
export function kycPayload(k) {
  const opt = (v) => (blank(v) ? undefined : String(v).trim());
  return {
    businessName: String(k.businessName).trim(),
    businessType: k.businessType,
    city: String(k.city).trim(),
    address: opt(k.address),
    pan: String(k.pan).trim().toUpperCase(),
    aadhaar: kycDigits(k.aadhaar),
    bankAccountHolder: String(k.bankAccountHolder).trim(),
    bankAccountNumber: kycDigits(k.bankAccountNumber),
    bankIfsc: String(k.bankIfsc).trim().toUpperCase(),
    bankName: opt(k.bankName),
    panPhoto: k.panPhoto._id,
    aadhaarFront: k.aadhaarFront._id,
    aadhaarBack: k.aadhaarBack._id,
    vendorConsent: k.vendorConsent === true,
    approve: k.approve === true,
  };
}

/** Typed coordinates → { errors, location } (location undefined when all three are empty). */
export function locationPayload({ lat, lng, label }) {
  const errors = {};
  const none = blank(lat) && blank(lng);
  if (none) {
    if (!blank(label)) errors.lat = 'Add the latitude and longitude for this place (search or use your location)';
    return { errors, location: undefined };
  }
  const la = Number(String(lat).trim());
  const ln = Number(String(lng).trim());
  if (blank(lat) || !Number.isFinite(la) || la < -90 || la > 90) errors.lat = 'Latitude is a number from -90 to 90, e.g. 22.5726';
  if (blank(lng) || !Number.isFinite(ln) || ln < -180 || ln > 180) errors.lng = 'Longitude is a number from -180 to 180, e.g. 88.3639';
  if (String(label ?? '').trim().length > 200) errors.label = 'Keep the place name under 200 characters';
  if (Object.keys(errors).length) return { errors, location: undefined };
  return { errors, location: { lat: la, lng: ln, ...(blank(label) ? {} : { label: String(label).trim() }) } };
}

/** A blank "Add vendor" form (account, shop, rates). KYC lives in its own object (emptyKyc). */
export const emptyVendor = () => ({
  name: '',
  phone: '',
  email: '',
  password: '',
  confirm: '',
  shopName: '',
  logo: null,
  lat: '',
  lng: '',
  label: '',
  commissionPercent: '0',
  memberDiscountPercent: '0',
});

/**
 * Validates the whole "Add vendor" form → { errors, body }. body is null while anything is invalid.
 * `kyc` is null when "Add KYC now" is off.
 */
export function vendorPayload(v, kyc) {
  const errors = {};
  if (!lenBetween(v.name, 2, 120)) errors.name = 'Enter the vendor’s full name (2–120 characters)';
  if (blank(v.phone)) errors.phone = 'Enter the vendor’s mobile number';
  else if (!isIndianMobile(v.phone)) errors.phone = 'Enter a valid 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)';
  if (blank(v.email)) errors.email = 'Enter an email address (Cashfree needs it for payouts)';
  else if (!isEmail(v.email) || String(v.email).trim().length > 200) errors.email = 'Enter a valid email address, e.g. name@example.com';
  const problems = passwordProblems(v.password);
  if (problems.length) errors.password = `Password needs: ${problems.join(', ').toLowerCase()}`;
  else if (String(v.password).length > 200) errors.password = 'Password is too long (max 200 characters)';
  if (!v.confirm) errors.confirm = 'Re-enter the password';
  else if (v.confirm !== v.password) errors.confirm = 'Passwords do not match';
  if (!blank(v.shopName) && !lenBetween(v.shopName, 2, 80)) errors.shopName = 'Shop name is 2–80 characters';
  const loc = locationPayload(v);
  Object.assign(errors, loc.errors);
  const commissionPercent = parseRate(v.commissionPercent);
  const memberDiscountPercent = parseRate(v.memberDiscountPercent);
  if (commissionPercent === null) errors.commissionPercent = PRICING_RATE_ERROR;
  if (memberDiscountPercent === null) errors.memberDiscountPercent = PRICING_RATE_ERROR;
  if (kyc) Object.assign(errors, kycErrors(kyc));
  if (Object.keys(errors).length) return { errors, body: null };
  const body = {
    name: String(v.name).trim(),
    phone: normalizePhone(v.phone),
    email: String(v.email).trim().toLowerCase(),
    password: v.password,
    commissionPercent,
    memberDiscountPercent,
  };
  if (!blank(v.shopName)) body.shopName = String(v.shopName).trim();
  if (v.logo?._id) body.logoId = v.logo._id;
  if (loc.location) body.location = loc.location;
  if (kyc) body.kyc = kycPayload(kyc);
  return { errors, body };
}

/** Server field path → form field name (strips "kyc.", maps logoId / location.*). */
export function fieldFromPath(path) {
  const p = String(path || '').replace(/^kyc\./, '');
  if (p === 'logoId') return 'logo';
  if (p === 'location' || p === 'location.lat') return 'lat';
  if (p === 'location.lng') return 'lng';
  if (p === 'location.label') return 'label';
  return p.split('.')[0] || null;
}

/**
 * ApiError → { fields: { field: message }, general: message|null }.
 * 400 VALIDATION_ERROR details → fields; 409 ACCOUNT_EXISTS → phone, EMAIL_EXISTS → email; known 400 messages
 * (documents, logo, password strength) → their field; anything else → general.
 */
export function serverErrors(err) {
  const fields = {};
  if (!err) return { fields, general: null };
  if (err.code === 'ACCOUNT_EXISTS') fields.phone = 'An account with this mobile number already exists';
  else if (err.code === 'EMAIL_EXISTS') fields.email = 'An account with this email already exists';
  else if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details) && err.details.length) {
    for (const d of err.details) {
      const f = fieldFromPath(d.path);
      if (f && !fields[f]) fields[f] = d.message;
    }
  } else if (err.status === 400) {
    const m = String(err.message || '');
    if (/separate photo|KYC documents/i.test(m)) fields.documents = m;
    else if (/shop logo/i.test(m)) fields.logo = m;
    else if (/^Password/i.test(m)) fields.password = m;
  }
  if (Object.keys(fields).length) return { fields, general: null };
  return { fields, general: err.message || 'Something went wrong. Please try again.' };
}

/** "Priya Sen (Sub-admin)" / "Owner" label for addedBy / kycEnteredBy `{ _id, name, role }`. */
export const adminRoleLabel = (role) => (role === 'super_admin' ? 'Owner' : role === 'sub_admin' ? 'Sub-admin' : 'Admin');
export const adminLabel = (a) => (a ? `${a.name || 'Unnamed'} (${adminRoleLabel(a.role)})` : null);

// ---------- Sub-admin activity ----------
export const ACTIVITY_FILTERS = [
  ['', 'All'],
  ['platform.vendor_created', 'Vendors added'],
  ['platform.vendor_kyc_entered', 'KYC entered'],
];

const ACTION_LABELS = {
  'platform.vendor_created': 'Added a vendor',
  'platform.vendor_kyc_entered': 'Entered vendor KYC',
  'platform.vendor_kyc_entered_approved': 'Entered and approved vendor KYC',
  'platform.vendor_kyc_approved': 'Approved vendor KYC',
  'platform.vendor_kyc_rejected': 'Rejected vendor KYC',
  'platform.vendor_payout_sync': 'Created / refreshed a vendor payout account',
  'privacy.kyc_reveal': 'Revealed full vendor KYC',
  'vendor.pricing_updated': 'Changed vendor rates',
};

/** Readable label for an audit action ("platform.vendor_created" → "Added a vendor"). */
export function activityLabel(action) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const tail = String(action || '').split('.').slice(1).join(' ') || String(action || 'Action');
  const s = tail.replace(/[_.]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Action';
}

/** Link for an audit entry's target: the vendor page for vendor actions on a User, else null. */
export function activityLink(item) {
  if (item?.targetType === 'User' && item.targetId && /^(platform\.vendor|vendor\.|privacy\.kyc)/.test(item.action || '')) return `/admin/vendors/${item.targetId}`;
  return null;
}
