import { Text } from 'react-native';
import { colors, fonts } from '../theme';

/**
 * App text. Custom fonts on Android ignore fontWeight, so weight selects the font file instead.
 * Font scaling stays enabled (capped) so text never clips at large system font sizes.
 */
export function T({ weight = 'regular', size = 14, color = colors.text, style, children, ...rest }) {
  return (
    <Text maxFontSizeMultiplier={1.35} style={[{ fontFamily: fonts[weight] || fonts.regular, fontSize: size, color, lineHeight: Math.round(size * 1.4) }, style]} {...rest}>
      {children}
    </Text>
  );
}
