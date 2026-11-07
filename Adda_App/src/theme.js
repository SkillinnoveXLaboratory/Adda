/**
 * NIVASA design tokens (navy + gold, Plus Jakarta Sans) from the NIVASA screen templates (_templates_.txt).
 * Token names are kept stable so every screen picks the theme up from here.
 */
export const colors = {
  // brand
  navy: '#07162c',
  navyDark: '#040e1d',
  navySoft: '#12315b',
  navyMid: '#0c2445',
  gold: '#ca9e3b',
  goldDark: '#b38a2e',
  goldLight: '#f4ecd8',
  goldText: '#8a6a1f',
  logoBg: '#032143',
  sky: '#032750', // top edge of the splash photo (splash + Get Started backdrop)

  primary: '#07162c',
  blue: '#07162c',
  link: '#2563eb',
  heroFrom: '#07162c',
  heroTo: '#12315b',
  balanceFrom: '#07162c',
  balanceTo: '#12315b',
  coral: '#ca9e3b',
  coralFrom: '#07162c',
  coralTo: '#12315b',
  coralText: '#07162c',

  // surfaces & text (slate)
  bg: '#f4f6fb',
  searchBg: '#f1f4f9',
  card: '#ffffff',
  text: '#1e293b',
  textSoft: '#334155',
  muted: '#637381',
  subtle: '#94a3b8',
  border: '#eef2f7',
  inputBorder: '#e2e8f0',
  inputBg: '#f8fafc',
  divider: '#f1f5f9',
  chip: '#e2e8f0',
  chipText: '#475569',
  chipOn: '#07162c',
  iconBg: '#f4ecd8',
  iconFg: '#07162c',
  hint: '#f1f5f9',
  hintText: '#475569',

  // status
  green: '#047857',
  greenBg: '#d1fae5',
  greenStrong: '#059669',
  amber: '#b45309',
  amberBg: '#fef3c7',
  danger: '#dc2626',
  dangerBg: '#fee2e2',
  white: '#ffffff',
  overlay: 'rgba(7, 18, 34, 0.55)',

  // module tiles (pastel icon backgrounds from the prototype)
  tileBlue: ['#eff6ff', '#2563eb'],
  tileAmber: ['#fffbeb', '#d97706'],
  tileGreen: ['#ecfdf5', '#059669'],
  tilePurple: ['#faf5ff', '#9333ea'],
  tileRose: ['#fff1f2', '#e11d48'],
  tileSlate: ['#f1f5f9', '#334155'],
};

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

/** Prototype radii: rounded-xl (12) for inputs/buttons/tiles, rounded-2xl (16) for cards. */
export const radius = { sm: 8, md: 12, lg: 12, xl: 16, xxl: 20, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const shadow = {
  card: { shadowColor: '#07162c', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  button: { shadowColor: '#07162c', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  gold: { shadowColor: '#b38a2e', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  coral: { shadowColor: '#07162c', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
};

/** Status → badge colours (prototype pills: emerald / amber / blue / red / slate). */
export const badgeTone = {
  warning: { bg: '#fef3c7', fg: '#b45309' },
  success: { bg: '#d1fae5', fg: '#047857' },
  info: { bg: '#dbeafe', fg: '#1d4ed8' },
  danger: { bg: '#fee2e2', fg: '#b91c1c' },
  neutral: { bg: '#f1f5f9', fg: '#475569' },
};

const STATUS_TONE = {
  unpaid: 'warning',
  pending: 'warning',
  requested: 'warning',
  partially_paid: 'warning',
  overdue: 'danger',
  paid: 'success',
  resolved: 'success',
  closed: 'neutral',
  confirmed: 'success',
  approved: 'success',
  captured: 'success',
  completed: 'success',
  active: 'success',
  available: 'success',
  assigned: 'info',
  in_progress: 'info',
  accepted: 'info',
  scheduled: 'info',
  rejected: 'danger',
  cancelled: 'neutral',
  failed: 'danger',
  reversed: 'danger',
  refunded: 'neutral',
  partially_refunded: 'neutral',
  suspended: 'danger',
  removed: 'danger',
  sold: 'neutral',
  rented: 'neutral',
  inactive: 'neutral',
  declined: 'danger',
  expired: 'neutral',
  not_submitted: 'warning',
  sponsored: 'warning',
};
export const toneFor = (status) => STATUS_TONE[status] || 'neutral';
