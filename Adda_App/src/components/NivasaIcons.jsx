import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';
import { CategoryIcon, hasCategoryIcon } from './CategoryIcon';

/**
 * Two-tone navy + gold line icons from the NIVASA screen templates (_templates_.txt).
 * Home modules use a 64-unit grid, the society / maintenance grids a 40-unit grid (as in the templates).
 */
const N = colors.navy;
const G = colors.gold;

const ICONS = {
  // ---- home modules (viewBox 0 0 64 64)
  society: [
    64,
    <>
      <Path d="M12 56V20L28 12V56" stroke={G} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M28 28H48V56" stroke={N} strokeWidth={3} strokeLinejoin="round" />
      <Rect x={18} y={26} width={4} height={4} fill={N} />
      <Rect x={18} y={36} width={4} height={4} fill={N} />
      <Rect x={18} y={46} width={4} height={4} fill={N} />
      <Rect x={34} y={34} width={4} height={4} fill={G} />
      <Rect x={34} y={44} width={4} height={4} fill={G} />
      <Path d="M8 56H52" stroke={N} strokeWidth={3} strokeLinecap="round" />
    </>,
  ],
  properties: [
    64,
    <>
      <Path d="M16 28L32 14L48 28V52H16V28Z" stroke={G} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M28 52V38H36V52" stroke={N} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M10 52H54" stroke={N} strokeWidth={3} strokeLinecap="round" />
    </>,
  ],
  maintenance: [
    64,
    <>
      <Path d="M42 16C37 11 29 12 24 17C21.5 19.5 20.5 23 21 26L12 35L17 40L26 31C29 31.5 32.5 30.5 35 28C40 23 41 15 42 16Z" stroke={G} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M38 38L50 50" stroke={N} strokeWidth={4} strokeLinecap="round" />
    </>,
  ],
  community: [
    64,
    <>
      <Circle cx={32} cy={22} r={7} stroke={N} strokeWidth={3} />
      <Path d="M18 48C18 38 24 34 32 34C40 34 46 38 46 48" stroke={N} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={46} cy={20} r={5} stroke={G} strokeWidth={2.5} />
      <Path d="M44 38C48 39 54 42 54 48" stroke={G} strokeWidth={2.5} strokeLinecap="round" />
    </>,
  ],
  // ---- society grid (viewBox 0 0 40 40)
  bills: [
    40,
    <>
      <Rect x={10} y={6} width={20} height={28} rx={3} stroke={N} strokeWidth={2.2} />
      <Path d="M15 12H25" stroke={G} strokeWidth={2} strokeLinecap="round" />
      <Path d="M15 17H25" stroke={G} strokeWidth={2} strokeLinecap="round" />
      <Path d="M15 22H21" stroke={N} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={24} cy={25} r={3} fill={G} />
    </>,
  ],
  payments: [
    40,
    <>
      <Rect x={7} y={11} width={26} height={18} rx={3} stroke={N} strokeWidth={2.2} />
      <Path d="M7 17H33" stroke={G} strokeWidth={2.5} />
      <Rect x={11} y={22} width={6} height={3} rx={1} fill={G} />
    </>,
  ],
  complaints: [
    40,
    <>
      <Path d="M11 20L23 11V29L11 20Z" fill={N} />
      <Path d="M23 15L29 11M23 25L29 29M23 20H31" stroke={G} strokeWidth={2.2} strokeLinecap="round" />
    </>,
  ],
  notices: [
    40,
    <>
      <Rect x={9} y={8} width={22} height={24} rx={2} stroke={N} strokeWidth={2.2} />
      <Path d="M20 5V9" stroke={G} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M14 16H26" stroke={G} strokeWidth={2} strokeLinecap="round" />
      <Path d="M14 21H23" stroke={N} strokeWidth={2} strokeLinecap="round" />
    </>,
  ],
  people: [
    40,
    <>
      <Circle cx={18} cy={15} r={5} stroke={N} strokeWidth={2.2} />
      <Path d="M10 29C10 23.5 13.5 21.5 18 21.5" stroke={N} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={26} cy={18} r={3.5} stroke={G} strokeWidth={2} />
      <Path d="M22 29C22 25 24 23.5 27 23.5" stroke={G} strokeWidth={2} strokeLinecap="round" />
    </>,
  ],
  calendar: [
    40,
    <>
      <Rect x={8} y={10} width={24} height={20} rx={3} stroke={N} strokeWidth={2.2} />
      <Path d="M14 6V10M26 6V10" stroke={G} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx={15} cy={20} r={2} fill={G} />
      <Circle cx={25} cy={20} r={2} fill={G} />
      <Path d="M14 25C17 27 23 27 26 25" stroke={N} strokeWidth={2} strokeLinecap="round" />
    </>,
  ],
  amenities: [
    40,
    <>
      <Path d="M10 25C13 22 17 28 20 25C23 22 27 28 30 25" stroke={N} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M10 30C13 27 17 33 20 30C23 27 27 33 30 30" stroke={N} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={16} cy={12} r={3} stroke={G} strokeWidth={2} />
      <Path d="M22 12L28 18" stroke={G} strokeWidth={2.2} strokeLinecap="round" />
    </>,
  ],
  accounting: [
    40,
    <>
      <Rect x={10} y={7} width={20} height={26} rx={3} stroke={N} strokeWidth={2.2} />
      <Rect x={14} y={11} width={12} height={6} rx={1} fill={G} />
      <Circle cx={15} cy={22} r={1.5} fill={N} />
      <Circle cx={20} cy={22} r={1.5} fill={N} />
      <Circle cx={25} cy={22} r={1.5} fill={N} />
      <Circle cx={15} cy={27} r={1.5} fill={N} />
      <Circle cx={20} cy={27} r={1.5} fill={N} />
      <Circle cx={25} cy={27} r={1.5} fill={G} />
    </>,
  ],
  // ---- extra features in the same style (no template icon exists for these)
  market: [
    40,
    <>
      <Path d="M10 15H30L28 32H12L10 15Z" stroke={N} strokeWidth={2.2} strokeLinejoin="round" />
      <Path d="M15 15V12C15 9.2 17.2 7 20 7C22.8 7 25 9.2 25 12V15" stroke={G} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={20} cy={23} r={2} fill={G} />
    </>,
  ],
  requests: [
    40,
    <>
      <Rect x={9} y={8} width={22} height={25} rx={3} stroke={N} strokeWidth={2.2} />
      <Path d="M14 15L16 17L20 13" stroke={G} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 23H26M14 28H22" stroke={N} strokeWidth={2} strokeLinecap="round" />
    </>,
  ],
  boost: [
    40,
    <>
      <Path d="M20 7L24 17H33L26 23L29 33L20 27L11 33L14 23L7 17H16L20 7Z" stroke={N} strokeWidth={2.2} strokeLinejoin="round" />
      <Circle cx={20} cy={20} r={3} fill={G} />
    </>,
  ],
  shield: [
    40,
    <>
      <Path d="M20 6L31 10V19C31 26 26 31 20 34C14 31 9 26 9 19V10L20 6Z" stroke={N} strokeWidth={2.2} strokeLinejoin="round" />
      <Path d="M15 20L18.5 23.5L25 16" stroke={G} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </>,
  ],
  cash: [
    40,
    <>
      <Rect x={6} y={12} width={28} height={17} rx={3} stroke={N} strokeWidth={2.2} />
      <Circle cx={20} cy={20.5} r={4} stroke={G} strokeWidth={2.2} />
      <Circle cx={11} cy={20.5} r={1.5} fill={G} />
      <Circle cx={29} cy={20.5} r={1.5} fill={G} />
    </>,
  ],
};

/** <NIcon name="bills" size={32} /> — also draws service-category icon keys (serviceIcons.json); unknown names → "others". */
export function NIcon({ name, size = 32 }) {
  if (!ICONS[name]) return <CategoryIcon icon={hasCategoryIcon(name) ? name : 'others'} size={size} />;
  const [box, body] = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {body}
    </Svg>
  );
}

export const NICON_NAMES = Object.keys(ICONS);
