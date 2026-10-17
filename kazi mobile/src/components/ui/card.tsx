import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { radii } from '@/theme';

export type CardElevation = 'flat' | 'raised' | 'sheet' | 'hero';

export interface CardProps {
  elevation?: CardElevation;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** "Cards over lists": group related numbers into a card with internal dividers, per the style guide. */
export function Card({ elevation = 'raised', children, style }: CardProps) {
  const theme = useTheme();

  const borderRadius = elevation === 'flat' ? radii.md : elevation === 'sheet' ? radii.xl : radii.lg;
  const isHero = elevation === 'hero';

  return (
    <View
      style={[
        {
          borderRadius,
          // Only the background separates a hero card from a raised one: in
          // light mode they are the same white card, and in dark mode the hero
          // sits a step above `surface`. `darkShadows.raised` is undefined, so
          // dark keeps lifting via its hairline border alone.
          backgroundColor: isHero ? theme.surfaceHero : theme.surface,
          borderWidth: elevation === 'flat' || theme.scheme === 'dark' ? 1 : 0,
          borderColor: theme.border,
          boxShadow:
            elevation === 'sheet'
              ? theme.shadows.sheet
              : elevation === 'raised' || isHero
                ? theme.shadows.raised
                : undefined,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
