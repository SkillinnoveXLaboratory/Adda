import { describe, expect, it } from 'vitest';
import { isAadhaar, isBankAccount, isIfsc, isPan, verhoeffValid } from '../../src/lib/validation.js';
import { activityLabel, activityLink, adminLabel, CF_LINES_OF_BUSINESS, emptyKyc, emptyVendor, fieldFromPath, gstinProblem, kycErrors, kycPayload, locationPayload, serverErrors, vendorPayload } from '../../src/lib/vendorOnboarding.js';
import { ApiError } from '../../src/lib/api.js';

const AADHAAR = '234567890124'; // passes Verhoeff
const doc = (id, sig) => ({ _id: id, name: `${id}.jpg`, mimeType: 'image/jpeg', sig: sig || id });
const goodKyc = () => ({
  ...emptyKyc(),
  businessName: 'Sen Electricals',
  lineOfBusiness: 'Professional Services (Doctors, Lawyers, Architects, CAs, and other Professionals)',
  city: 'Kolkata',
  pan: 'abcde1234f',
  aadhaar: '2345 6789 0124',
  bankAccountHolder: 'Priya Sen',
  bankAccountNumber: '123456789012',
  bankAccountConfirm: '123456789012',
  bankIfsc: 'sbin0001234',
  panPhoto: doc('a1'),
  aadhaarFront: doc('a2'),
  aadhaarBack: doc('a3'),
  vendorConsent: true,
});
const goodVendor = () => ({ ...emptyVendor(), name: 'Priya Sen', phone: '+91 98765 43210', email: 'Priya@Example.com', password: 'Strongpass123', confirm: 'Strongpass123', commissionPercent: '12.5', memberDiscountPercent: '50' });

describe('KYC number checks (mirror of the server)', () => {
  it('Verhoeff / Aadhaar', () => {
    expect(verhoeffValid(AADHAAR)).toBe(true);
    expect(verhoeffValid('234567890123')).toBe(false);
    expect(isAadhaar('2345 6789 0124')).toBe(true);
    expect(isAadhaar('2345-6789-0124')).toBe(true);
    expect(isAadhaar('134567890124')).toBe(false); // starts with 1
    expect(isAadhaar('23456789012')).toBe(false);
  });
  it('PAN, IFSC, account number', () => {
    expect(isPan('ABCDE1234F')).toBe(true);
    expect(isPan('abcde1234f')).toBe(true);
    expect(isPan('ABCD12345F')).toBe(false);
    expect(isIfsc('SBIN0001234')).toBe(true);
    expect(isIfsc('SBIN1001234')).toBe(false);
    expect(isBankAccount('12345678')).toBe(false);
    expect(isBankAccount('123456789')).toBe(true);
    expect(isBankAccount('1234567890123456789')).toBe(false);
  });
});

describe('kycErrors / kycPayload', () => {
  it('a complete form has no errors and builds a normalised body', () => {
    const k = goodKyc();
    expect(kycErrors(k)).toEqual({});
    expect(kycPayload(k)).toEqual({
      businessName: 'Sen Electricals',
      businessType: 'individual',
      lineOfBusiness: 'Professional Services (Doctors, Lawyers, Architects, CAs, and other Professionals)',
      gstin: undefined,
      city: 'Kolkata',
      address: undefined,
      pan: 'ABCDE1234F',
      aadhaar: AADHAAR,
      bankAccountHolder: 'Priya Sen',
      bankAccountNumber: '123456789012',
      bankIfsc: 'SBIN0001234',
      bankName: undefined,
      panPhoto: 'a1',
      aadhaarFront: 'a2',
      aadhaarBack: 'a3',
      vendorConsent: true,
      approve: false,
    });
  });
  it('specific messages for each bad field', () => {
    const e = kycErrors({ ...goodKyc(), pan: 'ABC', aadhaar: '234567890123', bankIfsc: 'XX', bankAccountConfirm: '999999999', vendorConsent: false, panPhoto: null });
    expect(e.pan).toMatch(/5 letters, 4 digits, 1 letter/);
    expect(e.aadhaar).toMatch(/checksum/);
    expect(e.bankIfsc).toMatch(/SBIN0001234/);
    expect(e.bankAccountConfirm).toMatch(/do not match/);
    expect(e.vendorConsent).toBeTruthy();
    expect(e.panPhoto).toBeTruthy();
    expect(kycErrors({ ...goodKyc(), aadhaar: '123456789012' }).aadhaar).toMatch(/0 or 1/);
  });
  it('Cashfree fields: line of business required, GSTIN optional but must carry the PAN', () => {
    expect(kycErrors({ ...goodKyc(), lineOfBusiness: '' }).lineOfBusiness).toMatch(/Cashfree/);
    expect(kycErrors({ ...goodKyc(), lineOfBusiness: 'NBFC' }).lineOfBusiness).toBeTruthy();
    expect(kycErrors({ ...goodKyc(), gstin: '27ABCDE1234F1Z5' })).toEqual({});
    expect(kycPayload({ ...goodKyc(), gstin: '27abcde1234f1z5' }).gstin).toBe('27ABCDE1234F1Z5');
    expect(kycErrors({ ...goodKyc(), gstin: '27ZZZZZ1234F1Z5' }).gstin).toMatch(/different PAN/);
    expect(kycErrors({ ...goodKyc(), gstin: '27ABCDE1234F' }).gstin).toMatch(/15 characters/);
    expect(gstinProblem('', 'ABCDE1234F')).toBeNull();
    expect(CF_LINES_OF_BUSINESS).toContain('Retail and Shopping');
    expect(CF_LINES_OF_BUSINESS).not.toContain('NBFCs/Organisations into Lending');
  });
  it('the three documents must be different files', () => {
    expect(kycErrors({ ...goodKyc(), aadhaarBack: doc('a2') }).documents).toBeTruthy();
    expect(kycErrors({ ...goodKyc(), aadhaarBack: doc('a9', 'a2') }).documents).toBeTruthy(); // same file uploaded twice
  });
});

describe('locationPayload', () => {
  it('empty → no location; valid → numbers; out of range → errors', () => {
    expect(locationPayload({ lat: '', lng: '', label: '' })).toEqual({ errors: {}, location: undefined });
    expect(locationPayload({ lat: '22.5726', lng: '88.3639', label: ' Salt Lake ' }).location).toEqual({ lat: 22.5726, lng: 88.3639, label: 'Salt Lake' });
    const bad = locationPayload({ lat: '95', lng: 'x', label: '' });
    expect(bad.errors.lat).toBeTruthy();
    expect(bad.errors.lng).toBeTruthy();
    expect(locationPayload({ lat: '', lng: '', label: 'Somewhere' }).errors.lat).toBeTruthy();
  });
});

describe('vendorPayload', () => {
  it('builds the POST /platform/vendors body', () => {
    const { errors, body } = vendorPayload({ ...goodVendor(), shopName: ' Sen Shop ', logo: { _id: 'L1' }, lat: '22.5', lng: '88.3' }, null);
    expect(errors).toEqual({});
    expect(body).toEqual({ name: 'Priya Sen', phone: '9876543210', email: 'priya@example.com', password: 'Strongpass123', commissionPercent: 12.5, memberDiscountPercent: 50, shopName: 'Sen Shop', logoId: 'L1', location: { lat: 22.5, lng: 88.3 } });
  });
  it('includes kyc only when the section is on', () => {
    const { body } = vendorPayload(goodVendor(), { ...goodKyc(), approve: true });
    expect(body.kyc.approve).toBe(true);
    expect(body.kyc.pan).toBe('ABCDE1234F');
    expect(vendorPayload(goodVendor(), null).body.kyc).toBeUndefined();
  });
  it('rejects weak passwords, bad mobile, bad rates and KYC errors together', () => {
    const { errors, body } = vendorPayload({ ...goodVendor(), phone: '5876543210', password: 'short1', confirm: 'nope', commissionPercent: '101', shopName: 'S' }, { ...goodKyc(), pan: '' });
    expect(body).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['commissionPercent', 'confirm', 'pan', 'password', 'phone', 'shopName']);
  });
});

describe('serverErrors', () => {
  it('maps validation details, conflicts and known 400s to fields', () => {
    expect(fieldFromPath('kyc.aadhaar')).toBe('aadhaar');
    expect(fieldFromPath('location.lng')).toBe('lng');
    expect(fieldFromPath('logoId')).toBe('logo');
    const v = serverErrors(new ApiError(400, 'VALIDATION_ERROR', 'kyc.pan: bad', [{ path: 'kyc.pan', message: 'Enter a valid PAN' }, { path: 'email', message: 'Enter a valid email address' }]));
    expect(v).toEqual({ fields: { pan: 'Enter a valid PAN', email: 'Enter a valid email address' }, general: null });
    expect(serverErrors(new ApiError(409, 'ACCOUNT_EXISTS', 'x')).fields.phone).toBeTruthy();
    expect(serverErrors(new ApiError(409, 'EMAIL_EXISTS', 'x')).fields.email).toBeTruthy();
    expect(serverErrors(new ApiError(400, 'BAD_REQUEST', 'Upload a separate photo for PAN, Aadhaar front and Aadhaar back')).fields.documents).toBeTruthy();
    expect(serverErrors(new ApiError(400, 'BAD_REQUEST', 'Password must contain letters and numbers.')).fields.password).toBeTruthy();
    expect(serverErrors(new ApiError(409, 'KYC_APPROVED', 'Reject it first'))).toEqual({ fields: {}, general: 'Reject it first' });
  });
});

describe('labels', () => {
  it('admin and activity labels / links', () => {
    expect(adminLabel({ name: 'Asha', role: 'sub_admin' })).toBe('Asha (Sub-admin)');
    expect(adminLabel({ name: 'Owner One', role: 'super_admin' })).toBe('Owner One (Owner)');
    expect(adminLabel(null)).toBeNull();
    expect(activityLabel('platform.vendor_created')).toBe('Added a vendor');
    expect(activityLabel('platform.category_created')).toBe('Category created');
    expect(activityLink({ action: 'platform.vendor_kyc_entered', targetType: 'User', targetId: 'u1' })).toBe('/admin/vendors/u1');
    expect(activityLink({ action: 'platform.category_created', targetType: 'Category', targetId: 'c1' })).toBeNull();
  });
});
