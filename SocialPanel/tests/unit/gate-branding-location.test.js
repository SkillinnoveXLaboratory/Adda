import { describe, expect, it } from 'vitest';
import { checkLogoFile, LOGO_MAX_BYTES, societyInitials } from '../../src/lib/branding.js';
import { formatCoord, geocodeMessage, geolocationMessage, isValidLatLng, locationPayload, makeLocation, sameLocation } from '../../src/lib/location.js';
import { addedByText, expectedText, flatText, gatemanApiErrors, gatemanBody, validateGateman } from '../../src/lib/gate.js';
import { SOCIETY_NAV } from '../../src/layout/nav.js';
import { can } from '../../src/lib/roles.js';

describe('society branding', () => {
  it('two initials from the society name', () => {
    expect(societyInitials('Green Meadows CHS')).toBe('GM');
    expect(societyInitials('sunrise')).toBe('SU');
    expect(societyInitials('  Shanti   Niketan Apartments ')).toBe('SN');
    expect(societyInitials('A & B Residency')).toBe('AB');
    expect(societyInitials('')).toBe('S');
    expect(societyInitials(null)).toBe('S');
  });
  it('logo files: PNG/JPG/WEBP up to 2 MB', () => {
    expect(checkLogoFile({ name: 'logo.png', type: 'image/png', size: 1000 })).toBeNull();
    expect(checkLogoFile({ name: 'logo.webp', type: 'image/webp', size: LOGO_MAX_BYTES })).toBeNull();
    expect(checkLogoFile({ name: 'logo.JPG', type: '', size: 10 })).toBeNull();
    expect(checkLogoFile({ name: 'logo.pdf', type: 'application/pdf', size: 10 })).toMatch(/PNG, JPG or WEBP/);
    expect(checkLogoFile({ name: 'logo.gif', type: 'image/gif', size: 10 })).toMatch(/PNG, JPG or WEBP/);
    expect(checkLogoFile({ name: 'big.png', type: 'image/png', size: LOGO_MAX_BYTES + 1 })).toMatch(/too large .*2 MB/);
    expect(checkLogoFile(null)).toBe('Choose an image');
  });
});

describe('location helpers', () => {
  it('formats coordinates with 6 decimals', () => {
    expect(formatCoord(18.5204303)).toBe('18.520430');
    expect(formatCoord(-0.1)).toBe('-0.100000');
    expect(formatCoord(undefined)).toBe('');
    expect(formatCoord(NaN)).toBe('');
  });
  it('validates ranges', () => {
    expect(isValidLatLng(18.5, 73.8)).toBe(true);
    expect(isValidLatLng(-90, 180)).toBe(true);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, -181)).toBe(false);
    expect(isValidLatLng('18', 73)).toBe(false);
  });
  it('makes a normalised location and the API payload', () => {
    expect(makeLocation(18.52043039, 73.85674401, '  Pune ')).toEqual({ lat: 18.52043, lng: 73.856744, label: 'Pune' });
    expect(makeLocation(100, 0)).toBeNull();
    expect(makeLocation(1, 2, 'x'.repeat(250)).label).toHaveLength(200);
    expect(locationPayload({ lat: 18.5, lng: 73.8, label: null })).toEqual({ lat: 18.5, lng: 73.8 });
    expect(locationPayload({ lat: 18.5, lng: 73.8, label: 'Baner' })).toEqual({ lat: 18.5, lng: 73.8, label: 'Baner' });
    expect(locationPayload(null)).toBeNull();
    expect(locationPayload({ lat: 200, lng: 0 })).toBeNull();
  });
  it('compares locations', () => {
    expect(sameLocation(null, null)).toBe(true);
    expect(sameLocation(null, { lat: 1, lng: 2 })).toBe(false);
    expect(sameLocation({ lat: 1.0000001, lng: 2, label: 'A' }, { lat: 1, lng: 2, label: 'A' })).toBe(true);
    expect(sameLocation({ lat: 1, lng: 2, label: 'A' }, { lat: 1, lng: 2, label: 'B' })).toBe(false);
  });
  it('explains geolocation and geocoder failures', () => {
    expect(geolocationMessage({ code: 1 })).toMatch(/denied/);
    expect(geolocationMessage({ code: 3 })).toMatch(/too long/);
    expect(geolocationMessage({ code: 'UNSUPPORTED' })).toMatch(/cannot share/);
    expect(geolocationMessage(null)).toBeNull();
    expect(geocodeMessage({ status: 503, code: 'GEOCODER_UNAVAILABLE' })).toMatch(/unavailable.*drag the pin/);
    expect(geocodeMessage({ status: 400 })).toBeNull();
    expect(geocodeMessage({ status: 0 })).toMatch(/Cannot reach/);
  });
});

describe('gate helpers', () => {
  const v = { name: 'Asha', expectedDate: '2026-11-14', expectedIn: '09:30', expectedOut: '13:05', flat: { number: 'A-101' }, building: { name: 'Tower A' } };
  it('expected date and time window in 12-hour time', () => {
    expect(expectedText(v)).toEqual({ date: '14 Nov 2026', time: '9:30 am – 1:05 pm' });
    expect(expectedText({ expectedDate: '2026-11-14', expectedIn: '00:15' }).time).toBe('from 12:15 am');
    expect(expectedText({ expectedDate: '2026-11-14' }).time).toBe('');
  });
  it('flat and added-by labels', () => {
    expect(flatText(v)).toBe('Tower A · A-101');
    expect(flatText({})).toBe('—');
    expect(addedByText('gateman')).toBe('Gate');
    expect(addedByText('member')).toBe('Member');
  });
  it('validates the new gateman form like the server', () => {
    expect(validateGateman({ name: 'R', email: 'bad', password: 'short', phone: '123' })).toEqual({
      name: 'Name must be at least 2 characters',
      email: 'Enter a valid email address',
      phone: expect.stringMatching(/10-digit/),
      password: expect.stringMatching(/at least 10 characters.*at least one number/),
    });
    expect(validateGateman({ name: 'Ramesh', email: 'g@x.in', password: 'Gate2026secure', phone: '' })).toEqual({});
    expect(validateGateman({ name: 'Ramesh', email: '', password: '' }).password).toBe('Set a password for the gateman');
    expect(validateGateman({ name: 'Ramesh', phone: '9876543210' }, { create: false })).toEqual({});
  });
  it('builds request bodies', () => {
    expect(gatemanBody({ name: ' Ramesh ', email: ' G@X.in ', password: 'Gate2026secure', phone: '+91 98765 43210' })).toEqual({ name: 'Ramesh', email: 'g@x.in', password: 'Gate2026secure', phone: '9876543210' });
    expect(gatemanBody({ name: 'Ramesh', email: 'g@x.in', password: 'p', phone: '' })).not.toHaveProperty('phone');
    expect(gatemanBody({ name: 'Ramesh', phone: '' }, { create: false })).toEqual({ name: 'Ramesh', phone: null });
  });
  it('maps server errors to fields', () => {
    expect(gatemanApiErrors({ code: 'EMAIL_TAKEN', message: 'Email in use' })).toEqual({ email: 'Email in use' });
    expect(gatemanApiErrors({ code: 'VALIDATION_ERROR', details: [{ path: 'password', message: 'Too weak' }] })).toEqual({ password: 'Too weak' });
    expect(gatemanApiErrors({ message: 'Society suspended' })).toEqual({ form: 'Society suspended' });
  });
  it('Gatemen is under Administration for admin, secretary and manager only', () => {
    const admin = SOCIETY_NAV.find((s) => s.title === 'Administration');
    const item = admin.items.find((i) => i.to === '/society/gatemen');
    expect(item?.perm).toBe('gate');
    expect(['admin', 'secretary', 'manager'].every((r) => can(r, 'gate'))).toBe(true);
    expect(['treasurer', 'committee'].some((r) => can(r, 'gate'))).toBe(false);
  });
});
