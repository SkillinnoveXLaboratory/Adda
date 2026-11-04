import { describe, expect, it } from 'vitest';
import { formatDate, formatINR, formatINRShort, formatPeriod, formatPhone, humanize, paiseToRupeesInput, plural, rupeesToPaise, todayIST } from '../../src/lib/format.js';

describe('money', () => {
  it('formats integer paise as en-IN rupees', () => {
    expect(formatINR(12345678)).toBe('₹1,23,456.78');
    expect(formatINR(0)).toBe('₹0.00');
    expect(formatINR(-15000)).toBe('-₹150.00');
    expect(formatINR(9999950, { whole: true })).toBe('₹1,00,000');
    expect(formatINR(undefined)).toBe('—');
  });
  it('converts rupee input to paise with Math.round and rejects bad input', () => {
    expect(rupeesToPaise('1500')).toBe(150000);
    expect(rupeesToPaise('1,500.5')).toBe(150050);
    expect(rupeesToPaise('0.29')).toBe(29); // 0.29 * 100 = 28.999… without rounding
    expect(rupeesToPaise('₹ 19.99')).toBe(1999);
    expect(rupeesToPaise('1.234')).toBeNull();
    expect(rupeesToPaise('-5')).toBeNull();
    expect(rupeesToPaise('-5', { allowNegative: true })).toBe(-500);
    expect(rupeesToPaise('abc')).toBeNull();
  });
  it('round-trips paise to an editable rupee string', () => {
    expect(paiseToRupeesInput(150000)).toBe('1500');
    expect(paiseToRupeesInput(150050)).toBe('1500.50');
    expect(paiseToRupeesInput(null)).toBe('');
  });
  it('short axis labels use K / L / Cr', () => {
    expect(formatINRShort(95000)).toBe('₹950');
    expect(formatINRShort(1250000)).toBe('₹12.5K');
    expect(formatINRShort(32000000)).toBe('₹3.2L');
    expect(formatINRShort(1100000000)).toBe('₹1.1Cr');
  });
});

describe('dates & text', () => {
  it('formats dates in IST', () => {
    expect(formatDate('2026-10-26T20:00:00Z')).toBe('27 Oct 2026'); // 01:30 IST on the next day
    expect(formatDate('2026-10-05')).toBe('05 Oct 2026');
    expect(formatPeriod('2026-10')).toBe('Oct 2026');
  });
  it('todayIST is the IST calendar day', () => {
    expect(todayIST(new Date('2026-10-26T19:00:00Z'))).toBe('2026-10-27');
  });
  it('helpers', () => {
    expect(humanize('in_progress')).toBe('In progress');
    expect(formatPhone('9876543210')).toBe('+91 98765 43210');
    expect(plural(1, 'invoice')).toBe('1 invoice');
    expect(plural(1200, 'entry', 'entries')).toBe('1,200 entries');
  });
});
