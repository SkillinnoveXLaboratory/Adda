import { describe, expect, it } from 'vitest';
import { aadhaarProblem, aadhaarValid, accountProblem, checkUpload, formatAadhaar, ifscProblem, isIndianMobile, IFSC_RX, nameError, normalizePhone, PAN_RX, panProblem, passwordProblems, phoneError, phoneInput, rupeeError } from '../../src/lib/validation.js';

// Verhoeff helpers to build valid numbers independently of the code under test.
const D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
const withCheck = (base11) => base11 + INV[base11.split('').reverse().reduce((c, d, i) => D[c][P[(i + 1) % 8][Number(d)]], 0)];

describe('phone', () => {
  it('normalises +91 / 0 prefixes and spaces', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhone('09876543210')).toBe('9876543210');
    expect(phoneInput('+91 98765 43210')).toBe('9876543210');
    expect(phoneInput('919876543210')).toBe('9876543210');
    expect(phoneInput('98765432109999')).toBe('9876543210');
  });
  it('accepts Indian mobiles only and explains why not', () => {
    expect(isIndianMobile('9876543210')).toBe(true);
    expect(isIndianMobile('5876543210')).toBe(false);
    expect(phoneError('')).toMatch(/Enter your mobile number/);
    expect(phoneError('98765')).toMatch(/all 10 digits.*5 entered/);
    expect(phoneError('5876543210')).toMatch(/start with 6, 7, 8 or 9/);
    expect(phoneError('9876543210')).toBeNull();
  });
});

describe('password and name', () => {
  it('needs 10+ characters with a letter and a number', () => {
    expect(passwordProblems('short1')).toContain('At least 10 characters');
    expect(passwordProblems('onlyletterslong')).toContain('At least one number');
    expect(passwordProblems('1234567890')).toContain('At least one letter');
    expect(passwordProblems('Vendor12345')).toEqual([]);
  });
  it('names need 2+ characters', () => {
    expect(nameError('A')).toMatch(/at least 2/);
    expect(nameError('Ravi')).toBeNull();
  });
});

describe('PAN', () => {
  it('matches 5 letters, 4 digits, 1 letter', () => {
    expect(PAN_RX.test('ABCDE1234F')).toBe(true);
    expect(PAN_RX.test('ABCD1234F')).toBe(false);
    expect(panProblem('abcde1234f')).toBeNull();
  });
  it('gives a specific message', () => {
    expect(panProblem('')).toMatch(/Enter your PAN/);
    expect(panProblem('ABCDE123F')).toMatch(/10 characters \(you entered 9\)/);
    expect(panProblem('ABCD11234F')).toMatch(/first 5 characters/);
    expect(panProblem('ABCDEO234F')).toMatch(/letter O instead of 0/);
    expect(panProblem('ABCDE12345')).toMatch(/last character/);
  });
});

describe('Aadhaar (Verhoeff)', () => {
  const good = withCheck('23456789012');
  const bad = `${good.slice(0, 11)}${(Number(good[11]) + 1) % 10}`;
  it('accepts a valid number, with or without spaces', () => {
    expect(aadhaarValid(good)).toBe(true);
    expect(aadhaarValid(formatAadhaar(good))).toBe(true);
    expect(aadhaarProblem(formatAadhaar(good))).toBeNull();
  });
  it('rejects a single wrong digit and explains', () => {
    expect(aadhaarValid(bad)).toBe(false);
    expect(aadhaarProblem(bad)).toMatch(/one digit is probably wrong/);
  });
  it('rejects wrong length and leading 0/1', () => {
    expect(aadhaarProblem('1234')).toMatch(/12 digits \(you entered 4\)/);
    expect(aadhaarProblem(withCheck('13456789012'))).toMatch(/never start with 0 or 1/);
    expect(aadhaarProblem('')).toMatch(/Enter your 12-digit/);
  });
  it('formats as 4-4-4 while typing', () => {
    expect(formatAadhaar('234567890123')).toBe('2345 6789 0123');
    expect(formatAadhaar('2345 67')).toBe('2345 67');
  });
});

describe('IFSC and bank account', () => {
  it('IFSC: 4 letters, 0, 6 alphanumerics', () => {
    expect(IFSC_RX.test('SBIN0001234')).toBe(true);
    expect(ifscProblem('sbin0001234')).toBeNull();
    expect(ifscProblem('SBIN1001234')).toMatch(/5th character.*0/);
    expect(ifscProblem('SBIN000123')).toMatch(/11 characters \(you entered 10\)/);
    expect(ifscProblem('1BIN0001234')).toMatch(/starts with 4 letters/);
  });
  it('account: 9 to 18 digits', () => {
    expect(accountProblem('123456789')).toBeNull();
    expect(accountProblem('12345678')).toMatch(/9 to 18 digits/);
    expect(accountProblem('1234567890123456789')).toMatch(/9 to 18 digits/);
  });
});

describe('rupee amounts and uploads', () => {
  it('rupeeError explains the problem', () => {
    expect(rupeeError('')).toMatch(/Enter/);
    expect(rupeeError('12.345')).toMatch(/up to 2 decimals/);
    expect(rupeeError('0')).toMatch(/greater than zero/);
    expect(rupeeError('1000001', { max: 1000000 })).toMatch(/Maximum ₹10,00,000/);
    expect(rupeeError('499.50')).toBeNull();
  });
  it('checkUpload allows images (and PDF only when asked)', () => {
    expect(checkUpload({ name: 'a.png', type: 'image/png', size: 100 })).toBeNull();
    expect(checkUpload({ name: 'a.pdf', type: 'application/pdf', size: 100 })).toMatch(/JPG, PNG or WEBP/);
    expect(checkUpload({ name: 'a.pdf', type: 'application/pdf', size: 100 }, { allowPdf: true })).toBeNull();
    expect(checkUpload({ name: 'a.png', type: 'image/png', size: 9 * 1024 * 1024 })).toMatch(/too large/);
  });
});
