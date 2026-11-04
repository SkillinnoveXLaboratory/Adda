/** Mirrors STAFF_PERMISSIONS in Backend/server.js (see API.md "Roles"). The server stays the authority. */
export const STAFF_PERMISSIONS = {
  admin: ['*'],
  secretary: ['society.read', 'members', 'members.read', 'community', 'complaints', 'facilities', 'services', 'announcements', 'listings', 'reports', 'finance.read', 'audit'],
  treasurer: ['society.read', 'finance', 'finance.read', 'reports', 'members.read', 'audit'],
  manager: ['society.read', 'complaints', 'facilities', 'services', 'community', 'members.read', 'listings'],
  committee: ['society.read', 'members.read', 'announcements', 'finance.read', 'reports'],
};

export const ROLE_LABELS = {
  admin: 'Admin',
  secretary: 'Secretary',
  treasurer: 'Treasurer',
  manager: 'Manager',
  committee: 'Committee member',
};

export const ROLE_DESCRIPTIONS = {
  admin: 'Full access to every module, staff and settings.',
  secretary: 'Residents, complaints, community, facilities, notices, listings, reports; read-only finance.',
  treasurer: 'Billing, payments, expenses, ledger and reports; read-only residents.',
  manager: 'Complaints, facilities, service requests, community and listings.',
  committee: 'Read-only overview, notices, finance and reports.',
};

export function can(role, perm) {
  const perms = STAFF_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(perm) || (perm.endsWith('.read') && perms.includes(perm.replace(/\.read$/, '')));
}

export const noPermissionReason = (role) => `Your role (${ROLE_LABELS[role] || role || 'unknown'}) cannot do this`;
