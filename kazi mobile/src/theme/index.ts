import type { ColorSchemeName } from 'react-native';

import { darkColors, lightColors } from './colors';
import { darkShadows, lightShadows, type ShadowScale } from './shadows';
import { radii } from './radii';
import { spacing } from './spacing';
import { fontFamily, tabularNums, textStyles } from './typography';

export { fontFamily, radii, spacing, tabularNums, textStyles };
export type { ShadowKey } from './shadows';
export type { TextStyleKey } from './typography';

/**
 * Foreground palette for content sitting on a dark surface: the full dark
 * theme (everywhere), and light theme's single per-screen "inverted" card.
 * Kept as its own object because the design reuses the same on-dark
 * foreground colors in both contexts — only `textMuted` differs.
 */
export interface OnDarkPalette {
  text: string;
  textMuted: string;
  accent: string;
  accentWash: string;
  accentWashText: string;
  dangerWash: string;
  dangerWashText: string;
  warningWash: string;
  warningWashText: string;
  avatarBg: string;
  avatarText: string;
}

/**
 * Foreground palette for the one "highlight" (hero) card per screen —
 * `surfaceHero`. Distinct from `OnDarkPalette` because the hero card is only
 * dark in *dark* mode: in light mode it is a mint wash, so its foregrounds are
 * dark ink, not the on-dark set. Anything that stays genuinely dark in both
 * schemes (the toast pill, a selected chip, a primary button) keeps `onDark`.
 */
export interface HeroPalette {
  text: string;
  textMuted: string;
  accent: string;
  warning: string;
  danger: string;
  /** Filled control sitting on the hero card. */
  solid: string;
  solidText: string;
  accentWash: string;
  accentWashText: string;
  dangerWash: string;
  dangerWashText: string;
  warningWash: string;
  warningWashText: string;
  avatarBg: string;
  avatarText: string;
  /** Hairline rule, and the border of an outline button, drawn on the hero card. */
  divider: string;
  /** Unfilled remainder of a progress/threshold bar on the hero card. */
  track: string;
  /** A chart column that is *not* the highlighted one. */
  mutedBar: string;
}

export interface Theme {
  scheme: 'light' | 'dark';

  background: string;
  surface: string;
  surfaceRaised: string;
  /** A surface that is dark in *both* schemes: the toast pill, a primary button, a selected picker cell. Light: ink900. Dark: same as surfaceRaised. */
  surfaceInverted: string;
  /** The one "highlight" card per screen. Light: a mint wash. Dark: the raised surface. Pair with `onHero`. */
  surfaceHero: string;
  surfaceHeroBorder: string;
  border: string;

  /**
   * The selected state of a chip, segment, tab or picker cell — never
   * `surfaceInverted`, which in dark mode *is* `surfaceRaised` and so paints a
   * selection that is invisible on a sheet. Light keeps the design's ink block;
   * dark uses an accent wash behind a solid accent outline.
   */
  selectedSurface: string;
  selectedBorder: string;
  selectedText: string;
  selectedTextMuted: string;
  /** A count badge riding *on* a selected surface — it cannot reuse the accent wash, which in dark mode is the selection's own fill. */
  selectedBadge: string;
  selectedBadgeText: string;

  /**
   * The raised pill of a segmented control sitting on a `draftWash` track —
   * a different language from `selected*`, which fills. Light lifts the pill
   * with `shadows.card`; dark has no card shadow at all, so it lifts with an
   * accent wash behind a hairline, per the style guide.
   */
  segmentSurface: string;
  segmentBorder: string;
  segmentText: string;

  textPrimary: string;
  textSecondary: string;
  link: string;

  accent: string;
  accentHover: string;
  accentText: string;
  /** Ghost-button / link-style text in the accent color. */
  accentDeep: string;
  accentWash: string;
  accentWashText: string;

  danger: string;
  dangerHover: string;
  dangerText: string;
  dangerWash: string;
  dangerWashText: string;

  warning: string;
  /**
   * Foreground for text sitting ON a filled `warning` surface — a badge, a pill.
   * `warning` is a bright amber in both schemes, so this is dark ink, not
   * `onDark.text`: near-white on amber is ~1.7:1 in dark mode. On a plain
   * surface it is `warningWashText` that belongs, not this.
   */
  warningText: string;
  warningWash: string;
  warningWashText: string;

  draftWash: string;
  draftWashText: string;
  draftDot: string;

  onDark: OnDarkPalette;
  onHero: HeroPalette;
  shadows: ShadowScale;
}

export const lightTheme: Theme = {
  scheme: 'light',

  background: lightColors.page,
  surface: lightColors.white,
  surfaceRaised: lightColors.paper,
  surfaceInverted: lightColors.ink900,
  surfaceHero: lightColors.white,
  surfaceHeroBorder: lightColors.line,
  border: lightColors.line,

  selectedSurface: lightColors.ink900,
  selectedBorder: lightColors.ink900,
  selectedText: darkColors.text,
  selectedTextMuted: lightColors.onInvertedMutedText,
  selectedBadge: darkColors.mintWashRgba,
  selectedBadgeText: darkColors.text,

  segmentSurface: lightColors.white,
  segmentBorder: 'transparent',
  segmentText: lightColors.ink800,

  textPrimary: lightColors.ink800,
  textSecondary: lightColors.ink500,
  link: lightColors.mintDeep,

  accent: lightColors.mint,
  accentHover: lightColors.mintHover,
  accentText: '#08251A',
  accentDeep: lightColors.mintDeep,
  accentWash: lightColors.mintWash,
  accentWashText: lightColors.mintWashText,

  danger: lightColors.clay,
  dangerHover: lightColors.clayHover,
  dangerText: lightColors.clayText,
  dangerWash: lightColors.clayWash,
  dangerWashText: lightColors.clayWashText,

  warning: lightColors.amber,
  warningText: lightColors.ink900,
  warningWash: lightColors.amberWash,
  warningWashText: lightColors.amberWashText,

  draftWash: lightColors.draftWash,
  draftWashText: lightColors.draftWashText,
  draftDot: lightColors.draftDot,

  onDark: {
    text: darkColors.text,
    textMuted: lightColors.onInvertedMutedText,
    accent: darkColors.mint,
    accentWash: darkColors.mintWashRgba,
    accentWashText: darkColors.mintWashTextOnDark,
    dangerWash: darkColors.clayWashRgba,
    dangerWashText: darkColors.clayWashTextOnDark,
    warningWash: darkColors.amberWashRgba,
    warningWashText: darkColors.amberWashTextOnDark,
    avatarBg: darkColors.raised,
    avatarText: lightColors.onInvertedAvatarText,
  },
  // Light mode's hero card is an ordinary white card, so its palette is the
  // ordinary palette — the roles stay named because dark mode still lifts the
  // hero above `surface` and needs its own values.
  onHero: {
    text: lightColors.ink800,
    textMuted: lightColors.ink500,
    accent: lightColors.mintDeep,
    warning: lightColors.amber,
    danger: lightColors.clay,
    solid: lightColors.mint,
    solidText: '#08251A',
    accentWash: lightColors.mintWash,
    accentWashText: lightColors.mintWashText,
    dangerWash: lightColors.clayWash,
    dangerWashText: lightColors.clayWashText,
    warningWash: lightColors.amberWash,
    warningWashText: lightColors.amberWashText,
    avatarBg: lightColors.mintWash,
    avatarText: lightColors.mintWashText,
    divider: lightColors.line,
    track: lightColors.draftWash,
    mutedBar: lightColors.heroMutedBar,
  },
  shadows: lightShadows,
};

export const darkTheme: Theme = {
  scheme: 'dark',

  background: darkColors.base,
  surface: darkColors.surface,
  surfaceRaised: darkColors.raised,
  surfaceInverted: darkColors.raised,
  surfaceHero: darkColors.raised,
  surfaceHeroBorder: darkColors.line,
  border: darkColors.line,

  selectedSurface: darkColors.mintSelectedWash,
  selectedBorder: darkColors.mint,
  selectedText: darkColors.mintSelectedText,
  selectedTextMuted: darkColors.mintSelectedTextMuted,
  selectedBadge: darkColors.mint,
  selectedBadgeText: darkColors.mintText,

  segmentSurface: darkColors.mintSelectedWash,
  segmentBorder: darkColors.mint,
  segmentText: darkColors.mintSelectedText,

  textPrimary: darkColors.text,
  textSecondary: darkColors.textMuted,
  link: darkColors.mint,

  accent: darkColors.mint,
  accentHover: darkColors.mint,
  accentText: darkColors.mintText,
  accentDeep: darkColors.mint,
  accentWash: darkColors.mintWashRgba,
  accentWashText: darkColors.mintWashTextOnDark,

  danger: darkColors.clay,
  dangerHover: darkColors.clay,
  dangerText: darkColors.mintText,
  dangerWash: darkColors.clayWashRgba,
  dangerWashText: darkColors.clayWashTextOnDark,

  warning: darkColors.amberWashTextOnDark,
  warningText: darkColors.mintText,
  warningWash: darkColors.amberWashRgba,
  warningWashText: darkColors.amberWashTextOnDark,

  draftWash: darkColors.raised,
  draftWashText: darkColors.textMuted,
  draftDot: darkColors.textMuted,

  onDark: {
    text: darkColors.text,
    textMuted: darkColors.textMuted,
    accent: darkColors.mint,
    accentWash: darkColors.mintWashRgba,
    accentWashText: darkColors.mintWashTextOnDark,
    dangerWash: darkColors.clayWashRgba,
    dangerWashText: darkColors.clayWashTextOnDark,
    warningWash: darkColors.amberWashRgba,
    warningWashText: darkColors.amberWashTextOnDark,
    avatarBg: darkColors.raised,
    avatarText: darkColors.mint,
  },
  onHero: {
    text: darkColors.text,
    textMuted: darkColors.textMuted,
    accent: darkColors.mint,
    warning: darkColors.heroWarning,
    danger: darkColors.heroDanger,
    solid: darkColors.mint,
    solidText: darkColors.mintText,
    accentWash: darkColors.mintWashRgba,
    accentWashText: darkColors.mintWashTextOnDark,
    dangerWash: darkColors.clayWashRgba,
    dangerWashText: darkColors.clayWashTextOnDark,
    warningWash: darkColors.amberWashRgba,
    warningWashText: darkColors.amberWashTextOnDark,
    avatarBg: darkColors.raised,
    avatarText: darkColors.mint,
    divider: darkColors.heroDivider,
    track: darkColors.heroTrack,
    mutedBar: darkColors.heroMutedBar,
  },
  shadows: darkShadows,
};

export function themeFor(scheme: ColorSchemeName): Theme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}
