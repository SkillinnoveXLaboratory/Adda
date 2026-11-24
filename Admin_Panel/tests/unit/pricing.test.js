import { describe, expect, it } from 'vitest';
import { EXAMPLE_PRICE_PAISE, formatPercent, parseRate, pricingExample, pricingPayload, toBps } from '../../src/lib/pricing.js';
import { parsePercent } from '../../src/lib/validation.js';
import { formatCoords, osmUrl, validLocation } from '../../src/lib/location.js';

describe('per-vendor pricing example (mirrors the server)', () => {
  it('₹1,000 at 20% with a 50% member discount', () => {
    expect(EXAMPLE_PRICE_PAISE).toBe(100000);
    expect(pricingExample(100000, 20, 50)).toEqual({
      vendorPricePaise: 100000,
      commissionPaise: 20000, // ₹200 taken from the vendor's price
      memberPricePaise: 100000, // members see and pay ₹1,000
      discountPaise: 10000, // ₹100 off (paid by NIVASA)
      payableWithDiscountPaise: 90000, // ₹900
      nivasaKeepsPaise: 10000, // ₹100
      vendorGetsPaise: 80000, // ₹800
    });
  });

  it('rounds like the server (Math.round on integer paise)', () => {
    // ₹333.33 at 12.5% → ₹41.67 (4166.625 → 4167)
    expect(pricingExample(33333, 12.5, 0)).toMatchObject({ commissionPaise: 4167, memberPricePaise: 33333, discountPaise: 0, payableWithDiscountPaise: 33333, nivasaKeepsPaise: 4167, vendorGetsPaise: 29166 });
    // discount on the commission: 4167 × 33.33% = 1388.86… → 1389
    expect(pricingExample(33333, 12.5, 33.33).discountPaise).toBe(1389);
    // ₹1,000 at 12.25% → ₹122.50; 10% of it → ₹12.25
    expect(pricingExample(100000, 12.25, 10)).toMatchObject({ commissionPaise: 12250, memberPricePaise: 100000, discountPaise: 1225, payableWithDiscountPaise: 98775, nivasaKeepsPaise: 11025, vendorGetsPaise: 87750 });
  });

  it('0% commission → member price = vendor price, nothing to discount, vendor keeps it all', () => {
    expect(pricingExample(100000, 0, 50)).toMatchObject({ commissionPaise: 0, memberPricePaise: 100000, discountPaise: 0, nivasaKeepsPaise: 0, vendorGetsPaise: 100000 });
  });

  it('100% discount → NIVASA keeps nothing, vendor earnings unchanged (price − commission)', () => {
    expect(pricingExample(100000, 20, 100)).toMatchObject({ discountPaise: 20000, payableWithDiscountPaise: 80000, nivasaKeepsPaise: 0, vendorGetsPaise: 80000 });
  });

  it('percent → basis points without float drift', () => {
    expect(toBps(12.5)).toBe(1250);
    expect(toBps(0.07)).toBe(7);
    expect(toBps(33.33)).toBe(3333);
    expect(toBps(100)).toBe(10000);
  });
});

describe('rate inputs', () => {
  it('accepts 0–100 with up to 2 decimals', () => {
    for (const [inp, out] of [['0', 0], ['20', 20], ['12.5', 12.5], ['7.25', 7.25], [' 10 % ', 10], ['100', 100], ['100.00', 100]]) expect(parseRate(inp)).toBe(out);
    for (const bad of ['-1', '100.01', '12.345', 'ten', '', '1e1', '.5', '101']) expect(parseRate(bad)).toBeNull();
  });

  it('the generic parser keeps its default 0–50 range', () => {
    expect(parsePercent('50')).toBe(50);
    expect(parsePercent('50.01')).toBeNull();
    expect(parsePercent('80', { max: 100 })).toBe(80);
  });

  it('builds the PATCH body with only the changed rates, or errors', () => {
    expect(pricingPayload({ commissionPercent: '20', memberDiscountPercent: '50' }, { commissionPercent: 0, memberDiscountPercent: 0 })).toEqual({ errors: {}, body: { commissionPercent: 20, memberDiscountPercent: 50 } });
    expect(pricingPayload({ commissionPercent: '20', memberDiscountPercent: '25' }, { commissionPercent: 20, memberDiscountPercent: 50 }).body).toEqual({ memberDiscountPercent: 25 });
    expect(pricingPayload({ commissionPercent: '20', memberDiscountPercent: '50' }, { commissionPercent: 20, memberDiscountPercent: 50 }).body).toEqual({});
    const bad = pricingPayload({ commissionPercent: '120', memberDiscountPercent: '1.234' }, {});
    expect(bad.body).toBeNull();
    expect(bad.errors.commissionPercent).toMatch(/0 to 100/);
    expect(bad.errors.memberDiscountPercent).toMatch(/up to 2 decimals/);
  });

  it('formats percentages', () => {
    expect(formatPercent(20)).toBe('20%');
    expect(formatPercent(12.5)).toBe('12.5%');
    expect(formatPercent(undefined)).toBe('0%');
  });
});

describe('map locations', () => {
  it('validates and links to OpenStreetMap at the point', () => {
    const loc = validLocation({ lat: 22.5726, lng: 88.3639, label: 'Park Street, Kolkata' });
    expect(loc).toEqual({ lat: 22.5726, lng: 88.3639, label: 'Park Street, Kolkata' });
    expect(formatCoords(loc)).toBe('22.572600, 88.363900');
    expect(osmUrl(loc)).toBe('https://www.openstreetmap.org/?mlat=22.572600&mlon=88.363900#map=17/22.572600/88.363900');
    expect(validLocation(null)).toBeNull();
    expect(validLocation({ lat: 91, lng: 0 })).toBeNull();
    expect(validLocation({ lat: 0, lng: -181 })).toBeNull();
    expect(validLocation({ lat: 0, lng: 0 })).toEqual({ lat: 0, lng: 0, label: '' });
  });
});
