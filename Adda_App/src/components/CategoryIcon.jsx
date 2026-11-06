import Svg, { Circle, Path, Rect } from 'react-native-svg';
import ICON_SET from '../lib/serviceIcons.json';
import { colors } from '../theme';

const BY_KEY = Object.fromEntries(ICON_SET.icons.map((i) => [i.key, i]));
const TAGS = { path: Path, rect: Rect, circle: Circle };

/**
 * The icon key to draw for a category: the admin's choice when it is a known key, otherwise a match on an old
 * icon value or the category name (keywords), otherwise "others". Never throws on unknown data.
 */
export function resolveIconKey(icon, name = '') {
  if (icon && BY_KEY[icon]) return icon;
  const legacy = icon && ICON_SET.legacy[String(icon).replace(/-outline$/, '')];
  if (legacy) return legacy;
  const n = String(name).toLowerCase();
  const hit = n && ICON_SET.icons.find((i) => i.key !== 'others' && i.keywords.some((k) => n.includes(k)));
  return hit ? hit.key : 'others';
}

export const hasCategoryIcon = (key) => Boolean(BY_KEY[key]);

/**
 * Admin-chosen service-category icon (NIVASA two-tone set, shared with the panels via serviceIcons.json).
 * `color` draws it in one colour (e.g. gold on a navy box).
 */
export function CategoryIcon({ icon, name, size = 32, color }) {
  const def = BY_KEY[resolveIconKey(icon, name)];
  const tint = (c) => color || (c === 'g' ? colors.gold : colors.navy);
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {def.parts.map(([tag, a], i) => {
        const El = TAGS[tag];
        const { s, f, w, ...rest } = a;
        return <El key={i} {...rest} stroke={s ? tint(s) : undefined} strokeWidth={w} fill={f ? tint(f) : 'none'} strokeLinecap="round" strokeLinejoin="round" />;
      })}
    </Svg>
  );
}
