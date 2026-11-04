import { describe, expect, it } from 'vitest';
import { amountRule, checkUpload, emailRule, isEmail, isIndianMobile, isIndianPhone, isPincode, isStrongPassword, passwordProblems, phoneRule, req, runRules } from '../../src/lib/validation.js';
import { can } from '../../src/lib/roles.js';
import { previewFlatNumbers } from '../../src/pages/society/Structure.jsx';

describe('validation', () => {
  it('Indian mobile ^[6-9]\\d{9}$ (accepts +91 / 0 prefixes)', () => {
    expect(isIndianMobile('9876543210')).toBe(true);
    expect(isIndianMobile('+91 98765 43210')).toBe(true);
    expect(isIndianMobile('09876543210')).toBe(true);
    expect(isIndianMobile('5876543210')).toBe(false);
    expect(isIndianMobile('98765')).toBe(false);
  });
  it('society contact number accepts mobiles and STD landlines', () => {
    expect(isIndianPhone('5647339820')).toBe(true);
    expect(isIndianPhone('033 2234 5678')).toBe(true);
    expect(isIndianPhone('+91 98765 43210')).toBe(true);
    expect(isIndianPhone('1234567890')).toBe(false);
    expect(isIndianPhone('12345')).toBe(false);
  });
  it('PIN and email', () => {
    expect(isPincode('411045')).toBe(true);
    expect(isPincode('41104')).toBe(false);
    expect(isEmail('a.b@society.org')).toBe(true);
    expect(isEmail('nope@')).toBe(false);
  });
  it('password rule matches the server (≥ 10, letters + digits)', () => {
    expect(isStrongPassword('Adda2026secure')).toBe(true);
    expect(isStrongPassword('short1')).toBe(false);
    expect(isStrongPassword('onlyletterslong')).toBe(false);
    expect(isStrongPassword('1234567890')).toBe(false);
    expect(passwordProblems('abc')).toEqual(['At least 10 characters', 'At least one number']);
  });
  it('runRules returns the first failing message per field', () => {
    const errs = runRules({ email: '', phone: '123', amount: '10.555' }, { email: [req('Email required'), emailRule()], phone: [phoneRule()], amount: [amountRule()] });
    expect(errs).toEqual({ email: 'Email required', phone: 'Enter a valid 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)', amount: 'Enter an amount in rupees (up to 2 decimals)' });
    expect(runRules({ amount: '0' }, { amount: [amountRule()] }).amount).toBeTruthy();
    expect(runRules({ amount: '0' }, { amount: [amountRule(undefined, { allowZero: true })] })).toEqual({});
  });
  it('upload checks type and the 8 MB limit', () => {
    expect(checkUpload({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toBeNull();
    expect(checkUpload({ name: 'a.exe', type: 'application/x-msdownload', size: 10 })).toMatch(/Only JPG/);
    expect(checkUpload({ name: 'a.png', type: 'image/png', size: 9 * 1024 * 1024 })).toMatch(/too large/);
    expect(checkUpload({ name: 'a.pdf', type: 'application/pdf', size: 10 }, { allowPdf: false })).toMatch(/images/);
  });
});

describe('roles mirror the server', () => {
  it('permissions', () => {
    expect(can('admin', 'society.manage')).toBe(true);
    expect(can('treasurer', 'society.manage')).toBe(false);
    expect(can('treasurer', 'finance')).toBe(true);
    expect(can('treasurer', 'members.read')).toBe(true);
    expect(can('treasurer', 'complaints')).toBe(false);
    expect(can('secretary', 'finance.read')).toBe(true);
    expect(can('secretary', 'finance')).toBe(false);
    expect(can('manager', 'members.read')).toBe(true);
    expect(can('committee', 'announcements')).toBe(true);
    expect(can(null, 'society.read')).toBe(false);
  });
});

describe('bulk flat preview mirrors server numbering', () => {
  it('building prefix, ground floor and padding', () => {
    const p = previewFlatNumbers({ buildingName: 'Tower A', fromFloor: 0, toFloor: 1, unitsPerFloor: 2, pattern: '{building}-{floor}{unit}' });
    expect(p.numbers).toEqual(['A-G01', 'A-G02', 'A-101', 'A-102']);
    expect(previewFlatNumbers({ buildingName: 'Wing Rose Garden', fromFloor: 2, toFloor: 2, unitsPerFloor: 1, pattern: '{building}{floor}{unit}' }).numbers).toEqual(['ROSEGA201']);
    expect(previewFlatNumbers({ buildingName: 'B', fromFloor: 3, toFloor: 1, unitsPerFloor: 2, pattern: '{floor}{unit}' }).total).toBe(0);
  });
});
