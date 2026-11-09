/** Sidebar navigation of the Vendor Panel. `badge` = key in the counts loaded by VendorPortal. */
export const VENDOR_NAV = [
  {
    title: 'Main',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'fa-solid fa-gauge-high', end: true },
      { to: '/bookings', label: 'Bookings', icon: 'fa-regular fa-calendar-check', badge: 'newBookings' },
      { to: '/earnings', label: 'Earnings', icon: 'fa-solid fa-wallet' },
    ],
  },
  {
    title: 'Listings',
    items: [
      { to: '/services', label: 'Services', icon: 'fa-solid fa-screwdriver-wrench' },
      { to: '/properties', label: 'Properties', icon: 'fa-solid fa-building' },
      { to: '/boosts', label: 'Boosts', icon: 'fa-solid fa-rocket' },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/kyc', label: 'KYC & bank', icon: 'fa-solid fa-shield-halved', badge: 'kycTodo' },
      { to: '/notifications', label: 'Notifications', icon: 'fa-regular fa-bell', badge: 'unread' },
      { to: '/profile', label: 'Profile & security', icon: 'fa-regular fa-user' },
    ],
  },
];

/** Notification data.route (API.md) → panel path. */
export const NOTIFICATION_ROUTES = {
  MyProperties: '/properties',
  MyServices: '/services',
  VendorBookings: '/bookings',
  VendorAds: '/boosts',
  VendorKyc: '/kyc',
};
