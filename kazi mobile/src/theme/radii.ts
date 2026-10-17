export const radii = {
  sm: 11, // small buttons, toggle chips
  md: 14, // fields, primary buttons, flat cards
  lg: 18, // standard raised cards
  xl: 22, // sheets, modals
  pill: 999,
} as const;

export type RadiiKey = keyof typeof radii;
