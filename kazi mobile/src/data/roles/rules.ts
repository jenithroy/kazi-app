/**
 * What the Roles & Duties screen works out from the two tables it reads (positions, and the staff directory): which positions are
 * jobs, who holds each, which arm of the business a role belongs to, how the picker groups them, and which role opens first.
 * Pure functions, ported from the website's `src/lib/rolesPage.js`. The words (duties, cadences) are in `content.ts`.
 *
 * Access, as the screen has always had it: `positions` is readable by everyone signed in, and the directory normally is too. The
 * directory is read on its own and allowed to fail: then the roles and their duties still draw and the people are left out
 * (`directoryVisible` is false).
 */
import { dutiesFor, roleKey } from './content';
import type { Duty, Position, RoleGroup, StaffPerson } from './types';

/**
 * Left off the screen by name, not by rank. Filtering on tier looked right and was wrong: a promotion of `director` to tier 4 put
 * Directors on the same rung as the two roles that exist to keep the app running, so hiding tier 4 hid the owners of the company
 * along with them. These two ids are the actual thing being excluded, so exclude those.
 */
export const NOT_A_JOB = new Set(['system-admin', 'developer']);

export const isJob = (position: Position): boolean => !NOT_A_JOB.has(position.id) && !NOT_A_JOB.has(roleKey(position.label));

/** The roles people hold as a job, by name. */
export function jobRoles(positions: Position[] | null | undefined): Position[] {
  return (positions ?? []).filter(isJob).sort((a, b) => (a.label || '').localeCompare(b.label || ''));
}

/** The directory's people who are still here and have a name. */
export const activeStaff = (people: StaffPerson[] | null | undefined): StaffPerson[] =>
  (people ?? []).filter((p) => p.status !== 'Inactive' && p.name);

export const holdersOf = (active: StaffPerson[], id: string): StaffPerson[] => active.filter((p) => p.positionId === id);

/** "uk" when anyone holding the role is in the UK, "nepal" when someone holds it and none is, null when nobody does. */
export function locationOf(holders: StaffPerson[]): 'uk' | 'nepal' | null {
  const where = holders.map((p) => String(p.location || '').toLowerCase());
  return where.includes('uk') ? 'uk' : where.length ? 'nepal' : null;
}

/**
 * The picker's groups. With the directory the roles split by where their people are (a role nobody holds counts as Nepal, where
 * the company works); without it there is nothing to split by, so there is one group.
 */
export function groupRoles(roles: Position[], active: StaffPerson[], directoryVisible: boolean): RoleGroup[] {
  if (!directoryVisible) return roles.length ? [{ key: 'all', label: 'All roles', roles }] : [];
  const uk = roles.filter((r) => locationOf(holdersOf(active, r.id)) === 'uk');
  const nepal = roles.filter((r) => locationOf(holdersOf(active, r.id)) !== 'uk');
  const out: RoleGroup[] = [];
  if (uk.length) out.push({ key: 'uk', label: 'UK', roles: uk });
  if (nepal.length) out.push({ key: 'nepal', label: 'Nepal', roles: nepal });
  return out;
}

/** The role this person holds, if it is one of the jobs on the screen. */
export function myRoleId(roles: Position[], active: StaffPerson[], personId: string | null | undefined): string | null {
  if (!personId) return null;
  return roles.find((r) => holdersOf(active, r.id).some((p) => p.id === personId))?.id ?? null;
}

/**
 * The role that is open when nobody has chosen one: your own (it is what you opened the screen to read), else the first with
 * something written up (an empty card is a poor first look), else the first.
 */
export function firstRoleId(groups: RoleGroup[], roles: Position[], mine: string | null): string | null {
  if (mine && roles.some((r) => r.id === mine)) return mine;
  const ordered = groups.flatMap((g) => g.roles);
  const written = ordered.find((r) => (dutiesFor(r) ?? []).length > 0);
  return (written ?? ordered[0])?.id ?? null;
}

export const countLabel = (n: number): string => (n === 1 ? '1 person' : `${n} people`);

/** Two letters for a role's chip: "Operations Manager" is OM, "Accountant" is AC. */
export function chipLetters(label: string): string {
  const words = String(label || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return String(words[0] ?? '?')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * What a role's card says in place of a duty list: nothing written up yet (`undefined`), or a role that logs nothing by design
 * (an empty list: the directors read what Kathmandu records, the operations head's job is oversight).
 */
export function dutyNote(duties: Duty[] | undefined): string {
  if (duties === undefined) return "Duties for this role haven't been written up yet.";
  if (duties.length === 0) return 'Nothing to log: this role reads what the rest of the team records.';
  return '';
}
