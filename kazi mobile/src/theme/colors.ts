// Raw palette values ported 1:1 from the Kazi Design style guide.
// Components should never import this directly — consume semantic roles
// from `theme/index.ts` instead.

export const lightColors = {
  ink900: '#0D1F19',
  ink800: '#0F241D',
  ink600: '#3B4F47',
  ink500: '#5B6C64',
  line: '#E6E1D5',
  paper: '#F7F4EC',
  page: '#EFEBE1',
  white: '#FFFFFF',

  mint: '#5FD2A0',
  mintHover: '#4FC492',
  mintDeep: '#147A57',
  mintWash: '#E2F6EC',
  mintWashText: '#0E5E43',

  clay: '#C0603C',
  clayHover: '#A9502F',
  clayWash: '#F8E7DF',
  clayWashText: '#8E4327',
  clayText: '#FFF6F1',

  amber: '#B98514',
  amberWash: '#F7EEDA',
  amberWashText: '#7A5709',

  draftWash: '#EDEFEC',
  draftWashText: '#4A5A53',
  draftDot: '#8A9A92',

  onTrackDot: '#22A97A',

  // Foreground used on an ink900 surface *within an otherwise light screen*
  // — e.g. avatar initials on a selected chip or the toast pill.
  onInvertedMutedText: '#9DB2A7',
  onInvertedAvatarText: '#BFE9D5',

  // The one "highlight" (hero) card per screen. In light mode it is simply an
  // ordinary white card — the design originally inverted it to ink900, but a
  // near-black block in an otherwise light page just read as dark mode leaking
  // in. Its foreground palette is therefore the ordinary one (wired up in
  // `index.ts`); only dark mode still lifts the hero above `surface`.
  /** An inactive column in a chart drawn on the hero card. */
  heroMutedBar: '#D5E0DA',
} as const;

export const darkColors = {
  base: '#0A1512',
  surface: '#10201A',
  surfaceLine: '#1D3129',
  raised: '#16281F',
  line: '#23372E',
  text: '#E9F1EC',
  textMuted: '#7E958A',

  mint: '#6FDDA9',
  mintText: '#08251A',
  mintWashRgba: 'rgba(111,221,169,0.16)',
  mintWashTextOnDark: '#6FDDA9',

  // Selected chip / segment / tab. Dark mode has no ink block to invert to —
  // `raised` is already the sheet's own colour — so a selection reads as an
  // accent-tinted fill behind a solid mint outline instead. Kept translucent
  // so it lifts off `surface` and `surfaceRaised` alike.
  mintSelectedWash: 'rgba(111,221,169,0.22)',
  mintSelectedText: '#C6F5DF',
  mintSelectedTextMuted: '#8FC7AF',

  clay: '#E08A63',
  clayWashRgba: 'rgba(224,138,99,0.18)',
  clayWashTextOnDark: '#E8A183',

  amberWashRgba: 'rgba(185,133,20,0.18)',
  amberWashTextOnDark: '#DBB55C',

  // Hero-card extras. Dark mode's hero *is* `raised`, so these keep the exact
  // values the hand-written rgba literals used before they were tokenised —
  // the dark theme is unchanged by the light-mode hero rework.
  heroDivider: 'rgba(233,241,236,0.14)',
  heroTrack: 'rgba(233,241,236,0.16)',
  heroMutedBar: 'rgba(191,233,213,0.42)',
  heroWarning: '#DBB55C',
  heroDanger: '#D98466',
} as const;
