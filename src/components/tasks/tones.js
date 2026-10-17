/**
 * The colour a section can carry: a small dot beside its name, nothing more (a whole
 * section is never tinted; tone is saved for a tile that needs attention).
 */
export const SECTION_TONES = ["neutral", "mint", "amber", "terra", "blue", "ghost"];

export const TONE_DOT = {
  neutral: "var(--ink-4)",
  mint: "var(--mint-2)",
  amber: "var(--amber)",
  terra: "var(--terra)",
  blue: "var(--blue)",
  ghost: "var(--ink-5)",
};

/** The sections a brand-new board starts with (when there are none at all). */
export const DEFAULT_SECTIONS = [
  { label: "To Do", tone: "neutral", order: 0 },
  { label: "In Progress", tone: "mint", order: 1 },
  { label: "Blocked", tone: "terra", order: 2 },
];
