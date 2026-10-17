import {
  RECORDS_TIER,
  SUPER_ADMIN_TIER,
  type AccessCounts,
  type AccessLevel,
  type SectionRow,
} from './types';

/** `{can_view, can_edit}` → the three-way value the screen shows. */
export function levelOf(perm: { can_view?: boolean; can_edit?: boolean } | undefined): AccessLevel {
  if (!perm?.can_view) return 'none';
  return perm.can_edit ? 'edit' : 'view';
}

/** The three-way value → the two booleans the database stores. */
export function flagsFor(level: AccessLevel): { can_view: boolean; can_edit: boolean } {
  return { can_view: level !== 'none', can_edit: level === 'edit' };
}

export const isSuperTier = (tier: number): boolean => tier >= SUPER_ADMIN_TIER;

/** Tier collapses to one of the two buckets the scope picker offers. */
export const scopeBucket = (tier: number): number => (tier >= RECORDS_TIER ? RECORDS_TIER : 0);

/**
 * On create the id is derived from the name rather than typed — one less thing
 * to get wrong, and it stays stable if the name is reworded later.
 */
export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** How a role's pages break down. Super admin is every page, whatever the rows say. */
export function countLevels(
  sections: SectionRow[],
  read: (sectionId: string) => AccessLevel,
  superAdmin: boolean,
): AccessCounts {
  if (superAdmin) return { edit: sections.length, view: 0, none: 0 };
  let edit = 0;
  let view = 0;
  for (const s of sections) {
    const l = read(s.id);
    if (l === 'edit') edit += 1;
    else if (l === 'view') view += 1;
  }
  return { edit, view, none: sections.length - edit - view };
}

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };

/** Does this change take something away? */
export const isDowngrade = (from: AccessLevel, to: AccessLevel): boolean => RANK[to] < RANK[from];

export const LEVEL_LABEL: Record<AccessLevel, string> = { none: 'hidden', view: 'view', edit: 'edit' };
