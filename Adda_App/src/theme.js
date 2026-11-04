/**
 * NIVASA design tokens (navy + gold, slate neutrals, Plus Jakarta Sans), from the NIVASA mobile prototype.
 * Token names are kept stable so every screen picks the theme up from here.
 */
export const colors = {
  // brand
  navy: '#0b1a30',
  navyDark: '#071222',
  navySoft: '#1e293b',
  gold: '#d4af37',
  goldDark: '#b89428',
  goldLight: '#f9f3dd',
  goldText: '#8a6d12',
  logoBg: '#032143',

  primary: '#0b1a30',
  blue: '#0b1a30',
  link: '#2563eb',
  heroFrom: '#0b1a30',
  heroTo: '#1e293b',
  balanceFrom: '#0b1a30',
  balanceTo: '#1e293b',
  coral: '#d4af37',
  coralFrom: '#0b1a30',
  coralTo: '#1e293b',
  coralText: '#0b1a30',

  // surfaces & text (slate)
  bg: '#f4f6f9',
  card: '#ffffff',
  text: '#1e293b',
  textSoft: '#334155',
  muted: '#64748b',
  subtle: '#94a3b8',
  border: '#e2e8f0',
  inputBorder: '#e2e8f0',
  inputBg: '#f8fafc',
  divider: '#f1f5f9',
  chip: '#e2e8f0',
  chipText: '#475569',
  chipOn: '#0b1a30',
  iconBg: '#f9f3dd',
  iconFg: '#0b1a30',
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
  card: { shadowColor: '#0b1a30', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  button: { shadowColor: '#0b1a30', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  gold: { shadowColor: '#b89428', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  coral: { shadowColor: '#0b1a30', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
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
};
export const toneFor = (status) => STATUS_TONE[status] || 'neutral';
