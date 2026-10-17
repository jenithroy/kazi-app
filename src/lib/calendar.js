/**
 * Calendar days, as the plain strings the database and the forms already use ("2026-10-18").
 *
 * Everything here is done on year / month / day numbers through UTC, never through the
 * browser's local time, so a date cannot slip a day in a time zone with a half-hour offset
 * (the office is in Nepal, UTC+5:45) or across a daylight-saving change. Months are 1 to 12 and
 * weeks start on Sunday, which is the first working day in Nepal (Saturday is the day off).
 */

export const pad = (n) => String(n).padStart(2, "0");
export const toISO = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** { y, m, d } for a real "YYYY-MM-DD", else null (so "2026-02-31" is not a date). */
export function parseISO(s) {
  const hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!hit) return null;
  const y = Number(hit[1]);
  const m = Number(hit[2]);
  const d = Number(hit[3]);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return { y, m, d };
}

const fromUTC = (t) => toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());

export function addDays(s, n) {
  const p = parseISO(s);
  return fromUTC(new Date(Date.UTC(p.y, p.m - 1, p.d + n)));
}

/** The same day n months on, or the last day of that month if it has no such day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s, n) {
  const p = parseISO(s);
  const first = new Date(Date.UTC(p.y, p.m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return toISO(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(p.d, last));
}

/** The same day of the month in another year and month, or its last day if that month is shorter. */
export function withMonth(s, y, m) {
  const p = parseISO(s);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return toISO(y, m, Math.min(p.d, last));
}

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (s) => {
  const p = parseISO(s);
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
};

/** Six rows of seven days for a month, starting on the Sunday on or before the 1st. */
export function monthGrid(y, m) {
  const start = addDays(toISO(y, m, 1), -weekday(toISO(y, m, 1)));
  return Array.from({ length: 42 }, (_, i) => {
    const iso = addDays(start, i);
    const p = parseISO(iso);
    return { iso, day: p.d, inMonth: p.m === m };
  });
}

const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const WORDS = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
const MONTH_SHORT = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

const at = (s) => { const p = parseISO(s); return new Date(Date.UTC(p.y, p.m - 1, p.d)); };

/** "18 Oct 2026": what the date field shows. */
export const fmtField = (s) => (parseISO(s) ? SHORT.format(at(s)) : "");
/** "Sunday 18 October 2026": what a screen reader hears for a day. */
export const fmtWords = (s) => (parseISO(s) ? WORDS.format(at(s)) : "");
export const monthName = (m) => MONTH.format(new Date(Date.UTC(2026, m - 1, 1)));
export const monthShort = (m) => MONTH_SHORT.format(new Date(Date.UTC(2026, m - 1, 1)));

export const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
