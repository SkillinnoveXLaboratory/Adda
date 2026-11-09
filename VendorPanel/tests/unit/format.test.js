import { describe, expect, it } from 'vitest';
import { dayParts, money, offerPrice, paiseToRupeesInput, time12, toPaise } from '../../src/lib/format.js';

describe('money is integer paise', () => {
  it('toPaise converts rupee text exactly (no float drift)', () => {
    expect(toPaise('99.99')).toBe(9999);
    expect(toPaise('0.29')).toBe(29);
    expect(toPaise('1,500.5')).toBe(150050);
    expect(toPaise('₹ 499')).toBe(49900);
    expect(toPaise('1005.07')).toBe(100507);
    expect(Number.isInteger(toPaise('19.99'))).toBe(true);
  });
  it('toPaise rejects junk, negatives and 3 decimals', () => {
    expect(toPaise('')).toBeNull();
    expect(toPaise('abc')).toBeNull();
    expect(toPaise('-5')).toBeNull();
    expect(toPaise('1.005')).toBeNull();
    expect(toPaise(null)).toBeNull();
  });
  it('paiseToRupeesInput round-trips', () => {
    expect(paiseToRupeesInput(49900)).toBe('499');
    expect(paiseToRupeesInput(49950)).toBe('499.50');
    expect(toPaise(paiseToRupeesInput(123456))).toBe(123456);
    expect(paiseToRupeesInput(null)).toBe('');
  });
  it('money shows ₹ with Indian grouping', () => {
    expect(money(12345600)).toBe('₹1,23,456');
    expect(money(49950)).toBe('₹499.50');
    expect(money(0)).toBe('₹0');
    expect(money(undefined)).toBe('—');
  });
});

describe('display helpers', () => {
  it('offerPrice follows the price type', () => {
    expect(offerPrice({ priceType: 'fixed', pricePaise: 49900 })).toBe('₹499');
    expect(offerPrice({ priceType: 'starting_from', pricePaise: 49900 })).toBe('From ₹499');
    expect(offerPrice({ priceType: 'per_hour', pricePaise: 20000 })).toBe('₹200 / hour');
    expect(offerPrice({ priceType: 'on_quote' })).toBe('Price on request');
  });
  it('dates are India calendar days', () => {
    expect(dayParts('2026-11-09')).toEqual({ weekday: 'Mon', day: '9', month: 'Nov' });
    expect(time12('14:30')).toBe('2:30 PM');
    expect(time12('00:05')).toBe('12:05 AM');
  });
});
