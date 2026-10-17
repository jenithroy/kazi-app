export const adminPanelKeys = {
  all: ['admin-panel'] as const,
  /** Roles, sections, finance tabs, both permission tables and the roll — read together. */
  matrix: () => [...adminPanelKeys.all, 'matrix'] as const,
};
