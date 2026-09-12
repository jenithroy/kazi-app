/**
 * Day helpers for the calendar components.
 *
 * Days here are local days. Building a day string with toISOString() turns
 * local midnight into the previous evening in UTC, which is why orders can
 * show a day early in Kathmandu and in British summer time (REDESIGN.md §11).
 */

/** "YYYY-MM-DD" for the local day a Date falls on. */
export function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A Date at local midnight from a "YYYY-MM-DD" string. */
export function fromISODate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const isSameDay = (a, b) => toISODate(a) === toISODate(b);

const MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SUN_FIRST = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday headings, from Monday or from Sunday. */
export const weekdayLabels = (weekStart = "mon") => (weekStart === "sun" ? SUN_FIRST : MON_FIRST);

/**
 * The cells of a month grid, in order.
 *
 *   weekStart  "mon" (Attendance, Production, the dashboard) or "sun" (Marketing)
 *   fill       "blank" leaves the days before and after the month empty (null cells);
 *              "adjacent" fills them with the neighbouring months' days
 *   weeks      force a number of rows (6 keeps the grid from changing height
 *              month to month)
 *
 * Each cell is null, or { iso, date, day, inMonth }.
 */
export function monthCells(monthDate, { weekStart = "mon", fill = "blank", weeks } = {}) {
  const base = monthDate instanceof Date ? monthDate : new Date(monthDate);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDow = new Date(year, month, 1).getDay(); // 0 = Sunday
  const lead = weekStart === "sun" ? firstDow : (firstDow + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows = weeks || Math.ceil((lead + daysInMonth) / 7);
  const total = rows * 7;

  const cell = (date, inMonth) => ({ iso: toISODate(date), date, day: date.getDate(), inMonth });
  const cells = [];
  for (let i = 0; i < total; i++) {
    const dayOfMonth = i - lead + 1;
    if (dayOfMonth < 1 || dayOfMonth > daysInMonth) {
      cells.push(fill === "adjacent" ? cell(new Date(year, month, dayOfMonth), false) : null);
    } else {
      cells.push(cell(new Date(year, month, dayOfMonth), true));
    }
  }
  return cells;
}

/** "Today", "Tomorrow", "Yesterday", else "Sat 12 Sep". */
export function dayHeading(iso, today = new Date()) {
  const date = fromISODate(iso);
  const diff = Math.round((date - fromISODate(toISODate(today))) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
