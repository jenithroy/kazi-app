/**
 * What the Filters panel offers on the Attendance roll call (components/filters: the button, the panel and the engine).
 *
 * The roll call is one day's list of people (`buildRoster`, lib/attendance.js), so every filter reads a field a person's row for that day
 * already holds, or what the page has read about them (where they work, their department).
 *
 *   Status           how the day went: the same six lines as the key in the day tile (Present, Late, Half-day, On leave, Absent, No record).
 *                    The key and this choice are one: pressing a line of the key chooses it here, and the other way round.
 *   Position         what they do
 *   Where they work  Nepal or UK (only when the team has people on both sides)
 *   Department       only when somebody has one
 *   switches         not clocked in (yet), still at work, forgot to clock out, has a salary cut, has a note
 */
import { STATE_LABEL, humanNote } from "../../lib/attendance";
import { REGIONS } from "../../utils/region";

/** The states the key lists, in its order. */
export const STATES = ["present", "late", "half", "leave", "absent", "none"];
const TONE = { late: "warn", absent: "bad" };

/**
 * `info` maps a person's id to { location ("nepal" | "uk" | ""), department } (what the page read about them besides the day).
 */
export function rosterFilters({ roster, info, date, today }) {
  const where = (r) => info.get(r.personId)?.location || "";
  const dept = (r) => info.get(r.personId)?.department || "";
  const sides = new Set(roster.map(where));
  const isToday = date === today;
  return [
    {
      id: "state", label: "Status", kind: "chips",
      options: [{ value: "", label: "Everyone" }, ...STATES.map((s) => ({ value: s, label: STATE_LABEL[s], tone: TONE[s] }))],
      test: (r, v) => r.state === v,
    },
    { id: "position", label: "Position", kind: "select", of: (r) => r.role, any: "Any position", none: "No position" },
    sides.size > 1 ? {
      id: "where", label: "Where they work", kind: "select", of: where, any: "Anywhere", none: "No location set",
      nameOf: (id) => REGIONS.find((x) => x.id === id)?.label || id,
    } : null,
    roster.some(dept) ? { id: "dept", label: "Department", kind: "select", of: dept, any: "Any department", none: "No department" } : null,
    {
      id: "noclock", label: "Not clocked in", kind: "toggle", text: isToday ? "Not clocked in yet" : "Did not clock in",
      pill: isToday ? "Not clocked in yet" : "Did not clock in", test: (r) => !r.inAt,
    },
    isToday ? { id: "atwork", label: "Still at work", kind: "toggle", text: "Still at work", pill: "Still at work", test: (r) => r.sofar != null } : null,
    { id: "noout", label: "Forgot to clock out", kind: "toggle", text: "Forgot to clock out", pill: "Forgot to clock out", test: (r) => r.missedClockOut },
    { id: "cut", label: "Salary cut", kind: "toggle", text: "25% salary cut", pill: "Salary cut", test: (r) => r.lateCut },
    { id: "note", label: "Has a note", kind: "toggle", text: "Has a note", pill: "Has a note", test: (r) => Boolean(humanNote(r.record)) },
  ].filter(Boolean);
}

/** The words the search looks in: a person's name and what they do. Every word typed has to be found. */
export function matchesPerson(row, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const hay = `${row.name} ${row.role}`.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
