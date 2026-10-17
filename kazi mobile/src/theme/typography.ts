import type { TextStyle } from 'react-native';

// Family names match the export keys from @expo-google-fonts/schibsted-grotesk
// and @expo-google-fonts/ibm-plex-mono, loaded via useFonts in the root layout.
export const fontFamily = {
  regular: 'SchibstedGrotesk_400Regular',
  medium: 'SchibstedGrotesk_500Medium',
  semibold: 'SchibstedGrotesk_600SemiBold',
  bold: 'SchibstedGrotesk_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

type TextRole = Pick<
  TextStyle,
  'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'
>;

// Direct port of the style guide's type scale (section 02 — Typography).
export const textStyles = {
  display: {
    fontFamily: fontFamily.semibold,
    fontSize: 32,
    lineHeight: 32 * 1.1,
    letterSpacing: -0.025 * 32,
  },
  screenTitle: {
    // The 40px title used at the top of each design screen (Sign in, Dashboard, ...)
    fontFamily: fontFamily.semibold,
    fontSize: 40,
    lineHeight: 40 * 1.02,
    letterSpacing: -0.03 * 40,
  },
  heading: {
    fontFamily: fontFamily.semibold,
    fontSize: 22,
    lineHeight: 22 * 1.2,
    letterSpacing: -0.015 * 22,
  },
  body: {
    fontFamily: fontFamily.medium,
    fontSize: 17,
    lineHeight: 17 * 1.35,
    letterSpacing: 0,
  },
  secondary: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 14 * 1.45,
    letterSpacing: 0,
  },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    lineHeight: 11 * 1.3,
    letterSpacing: 0.14 * 11,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TextRole & { textTransform?: TextStyle['textTransform'] }>;

// Applied to any numeric value (currency, quantities, dates) so columns align
// and figures don't jitter horizontally while polling — style guide rule.
export const tabularNums: TextStyle = {
  fontVariant: ['tabular-nums'],
};

export type TextStyleKey = keyof typeof textStyles;
