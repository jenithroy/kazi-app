import type { ViewStyle } from 'react-native';

// RN's New-Architecture `boxShadow` (CSS box-shadow syntax, RN 0.76+) lets us
// port the style guide's two-layer warm ink-tinted shadows literally instead
// of approximating them with shadowColor/shadowOpacity/elevation.
// Dark theme intentionally omits shadow tiers below "sheet" — per the style
// guide, dark surfaces lift via lightness + hairline borders, never shadow.

export type ShadowScale = Record<'none' | 'card' | 'raised' | 'sheet' | 'floating', ViewStyle['boxShadow']>;

export const lightShadows: ShadowScale = {
  none: undefined,
  card: '0 1px 2px rgba(15,36,29,0.04), 0 8px 22px -18px rgba(15,36,29,0.45)',
  raised: '0 1px 2px rgba(15,36,29,0.04), 0 8px 24px -18px rgba(15,36,29,0.35)',
  sheet: '0 2px 4px rgba(15,36,29,0.06), 0 20px 40px -22px rgba(15,36,29,0.55)',
  floating: '0 18px 34px -20px rgba(13,31,25,0.9)', // toasts, popovers over content
};

export const darkShadows: ShadowScale = {
  none: undefined,
  card: undefined,
  raised: undefined,
  sheet: '0 20px 40px -22px rgba(0,0,0,0.6)',
  floating: '0 18px 34px -20px rgba(0,0,0,0.7)',
};

export type ShadowKey = keyof ShadowScale;
