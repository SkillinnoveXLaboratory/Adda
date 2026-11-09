import { describe, expect, it } from 'vitest';
import { allPermissions, canManageArea, canViewArea, isPlatformAdminUser, normalizePermissions, orderedPermissions, togglePermission } from '../../src/lib/permissions.js';
import { areaForPath, PLATFORM_NAV, visibleSections } from '../../src/layout/nav.js';

const owner = { platformRole: 'super_admin' };
const sub = (platformPermissions) => ({ platformRole: 'sub_admin', platformPermissions });
const CATALOGUE = [
  { area: 'dashboard', viewOnly: true },
  { area: 'vendors' },
  { area: 'coupons' },
  { area: 'audit', viewOnly: true },
];

describe('platform permissions', () => {
  it('only the owner and sub-admins may use Master Admin', () => {
    expect(isPlatformAdminUser(owner)).toBe(true);
    expect(isPlatformAdminUser(sub([]))).toBe(true);
    expect(isPlatformAdminUser({ platformRole: 'user' })).toBe(false);
    expect(isPlatformAdminUser(null)).toBe(false);
  });

  it('the owner can view and manage everything, including owner-only pages', () => {
    for (const area of ['vendors', 'settings', 'owner', 'self', 'dashboard']) {
      expect(canViewArea(owner, area)).toBe(true);
      expect(canManageArea(owner, area)).toBe(true);
    }
  });

  it('manage implies view; unknown and view-only manage keys are dropped', () => {
    expect(normalizePermissions(['coupons.manage', 'bogus', 'x.y.z', 42, 'audit.manage', 'vendors.view', 'vendors.view']).sort()).toEqual(['coupons.manage', 'coupons.view', 'vendors.view']);
    expect(normalizePermissions(undefined)).toEqual([]);
  });

  it('a sub-admin sees only ticked areas and manages only with manage', () => {
    const u = sub(['vendors.view', 'coupons.manage']);
    expect(canViewArea(u, 'vendors')).toBe(true);
    expect(canManageArea(u, 'vendors')).toBe(false);
    expect(canViewArea(u, 'coupons')).toBe(true);
    expect(canManageArea(u, 'coupons')).toBe(true);
    expect(canViewArea(u, 'settings')).toBe(false);
    expect(canViewArea(u, 'dashboard')).toBe(false);
    expect(canViewArea(u, 'owner')).toBe(false);
    expect(canViewArea(u, 'self')).toBe(true);
    expect(canManageArea(sub(['audit.view']), 'audit')).toBe(false);
    expect(canViewArea({ platformRole: 'user', platformPermissions: ['vendors.view'] }, 'vendors')).toBe(false);
  });

  it('sidebar keeps only the allowed items and drops empty sections', () => {
    const u = sub(['vendors.view', 'coupons.manage']);
    const sections = visibleSections(PLATFORM_NAV, (a) => canViewArea(u, a));
    expect(sections.flatMap((s) => s.items.map((i) => i.label))).toEqual(['Vendors', 'Coupons', 'My security']);
    expect(sections.map((s) => s.title)).toEqual(['People', 'Oversight', 'Configuration']);
    const all = visibleSections(PLATFORM_NAV, (a) => canViewArea(owner, a)).flatMap((s) => s.items);
    expect(all.map((i) => i.to)).toContain('/admin/subadmins');
    expect(PLATFORM_NAV.flatMap((s) => s.items).every((i) => i.area)).toBe(true);
  });

  it('maps URLs to their permission area', () => {
    expect(areaForPath('/admin')).toBe('dashboard');
    expect(areaForPath('/admin/vendors/abc')).toBe('vendors');
    expect(areaForPath('/admin/service-bookings')).toBe('service_bookings');
    expect(areaForPath('/admin/subadmins')).toBe('owner');
    expect(areaForPath('/admin/users')).toBe('accounts');
  });

  it('permission grid: Manage ticks View, unticking View unticks Manage', () => {
    let p = new Set();
    p = togglePermission(p, 'vendors', 'manage', true);
    expect([...p].sort()).toEqual(['vendors.manage', 'vendors.view']);
    p = togglePermission(p, 'vendors', 'manage', false);
    expect([...p]).toEqual(['vendors.view']);
    p = togglePermission(p, 'vendors', 'manage', true);
    p = togglePermission(p, 'vendors', 'view', false);
    expect(p.size).toBe(0);
  });

  it('select all / ordering follow the server catalogue', () => {
    expect(allPermissions(CATALOGUE)).toEqual(['dashboard.view', 'vendors.view', 'vendors.manage', 'coupons.view', 'coupons.manage', 'audit.view']);
    expect(orderedPermissions(new Set(['audit.view', 'coupons.manage', 'coupons.view']), CATALOGUE)).toEqual(['coupons.view', 'coupons.manage', 'audit.view']);
  });
});
