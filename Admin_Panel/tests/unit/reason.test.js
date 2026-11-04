import { describe, expect, it } from 'vitest';
import { describeAction } from '../../src/components/ReasonPrompt.jsx';
import { scopePath } from '../../src/lib/api.js';

describe('workspace helpers', () => {
  it('describes an action without ids', () => {
    expect(describeAction('POST', '/society/memberships/64b7f0c2a1b2c3d4e5f60718/approve')).toBe('Memberships · approve');
    expect(describeAction('PATCH', '/society/profile')).toBe('Profile · update');
  });
  it('scopes only /society paths', () => {
    expect(scopePath('/society/overview', 's1')).toBe('/platform/societies/s1/manage/overview');
    expect(scopePath('/societyx', 's1')).toBe('/societyx');
    expect(scopePath('/platform/members', 's1')).toBe('/platform/members');
    expect(scopePath('/society/overview', null)).toBe('/society/overview');
  });
});
