import { describe, expect, it } from 'vitest';
import { isDay, monthLabel, periodRange, rangeError } from '../../src/lib/period.js';

describe('earnings period → from/to (IST calendar days)', () => {
  const today = '2026-11-09';
  it('this month, last 3 months, this year', () => {
    expect(periodRange('month', { today })).toEqual({ from: '2026-11-01', to: today });
    expect(periodRange('3m', { today })).toEqual({ from: '2026-09-01', to: today });
    expect(periodRange('year', { today })).toEqual({ from: '2026-01-01', to: today });
  });
  it('last 3 months crosses the year boundary', () => {
    expect(periodRange('3m', { today: '2027-01-15' })).toEqual({ from: '2026-11-01', to: '2027-01-15' });
    expect(periodRange('3m', { today: '2027-02-28' })).toEqual({ from: '2026-12-01', to: '2027-02-28' });
  });
  it('all time has no limits; custom passes the chosen days through', () => {
    expect(periodRange('all', { today })).toEqual({});
    expect(periodRange('custom', { today, from: '2026-10-01', to: '2026-10-31' })).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('custom', { today, from: '', to: '2026-10-31' })).toEqual({ from: undefined, to: '2026-10-31' });
  });
  it('default "today" is the India date', () => {
    const r = periodRange('month');
    expect(r.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.from).toBe(`${r.to.slice(0, 7)}-01`);
  });
  it('custom range validation', () => {
    expect(rangeError('2026-10-01', '2026-10-31')).toBeNull();
    expect(rangeError('2026-10-31', '2026-10-31')).toBeNull();
    expect(rangeError('', '')).toBeNull();
    expect(rangeError('2026-11-01', '2026-10-31')).toBe('“From” must be on or before “To”');
    expect(rangeError('2026-02-30', '')).toBe('Enter a valid “From” date');
    expect(rangeError('', '31-10-2026')).toBe('Enter a valid “To” date');
    expect(isDay('2028-02-29')).toBe(true);
    expect(isDay('2027-02-29')).toBe(false);
  });
  it('month labels', () => {
    expect(monthLabel('2026-11')).toBe('Nov 2026');
    expect(monthLabel('2026-01')).toBe('Jan 2026');
    expect(monthLabel('')).toBe('—');
  });
});
