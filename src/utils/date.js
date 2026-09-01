/**
 * Returns today's date as YYYY-MM-DD in the browser's local timezone.
 * (Previously used toISOString() which returns UTC — wrong for Nepal UTC+5:45)
 */
export function todayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns the Monday of the current week as YYYY-MM-DD in local timezone.
 * Does NOT mutate any Date object.
 */
export function startOfWeekDate() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;           // Monday = 1, Sunday wraps back
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateLabel(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

/**
 * True if the given YYYY-MM-DD string (or Date) falls on a Saturday —
 * the office's weekly holiday in Nepal (Sunday is a normal work day).
 */
export function isSaturday(dateStrOrObj) {
  if (dateStrOrObj instanceof Date) return dateStrOrObj.getDay() === 6;
  const [y, m, d] = dateStrOrObj.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 6;
}

/**
 * Milliseconds since the epoch from whatever shape a timestamp arrives in.
 *
 * Postgres returns timestamptz as an ISO string. Firestore returned a Timestamp
 * object with .seconds / .toMillis(). Records written before the move and read
 * back through a jsonb column can still be the old shape, and Date and raw
 * numbers turn up too, so accept all of them.
 *
 * Returns 0 for anything unparseable, which sorts such rows last — the same
 * thing `(x?.seconds || 0)` did before.
 */
export function tsMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** The same value as a Date, or null when there is nothing usable to show. */
export function tsDate(ts) {
  const ms = tsMillis(ts);
  return ms ? new Date(ms) : null;
}

/** "14:32", or a dash when the timestamp is missing. Used for clock in/out. */
export function tsTime(ts, fallback = "—") {
  const d = tsDate(ts);
  return d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : fallback;
}
