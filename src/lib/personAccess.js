/**
 * Who may see what of a colleague. Small on purpose: the profile card in the top bar (components/ProfileModal.jsx) is in the app's
 * first download and needs only this, not the attendance sums in lib/personProfile.js.
 *
 * Nothing here decides access. The database already did, and these only mirror it so the card does not ask for (or draw a gap where)
 * something it will not get:
 *
 *   attendance   a person's own rows, or anyone's for staff at tier 2 or above whose position has Attendance
 *                (policies `attendance_self`, `attendance_grant`, and the same two on clock_ins)
 *   pay          a person's own payroll rows (`payroll_self`), or anyone's for a position that has the Payroll
 *                tab (`payroll_grant`)
 *   contact      phone, address, join date and basic pay are masked in the directory view (migration 0029) for
 *                everyone but the person themselves and staff at tier 2 or above with Employees
 *   points       the weekly and all-time boards are open to everybody who is signed in (`points_leaderboard`)
 *   the rest     name, photo, position, department, hours and who they report to are in the directory for all
 *
 * A null from the database means "hidden" as often as "empty", which is why the card asks these first.
 */
import { financeTabAllowed, sectionVisible, tier } from "../utils/permissions";

export const sameId = (a, b) => a != null && b != null && String(a) === String(b);
export const isSelf = (viewer, personId) => sameId(viewer?.personId, personId);

/** What `viewer` may see of `personId`: { self, attendance, pay, contact }. */
export function seesOf(viewer, personId) {
  const self = isSelf(viewer, personId);
  return {
    self,
    attendance: self || (tier(viewer) >= 2 && sectionVisible(viewer, "attendance")),
    pay: self || financeTabAllowed(viewer, "payroll"),
    contact: self || (tier(viewer) >= 2 && sectionVisible(viewer, "employees")),
  };
}
