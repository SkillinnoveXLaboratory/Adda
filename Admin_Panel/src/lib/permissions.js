/**
 * Master Admin permissions (mirror of PLATFORM_PERMISSIONS / normalizePlatformPermissions in Backend/server.js).
 * The owner (platformRole 'super_admin') has everything; a sub-admin ('sub_admin') only what the owner ticked.
 * "<area>.manage" always includes "<area>.view". The server enforces every rule — the panel only hides.
 */

/** Areas with only a "view" permission (no buttons to manage). */
export const VIEW_ONLY_AREAS = new Set(['dashboard', 'service_bookings', 'earnings', 'reports', 'payments', 'audit']);

export const isOwnerUser = (user) => user?.platformRole === 'super_admin';
export const isSubAdminUser = (user) => user?.platformRole === 'sub_admin';
/** May use the Master Admin console at all (owner or sub-admin). */
export const isPlatformAdminUser = (user) => isOwnerUser(user) || isSubAdminUser(user);

/** Unique permissions; every "x.manage" adds "x.view". Unknown shapes are dropped. */
export function normalizePermissions(list) {
  const set = new Set();
  for (const p of Array.isArray(list) ? list : []) {
    if (typeof p !== 'string' || !/^[a-z_]+\.(view|manage)$/.test(p)) continue;
    const [area, level] = p.split('.');
    if (level === 'manage' && VIEW_ONLY_AREAS.has(area)) continue;
    set.add(p);
    if (level === 'manage') set.add(`${area}.view`);
  }
  return [...set];
}

/** Can this user see the area's page? Owner → always. Areas marked `owner` (Sub-admins) → owner only. */
export function canViewArea(user, area) {
  if (isOwnerUser(user)) return true;
  if (!isSubAdminUser(user) || !area || area === 'owner') return false;
  if (area === 'self') return true; // pages every platform admin has (My security)
  return normalizePermissions(user.platformPermissions).includes(`${area}.view`);
}

/** Can this user use the area's write buttons? */
export function canManageArea(user, area) {
  if (isOwnerUser(user)) return true;
  if (!isSubAdminUser(user) || !area || area === 'owner' || VIEW_ONLY_AREAS.has(area)) return false;
  return normalizePermissions(user.platformPermissions).includes(`${area}.manage`);
}

/**
 * Permission grid helpers for the Sub-admins form. `perms` is a Set of keys.
 * Ticking Manage ticks View; unticking View unticks Manage.
 */
export function togglePermission(perms, area, level, on) {
  const next = new Set(perms);
  if (level === 'manage') {
    if (on) (next.add(`${area}.manage`), next.add(`${area}.view`));
    else next.delete(`${area}.manage`);
  } else if (on) next.add(`${area}.view`);
  else (next.delete(`${area}.view`), next.delete(`${area}.manage`));
  return next;
}

/** Every key in the server catalogue ([{ area, viewOnly }]). */
export const allPermissions = (catalogue = []) => catalogue.flatMap((c) => (c.viewOnly ? [`${c.area}.view`] : [`${c.area}.view`, `${c.area}.manage`]));

/** Keys in catalogue order (what we send to the server). */
export const orderedPermissions = (perms, catalogue = []) => allPermissions(catalogue).filter((k) => perms.has(k));
