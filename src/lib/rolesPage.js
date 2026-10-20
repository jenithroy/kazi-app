/**
 * What the Roles & Duties page works out from the two tables it reads (positions, and the staff directory): which positions are
 * jobs, who holds each, which arm of the business a role belongs to, how the rail groups them, and which one opens first.
 * Pure functions, so they can be tested without a browser. The words (duties, cadences, section names) are lib/roles.js.
 *
 * Access, as the page has always had it: `positions` is readable by everyone signed in, and the directory (`fs_employees`, which
 * returns the roster to everyone and masks only pay and contact details) normally is too. The directory is read on its own and
 * allowed to fail: then the roles and their duties still draw and the people are left out (`directoryVisible` is false).
 */
import { dutiesFor, roleKey } from "./roles";

/*
 * Left off the page by name, not by rank.
 *
 * Filtering on tier looked right and was wrong: 0019 promoted `director` to tier 4 so Finn and Zen could reach every page, which put
 * Directors on the same rung as the two roles that exist to keep the app running, so hiding tier 4 hid the owners of the company
 * along with them. These two ids are the actual thing being excluded, so exclude those.
 */
export const NOT_A_JOB = new Set(["system-admin", "developer"]);

export const isJob = (position) => !NOT_A_JOB.has(position.id) && !NOT_A_JOB.has(roleKey(position.label));

/** The roles people hold as a job, by name. */
export function jobRoles(positions) {
  return (positions || []).filter(isJob).sort((a, b) => (a.label || "").localeCompare(b.label || ""));
}

/** The directory's people who are still here and have a name. */
export const activeStaff = (people) => (people || []).filter((p) => p.status !== "Inactive" && p.name);

export const holdersOf = (active, id) => active.filter((p) => p.positionId === id);

/** "uk" when anyone holding the role is in the UK, "nepal" when someone holds it and none is, null when nobody does. */
export function locationOf(holders) {
  const where = holders.map((p) => String(p.location || "").toLowerCase());
  return where.includes("uk") ? "uk" : where.length ? "nepal" : null;
}

/**
 * The rail's groups. With the directory the roles split by where their people are (a role nobody holds counts as Nepal, where
 * the company works); without it there is nothing to split by, so there is one group.
 */
export function groupRoles(roles, active, directoryVisible) {
  if (!directoryVisible) return roles.length ? [{ key: "all", label: "All roles", roles }] : [];
  const uk = roles.filter((r) => locationOf(holdersOf(active, r.id)) === "uk");
  const nepal = roles.filter((r) => locationOf(holdersOf(active, r.id)) !== "uk");
  return [
    uk.length ? { key: "uk", label: "UK", roles: uk } : null,
    nepal.length ? { key: "nepal", label: "Nepal", roles: nepal } : null,
  ].filter(Boolean);
}

/** The role this person holds, if it is one of the jobs on the page. */
export function myRoleId(roles, active, personId) {
  if (!personId) return null;
  return roles.find((r) => holdersOf(active, r.id).some((p) => p.id === personId))?.id || null;
}

/**
 * The role that is open when nobody has chosen one: your own (it is what you opened the page to read), else the first with
 * something written up (an empty card is a poor first look), else the first.
 */
export function firstRoleId(groups, roles, mine) {
  if (mine && roles.some((r) => r.id === mine)) return mine;
  const ordered = groups.flatMap((g) => g.roles);
  const written = ordered.find((r) => (dutiesFor(r) || []).length > 0);
  return (written || ordered[0])?.id || null;
}

/** "Anmol, Sushant" or "Anmol, Sushant +1": the first names, for a rail row. */
export function peopleLine(holders, show = 2) {
  const names = holders.map((p) => String(p.name || "").trim().split(/\s+/)[0]).filter(Boolean);
  if (!names.length) return "";
  const head = names.slice(0, show).join(", ");
  return names.length > show ? `${head} +${names.length - show}` : head;
}

export const countLabel = (n) => (n === 1 ? "1 person" : `${n} people`);

/** Two letters for a role's chip: "Operations Manager" is OM, "Accountant" is AC. */
export function chipLetters(label) {
  const words = String(label || "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return String(words[0] || "?").slice(0, 2).toUpperCase();
}

/**
 * What a role's card says in place of a duty list: nothing written up yet (`undefined`), or a role that logs nothing by design
 * (an empty list: the directors read what Kathmandu records, the operations head's job is oversight).
 */
export function dutyNote(duties) {
  if (duties === undefined) return "Duties for this role haven't been written up yet.";
  if (duties.length === 0) return "Nothing to log: this role reads what the rest of the team records.";
  return "";
}
