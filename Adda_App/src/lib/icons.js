/** Picks an Ionicons glyph for a facility from its name/icon hint. */
export const facilityIcon = (f) => {
  const n = `${f.icon || ''} ${f.name}`.toLowerCase();
  if (/pool|swim/.test(n)) return 'water';
  if (/gym|fitness/.test(n)) return 'barbell';
  if (/badminton|tennis|court|sport/.test(n)) return 'tennisball';
  if (/meeting|conference/.test(n)) return 'briefcase';
  if (/park|parking|car/.test(n)) return 'car';
  if (/hall|party|club|community/.test(n)) return 'sparkles';
  return 'calendar';
};
