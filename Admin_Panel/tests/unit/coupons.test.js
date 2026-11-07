import { describe, expect, it } from 'vitest';
import { couponForm, couponPayload, normalizeCouponCode } from '../../src/lib/coupons.js';
import { parsePercent } from '../../src/lib/validation.js';
import { rupeesToPaise } from '../../src/lib/format.js';

const base = { code: 'save150', description: ' Festive ', discount: '150', maxUses: '10', audience: 'all', societies: [], active: true, expiresOn: '' };

describe('coupon form', () => {
  it('normalises the code as typed', () => {
    expect(normalizeCouponCode('diwali 150!')).toBe('DIWALI150');
    expect(normalizeCouponCode('a-b_c')).toBe('A-BC');
    expect(normalizeCouponCode('x'.repeat(30))).toHaveLength(20);
  });
  it('rupees → integer paise without float errors', () => {
    expect(rupeesToPaise('99.99')).toBe(9999);
    expect(rupeesToPaise('150.50')).toBe(15050);
    expect(rupeesToPaise('0.29')).toBe(29);
    expect(rupeesToPaise('1.005')).toBeNull();
    const { body } = couponPayload({ ...base, discount: '99.99' });
    expect(body.discountPaise).toBe(9999);
    expect(Number.isInteger(body.discountPaise)).toBe(true);
  });
  it('builds the create body (all members, no expiry)', () => {
    const { errors, body } = couponPayload(base, { today: '2026-11-07' });
    expect(errors).toEqual({});
    expect(body).toEqual({ code: 'SAVE150', description: 'Festive', discountPaise: 15000, maxUses: 10, societyIds: [], active: true });
  });
  it('society restriction needs at least one society and sends ids', () => {
    expect(couponPayload({ ...base, audience: 'societies' }).errors.societies).toBeTruthy();
    const { body } = couponPayload({ ...base, audience: 'societies', societies: [{ _id: 'a1', name: 'A' }, { _id: 'b2', name: 'B' }] });
    expect(body.societyIds).toEqual(['a1', 'b2']);
  });
  it('validates code, discount, max uses and expiry', () => {
    const e = couponPayload({ ...base, code: 'ab', discount: '0.50', maxUses: '0', expiresOn: '2026-01-01' }, { today: '2026-11-07' }).errors;
    expect(Object.keys(e).sort()).toEqual(['code', 'discount', 'expiresOn', 'maxUses']);
    expect(couponPayload({ ...base, discount: '12.345' }).errors.discount).toMatch(/2 decimals/);
    expect(couponPayload({ ...base, maxUses: '2.5' }).errors.maxUses).toBeTruthy();
    expect(couponPayload({ ...base, maxUses: '100001' }).errors.maxUses).toBeTruthy();
  });
  it('edit: max uses can’t go below uses so far; clearing expiry sends null', () => {
    expect(couponPayload({ ...base, maxUses: '2' }, { editing: true, usedCount: 3 }).errors.maxUses).toMatch(/3 members/);
    const { body } = couponPayload({ ...base, maxUses: '3' }, { editing: true, usedCount: 3 });
    expect(body.maxUses).toBe(3);
    expect(body.expiresOn).toBeNull();
    expect(couponPayload({ ...base, expiresOn: '2026-01-01' }, { editing: true, today: '2026-11-07' }).errors).toEqual({});
  });
  it('round-trips an existing coupon into the form', () => {
    const f = couponForm({ code: 'X-1', discountPaise: 15050, maxUses: 5, allMembers: false, societies: [{ _id: 's', name: 'Lake View', city: 'Kolkata' }], active: false, expiresAt: '2026-12-31T18:29:59.999Z' });
    expect(f).toMatchObject({ code: 'X-1', discount: '150.50', maxUses: '5', audience: 'societies', active: false, expiresOn: '2026-12-31' });
    expect(f.societies[0].name).toBe('Lake View');
  });
});

describe('commission percent', () => {
  it('accepts 0–50 with up to 2 decimals, as a number', () => {
    expect(parsePercent('0')).toBe(0);
    expect(parsePercent('12.5')).toBe(12.5);
    expect(parsePercent('7.25')).toBe(7.25);
    expect(parsePercent(' 10 % ')).toBe(10);
    expect(parsePercent('50')).toBe(50);
    expect(parsePercent(12.5)).toBe(12.5);
  });
  it('rejects negatives, > 50, 3 decimals and text', () => {
    for (const bad of ['-1', '50.01', '12.345', 'ten', '', '1e1', '.5']) expect(parsePercent(bad)).toBeNull();
  });
});
