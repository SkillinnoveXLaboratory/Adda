/** Sidebar navigation for the society portal. `perm` = permission needed to SEE the page (see lib/roles.js). */
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

/** Notification data.route (API.md) → panel path. */
export const NOTIFICATION_ROUTES = {
  memberships: '/society/residents',
  complaints: '/society/complaints',
  ComplaintDetail: '/society/complaints',
  bookings: '/society/facilities',
  Bookings: '/society/facilities',
  services: '/society/services',
  ServiceRequests: '/society/services',
  listings: '/society/listings',
  moderation: '/society/community',
  Community: '/society/community',
  Poll: '/society/voting',
  Invoice: '/society/billing',
  Payments: '/society/payments',
  Receipt: '/society/payments',
  NoticeDetail: '/society/announcements',
};
