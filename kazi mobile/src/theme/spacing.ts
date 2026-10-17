// 8pt grid, per the style guide's "8pt grid" tag on the base 390x844 canvas.
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export type SpacingKey = keyof typeof spacing;
