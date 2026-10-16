/**
 * Which dashboard a person gets.
 *
 * The same six as the mobile app, chosen the same way: by the person's position
 * (positions.id in Postgres), and by the coarse role when the position has no
 * dashboard of its own. A dashboard is a view, not a permission: every tile still
 * checks what its page needs, and the database refuses what the position may
 * not read.
 *
 * Only `owner` and `ops` show how many of the team are in, late or away;
 * everyone else gets their own clock-in instead.
 */
export const DASH_BY_POSITION = {
  director: "owner",
  developer: "owner",
  "system-admin": "owner",

  "operations-head": "ops",
  "operations-intern": "ops", // labelled "Operations Manager" live

  accountant: "accountant",
  "fashion-designer": "designer",
  "marketing-coordinator": "marketing",
  "content-coordinator": "marketing",
};

export function dashFor(profile) {
  const byPosition = DASH_BY_POSITION[profile?.positionId];
  if (byPosition) return byPosition;
  const role = profile?.appRole || profile?.role;
  if (role === "uk_admin" || role === "super_admin") return "owner";
  if (role === "nepal_admin") return "ops";
  return "staff";
}
