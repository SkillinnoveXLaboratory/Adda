import { Image, View } from 'react-native';
import { colors } from '../theme';
import { T } from './Text';

export const BRAND = 'NIVASA';
export const TAGLINE = 'One Platform. Every Property Need.';

// 320 px copy of assets/images/App_main_icon.png (the full file is 1.3 MB).
const MARK = require('../../assets/images/logo-mark.png');

/** The gold house-N mark on its navy tile. */
export function LogoMark({ size = 40, rounded = true, style }) {
  return <Image source={MARK} accessibilityLabel={`${BRAND} logo`} style={[{ width: size, height: size, borderRadius: rounded ? size * 0.22 : 0 }, style]} resizeMode="cover" />;
}

/**
 * Stacked logo: mark + wordmark (+ tagline). `light` = for navy backgrounds.
 * `width` sets the mark size (kept for existing callers).
 */
export function Logo({ width = 96, light = false, tagline = true }) {
  const markSize = Math.round(width * 0.7);
  return (
    <View style={{ alignItems: 'center' }}>
      <LogoMark size={markSize} />
      <T weight="extrabold" size={Math.max(18, Math.round(width / 4.2))} color={light ? colors.white : colors.navy} style={{ letterSpacing: 2.5, marginTop: 10 }}>
        {BRAND}
      </T>
      {tagline ? (
        <T weight="medium" size={11} color={light ? '#cbd5e1' : colors.muted} style={{ letterSpacing: 0.3, marginTop: 2 }}>
          {TAGLINE}
        </T>
      ) : null}
    </View>
  );
}

/** Inline brand for top bars: small mark + NIVASA wordmark. */
export function BrandBar({ light = false }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <LogoMark size={30} />
      <T weight="extrabold" size={17} color={light ? colors.white : colors.navy} style={{ letterSpacing: 0.4 }}>
        {BRAND}
      </T>
    </View>
  );
}
