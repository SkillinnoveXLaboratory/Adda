/** Sidebar navigation: platform (Master) and the Society workspace (same screens a society admin uses). `perm` = permission needed to SEE the page (see lib/roles.js). */
export const SOCIETY_NAV = [
  {
    title: 'Main',
    items: [{ to: '/society', label: 'Dashboard', icon: 'fa-regular fa-compass', perm: 'society.read', end: true }],
  },
  {
    title: 'Residents',
    items: [
      { to: '/society/residents', label: 'Residents', icon: 'fa-solid fa-user-group', perm: 'members.read', badge: 'pendingMembers' },
      { to: '/society/structure', label: 'Buildings & flats', icon: 'fa-regular fa-building', perm: 'members.read' },
      { to: '/society/complaints', label: 'Complaints', icon: 'fa-solid fa-screwdriver-wrench', perm: 'complaints', badge: 'pendingComplaints' },
      { to: '/society/announcements', label: 'Notices', icon: 'fa-solid fa-bullhorn', perm: 'society.read' },
      { to: '/society/community', label: 'Community', icon: 'fa-regular fa-comments', perm: 'community', badge: 'openReports' },
      { to: '/society/voting', label: 'Voting', icon: 'fa-solid fa-square-poll-vertical', perm: 'community' },
      { to: '/society/facilities', label: 'Facilities & bookings', icon: 'fa-regular fa-calendar-check', perm: 'facilities', badge: 'pendingBookings' },
      { to: '/society/services', label: 'Service requests', icon: 'fa-solid fa-toolbox', perm: 'services', badge: 'openServiceRequests' },
      { to: '/society/listings', label: 'Listings', icon: 'fa-solid fa-store', perm: 'listings', badge: 'pendingListings' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/society/billing', label: 'Billing & invoices', icon: 'fa-solid fa-file-invoice', perm: 'finance.read' },
      { to: '/society/payments', label: 'Payments', icon: 'fa-solid fa-indian-rupee-sign', perm: 'finance.read' },
      { to: '/society/expenses', label: 'Expenses & income', icon: 'fa-solid fa-wallet', perm: 'finance.read' },
      { to: '/society/ledger', label: 'Ledger', icon: 'fa-solid fa-book', perm: 'finance.read' },
      { to: '/society/reports', label: 'Reports', icon: 'fa-regular fa-chart-bar', perm: 'reports' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/society/staff', label: 'Staff & roles', icon: 'fa-solid fa-user-shield', perm: 'society.read' },
      { to: '/society/profile', label: 'Society settings', icon: 'fa-solid fa-sliders', perm: 'society.read' },
      { to: '/society/categories', label: 'Categories', icon: 'fa-solid fa-tags', perm: 'society.read' },
      { to: '/society/audit', label: 'Audit log', icon: 'fa-solid fa-clock-rotate-left', perm: 'audit' },
    ],
  },
];

/**
 * Master Admin navigation. `area` = the permission area needed to SEE the page (lib/permissions.js):
 * a sub-admin sees an item only with `<area>.view`; `owner` = platform owner only; `self` = every platform admin.
 */
export const PLATFORM_NAV = [
  { title: 'Main', items: [{ to: '/admin', area: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-gauge-high', end: true }] },
  {
    title: 'Societies',
    items: [
      { to: '/admin/applications', area: 'applications', label: 'Applications', icon: 'fa-regular fa-file-lines', badge: 'pendingRegistrations' },
      { to: '/admin/societies', area: 'societies', label: 'All societies', icon: 'fa-regular fa-building' },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/admin/members', area: 'members', label: 'Members directory', icon: 'fa-solid fa-address-book', badge: 'pendingMembers' },
      { to: '/admin/users', area: 'accounts', label: 'Accounts', icon: 'fa-solid fa-users' },
      { to: '/admin/vendors', area: 'vendors', label: 'Vendors', icon: 'fa-solid fa-id-card', badge: 'pendingKyc' },
      { to: '/admin/service-bookings', area: 'service_bookings', label: 'Service bookings', icon: 'fa-regular fa-calendar-check' },
      { to: '/admin/earnings', area: 'earnings', label: 'Earnings', icon: 'fa-solid fa-wallet' },
    ],
  },
  {
    title: 'Oversight',
    items: [
      { to: '/admin/listings', area: 'listings', label: 'Listings moderation', icon: 'fa-solid fa-store', badge: 'pendingListings' },
      { to: '/admin/ads', area: 'ads', label: 'Ads (boosts)', icon: 'fa-solid fa-rocket', badge: 'pendingAds' },
      { to: '/admin/coupons', area: 'coupons', label: 'Coupons', icon: 'fa-solid fa-ticket' },
      { to: '/admin/reports', area: 'reports', label: 'Content reports', icon: 'fa-regular fa-flag', badge: 'openReports' },
      { to: '/admin/payments', area: 'payments', label: 'Payments monitor', icon: 'fa-solid fa-indian-rupee-sign' },
      { to: '/admin/audit', area: 'audit', label: 'Audit log', icon: 'fa-solid fa-clock-rotate-left' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { to: '/admin/categories', area: 'categories', label: 'Categories', icon: 'fa-solid fa-tags' },
      { to: '/admin/announcements', area: 'announcements', label: 'Platform notices', icon: 'fa-solid fa-bullhorn' },
      { to: '/admin/settings', area: 'settings', label: 'Settings', icon: 'fa-solid fa-sliders' },
      { to: '/admin/subadmins', area: 'owner', label: 'Sub-admins', icon: 'fa-solid fa-user-gear' },
      { to: '/admin/security', area: 'self', label: 'My security', icon: 'fa-solid fa-shield-halved' },
    ],
  },
];

/** Sections with only the items this user may open (empty sections dropped). */
export const visibleSections = (sections, canView) => sections.map((s) => ({ ...s, items: s.items.filter((i) => !i.area || canView(i.area)) })).filter((s) => s.items.length > 0);

/** Permission area of a Master Admin URL (longest matching nav item), e.g. '/admin/vendors/123' → 'vendors'. */
export function areaForPath(path) {
  const items = PLATFORM_NAV.flatMap((s) => s.items).filter((i) => i.to !== '/admin');
  const hit = items.filter((i) => path === i.to || path.startsWith(`${i.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  return hit ? hit.area : 'dashboard';
}
