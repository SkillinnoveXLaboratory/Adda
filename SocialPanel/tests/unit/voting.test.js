import { describe, expect, it } from 'vitest';
import { apiFieldErrors, closeTimeError, csvFileName, filterVoters, formatPercent, isEnded, istToISO, percentOf, timeLeft, timingText, turnoutText, validateVote, votersCsv } from '../../src/lib/voting.js';

const NOW = Date.parse('2026-11-09T06:30:00Z'); // 12:00 noon IST

describe('percent and turnout', () => {
  it('rounds to one decimal like the server and never returns NaN', () => {
    expect(percentOf(1, 2)).toBe(50);
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(2, 3)).toBe(66.7);
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(undefined, 4)).toBe(0);
  });
  it('formats percentages', () => {
    expect(formatPercent(50)).toBe('50%');
    expect(formatPercent(33.3)).toBe('33.3%');
    expect(formatPercent(100)).toBe('100%');
    expect(formatPercent(undefined)).toBe('0%');
    expect(formatPercent(NaN)).toBe('0%');
  });
  it('turnout text: x of y members (z%)', () => {
    expect(turnoutText(2, 2, 100)).toBe('2 of 2 members (100%)');
    expect(turnoutText(1, 3)).toBe('1 of 3 members (33.3%)');
    expect(turnoutText(0, 0, 0)).toBe('0 of 0 members (0%)');
    expect(turnoutText(0, 1)).toBe('0 of 1 member (0%)');
    expect(turnoutText(1200, 1500, 80)).toBe('1,200 of 1,500 members (80%)');
  });
});

describe('IST close time', () => {
  it('turns an IST date + time into ISO with the +05:30 offset', () => {
    expect(istToISO('2026-11-10', '18:30')).toBe('2026-11-10T18:30:00+05:30');
    expect(new Date(istToISO('2026-11-10', '18:30')).toISOString()).toBe('2026-11-10T13:00:00.000Z');
    expect(istToISO('2026-11-10', '')).toBeNull();
    expect(istToISO('10/11/2026', '18:30')).toBeNull();
  });
  it('validates 5 minutes – 1 year ahead (India time)', () => {
    expect(closeTimeError('', '', NOW)).toBeNull();
    expect(closeTimeError('2026-11-10', '', NOW)).toMatch(/both a date and a time/);
    expect(closeTimeError('2026-11-09', '11:00', NOW)).toMatch(/at least 5 minutes/); // 11:00 IST is in the past
    expect(closeTimeError('2026-11-09', '12:03', NOW)).toMatch(/at least 5 minutes/);
    expect(closeTimeError('2026-11-09', '12:06', NOW)).toBeNull();
    expect(closeTimeError('2027-11-08', '12:00', NOW)).toBeNull();
    expect(closeTimeError('2027-11-10', '12:00', NOW)).toMatch(/up to a year/);
  });
});

describe('time left / ended', () => {
  it('counts down', () => {
    expect(timeLeft(null, NOW)).toBeNull();
    expect(timeLeft(new Date(NOW - 1000).toISOString(), NOW)).toBeNull();
    expect(timeLeft(new Date(NOW + 30_000).toISOString(), NOW)).toBe('Closes in under a minute');
    expect(timeLeft(new Date(NOW + 12 * 60_000).toISOString(), NOW)).toBe('Closes in 12m');
    expect(timeLeft(new Date(NOW + 200 * 60_000).toISOString(), NOW)).toBe('Closes in 3h 20m');
    expect(timeLeft(new Date(NOW + 52 * 3600_000).toISOString(), NOW)).toBe('Closes in 2d 4h');
  });
  it('ended uses the server flag, else status / close time', () => {
    expect(isEnded({ ended: true, status: 'open' }, NOW)).toBe(true);
    expect(isEnded({ status: 'closed' }, NOW)).toBe(true);
    expect(isEnded({ status: 'open', closesAt: new Date(NOW - 1).toISOString() }, NOW)).toBe(true);
    expect(isEnded({ status: 'open', closesAt: null }, NOW)).toBe(false);
  });
  it('timing text shows the IST end date', () => {
    expect(timingText({ ended: true, closedAt: '2026-11-08T12:30:00Z' }, NOW)).toMatch(/^Ended 08 Nov 2026, 6:00 pm$/i);
    expect(timingText({ ended: false, status: 'open' }, NOW)).toBe('Open until you end it');
    expect(timingText({ ended: false, status: 'open', closesAt: '2026-11-09T12:30:00Z' }, NOW)).toMatch(/^Closes in 6h · 09 Nov 2026, 6:00 pm$/i);
  });
});

describe('new vote form', () => {
  const good = { question: 'Should we install solar panels?', note: '', options: ['Interested', 'Not interested'], closeDate: '', closeTime: '' };
  it('accepts the default form', () => expect(validateVote(good, NOW)).toEqual({}));
  it('gives specific errors', () => {
    expect(validateVote({ ...good, question: 'Hi' }, NOW).question).toMatch(/at least 5/);
    expect(validateVote({ ...good, question: '' }, NOW).question).toMatch(/Write the question/);
    expect(validateVote({ ...good, options: ['Yes'] }, NOW).options).toMatch(/at least 2/);
    expect(validateVote({ ...good, options: ['A', 'B', 'C', 'D', 'E'] }, NOW).options).toMatch(/at most 4/);
    expect(validateVote({ ...good, options: ['Yes', ' '] }, NOW).options).toMatch(/Fill in every option/);
    expect(validateVote({ ...good, options: ['Yes', 'yes'] }, NOW).options).toMatch(/different/);
    expect(validateVote({ ...good, closeDate: '2026-11-09', closeTime: '11:00' }, NOW).closes).toMatch(/5 minutes/);
  });
  it('maps server validation details onto fields', () => {
    expect(apiFieldErrors({ details: [{ path: 'closesAt', message: 'Voting must stay open for at least 5 minutes' }] })).toEqual({ closes: 'Voting must stay open for at least 5 minutes' });
    expect(apiFieldErrors({ details: [{ path: 'options.1', message: 'Too long' }] })).toEqual({ options: 'Too long' });
    expect(apiFieldErrors({ message: 'Poll options must be unique' })).toEqual({ form: 'Poll options must be unique' });
  });
});

describe('voters', () => {
  const votes = [
    { name: 'Rahul Voter', flat: 'A-101', optionLabel: 'Interested', votedAt: '2026-11-09T05:00:00Z' },
    { name: 'Priya, "P" Shah', flat: 'B-202', optionLabel: 'Not interested', votedAt: '2026-11-09T06:00:00Z' },
    { name: '=HYPERLINK("x")', flat: null, optionLabel: 'Interested', votedAt: '2026-11-09T06:10:00Z' },
  ];
  it('searches by name or flat', () => {
    expect(filterVoters(votes, 'rahul').map((v) => v.flat)).toEqual(['A-101']);
    expect(filterVoters(votes, 'b-20').map((v) => v.flat)).toEqual(['B-202']);
    expect(filterVoters(votes, '  ')).toHaveLength(3);
    expect(filterVoters(undefined, 'x')).toEqual([]);
  });
  it('exports CSV with IST times, quoting, and no formulas', () => {
    const csv = votersCsv(votes).split('\r\n');
    expect(csv[0]).toBe('Name,Flat,Option,Voted at (IST)');
    expect(csv[1]).toMatch(/^Rahul Voter,A-101,Interested,"09 Nov 2026, 10:30 am"$/i);
    expect(csv[2]).toMatch(/^"Priya, ""P"" Shah",B-202,Not interested,/);
    expect(csv[3]).toMatch(/^"'=HYPERLINK\(""x""\)",,Interested,/);
  });
  it('builds a file name from the question', () => {
    expect(csvFileName('Should we install solar panels?')).toBe('vote-should-we-install-solar-panels.csv');
    expect(csvFileName('???')).toBe('vote-results.csv');
  });
});
