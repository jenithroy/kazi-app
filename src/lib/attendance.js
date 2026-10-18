/**
 * The Attendance page's plain logic: what a person's day looks like, what a month adds up
 * to, and what a manual change writes. Nothing here draws anything or talks to the database,
 * so it can be reasoned about (and tested) on its own.
 *
 * Words used throughout:
 *   record    a row in `attendance`: one person, one day, one status (Present, Late, ...)
 *   clock     a row in `clock_ins`: when that person pressed clock in and out
 *   state     the page's own reading of a day: present | late | half | leave | absent | none | closed
 *             ("none" is a day nobody has marked; "closed" is a Saturday, the office's day off)
 */
import { getEmployeeScheduleForDate, parseLocalDate } from "../constants";
import { tsDate } from "../utils/date";

/* ── Dates (local, as the rest of the app reads a "day") ───────── */

export const pad2 = (n) => String(n).padStart(2, "0");
export const isoOf = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;          // m is 0 to 11 here, as in Date
export const isoFromDate = (dt) => isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
export const isSat = (iso) => parseLocalDate(iso).getDay() === 6;

export function addDays(iso, n) {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return isoFromDate(d);
}

/** The month a date is in: { y, m (0 to 11), days, start, end } */
export function monthOf(iso) {
  const d = parseLocalDate(iso);
  const y = d.getFullYear();
  const m = d.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  return { y, m, days, start: isoOf(y, m, 1), end: isoOf(y, m, days) };
}

/** The month before or after this one. */
export function shiftMonth(month, by) {
  const d = new Date(month.y, month.m + by, 1);
  return monthOf(isoFromDate(d));
}

/** Where a date goes when the month changes: today in the current month, else the same day of the month (kept inside it). */
export function dateInMonth(month, wanted, today) {
  const t = monthOf(today);
  if (t.y === month.y && t.m === month.m) return today;
  const day = Math.min(Number(wanted.slice(8, 10)) || 1, month.days);
  return isoOf(month.y, month.m, day);
}

export const monthTitle = (month) => new Date(month.y, month.m, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
export const dayTitle = (iso) => parseLocalDate(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
export const dayShort = (iso) => parseLocalDate(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/* ── Times and durations ───────────────────────────────────────── */

export const fmtClock = (date) => (date ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}` : "");

/** Whole minutes between clocking in and out; null until both exist. */
export function workedMinutes(clock) {
  const a = tsDate(clock?.clockedInAt);
  const b = tsDate(clock?.clockedOutAt);
  if (!a || !b) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

/** "7h 30m" (or "45m") from minutes. */
export function fmtMinutes(min) {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${pad2(m)}m` : `${m}m`;
}

/** "7.5h": the short form a tight column wants. */
export const fmtHoursShort = (min) => (min == null ? "" : `${Math.round((min / 60) * 10) / 10}h`);

/* ── A person's day ────────────────────────────────────────────── */

export const STATUSES = ["Present", "Late", "Half-day", "Leave", "Absent"];

const STATE_OF = { Present: "present", Late: "late", "Half-day": "half", Leave: "leave", Absent: "absent" };
export const STATE_LABEL = {
  present: "Present", late: "Late", half: "Half-day", leave: "On leave", absent: "Absent", none: "No record", closed: "Closed",
};
/** The colour family each state wears (the `--kb-*` tokens of the page). */
export const STATE_TONE = { present: "good", late: "warn", half: "good", leave: "info", absent: "bad", none: "mute", closed: "mute" };

export const stateOf = (record, { closed = false } = {}) => (record ? STATE_OF[record.status] || "none" : closed ? "closed" : "none");

/**
 * What a manual change should leave in `hours` (the same figures the phone app writes): half a
 * day for Half-day, nothing for Absent and Leave, and for Present and Late the hours really
 * worked when the person has clocked out (`workedMin`, from the clock-in record), else a full
 * day. The old figure is never reused: a Half-day put back to Present must not stay at 4.
 */
export function hoursFor(status, workedMin) {
  if (status === "Half-day") return 4;
  if (status === "Absent" || status === "Leave") return 0;
  return Number.isFinite(workedMin) && workedMin > 0 ? Math.round(workedMin / 6) / 10 : 8;
}

/** This person's shift on that day ({ start, end }), or null when none is set. */
export const shiftFor = (name, iso) => getEmployeeScheduleForDate(name, parseLocalDate(iso));

/**
 * A past day with a clock-in and no clock-out counts as Absent: nothing says the day was worked
 * through. Today is left alone (they may still be at work), and so is a record someone with edit
 * rights set by hand (the clock-in stamps its own record "GPS"): a person's decision stands.
 */
export function effectiveRecord(rec, clk, date, today) {
  const byClock = !rec || rec.loggedBy === "GPS";
  const missed = byClock && date < today && tsDate(clk?.clockedInAt) && !tsDate(clk?.clockedOutAt);
  if (!missed) return rec || null;
  return { ...(rec || {}), status: "Absent", lateCutApplied: false, note: rec?.note || "No clock-out", missedClockOut: true };
}

const AUTO_NOTE = /^GPS clock-in( & out)?$/i;

/**
 * A record's note, said briefly: the clock-in's own wording becomes "GPS" (it is on nearly every
 * row), and a record somebody set by hand says who. Anything a person typed is kept as written.
 */
export function noteText(record) {
  if (!record) return "";
  const note = String(record.note || "").trim();
  const by = record.loggedBy && record.loggedBy !== "GPS" ? String(record.loggedBy).split(" ")[0] : "";
  if (by) return note && !AUTO_NOTE.test(note) ? `set by ${by} · ${note}` : `set by ${by}`;
  if (AUTO_NOTE.test(note)) return "GPS";
  if (/low-accuracy bypass/i.test(note)) return "GPS · weak signal";
  return note;
}

/**
 * Everyone on the roster for one day, in one shape: who, how the day stands, when they came and
 * went. `staff` is the directory (with `personId`), `records` and `clocks` are that day's rows.
 * `now` is only used to say how long someone who has not clocked out has been in.
 */
export function buildRoster({ staff, records, clocks, date, today = date, now = new Date() }) {
  const recBy = new Map(records.map((r) => [r.person_id, r]));
  const clkBy = new Map(clocks.map((c) => [c.person_id, c]));
  const closed = isSat(date);
  return staff
    .filter((s) => s.personId)
    .map((s) => {
      const stored = recBy.get(s.personId) || null;
      const clk = clkBy.get(s.personId) || null;
      const rec = effectiveRecord(stored, clk, date, today);
      const inAt = tsDate(clk?.clockedInAt);
      const outAt = tsDate(clk?.clockedOutAt);
      const worked = inAt && outAt ? workedMinutes(clk) : null;
      const sofar = inAt && !outAt && date === isoFromDate(now) ? Math.max(0, Math.round((now - inAt) / 60000)) : null;
      return {
        personId: s.personId,
        name: s.name,
        role: s.jobRole || "",
        state: stateOf(rec, { closed }),
        status: rec?.status || null,
        record: stored,                              // what is stored, for saving over it
        missedClockOut: Boolean(rec?.missedClockOut),
        lateMinutes: Number(rec?.lateMinutes) || 0,
        lateCut: rec?.lateCutApplied === true,
        inAt, outAt, worked, sofar,
        shift: shiftFor(s.name, date),
        distanceM: clk?.distanceToSiteM ?? null,
        viaGps: Boolean(inAt),
        note: rec?.note || "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** How many of a roster stand in each state, and how many are on the books at all (a closed day has none). */
export function daySummary(rows) {
  const n = { present: 0, late: 0, half: 0, leave: 0, absent: 0, none: 0, closed: 0 };
  rows.forEach((r) => { n[r.state] += 1; });
  const total = rows.length - n.closed;
  const here = n.present + n.late + n.half;
  return { ...n, total, here };
}

/* ── A month ───────────────────────────────────────────────────── */

const tally = (into, status, cut) => {
  if (status === "Present" || status === "Half-day") into.present += 1;
  else if (status === "Late") { into.late += 1; if (cut) into.cuts += 1; }
  else if (status === "Absent") into.absent += 1;
  else if (status === "Leave") into.leave += 1;
};

/**
 * Counts for one person's month and the days behind them. Saturday is the day off, so it only
 * appears when something was recorded on it. Half-days count as present.
 */
export function personMonth({ records, clocks, month, today }) {
  const recBy = new Map(records.map((r) => [r.date, r]));
  const clkBy = new Map(clocks.map((c) => [c.date, c]));
  const out = { present: 0, late: 0, cuts: 0, absent: 0, leave: 0, minutes: 0, days: [] };
  for (let d = 1; d <= month.days; d += 1) {
    const iso = isoOf(month.y, month.m, d);
    const clock = clkBy.get(iso) || null;
    const record = effectiveRecord(recBy.get(iso), clock, iso, today);
    if (isSat(iso) && !record && !clock) continue;
    if (record) tally(out, record.status, record.lateCutApplied);
    out.minutes += workedMinutes(clock) ?? 0;
    out.days.push({ iso, record, clock });
  }
  return out;
}

/**
 * The whole team's month in one go, built from each person's own month so the totals, the
 * calendar's little bars and a person's report can never disagree. `byDay` is day of the
 * month -> that day's counts; `people` carries every person's counts and days.
 */
export function teamMonth({ staff, records, clocks, month, today }) {
  const group = (rows) => {
    const by = new Map();
    rows.forEach((r) => { if (!by.has(r.person_id)) by.set(r.person_id, []); by.get(r.person_id).push(r); });
    return by;
  };
  const recBy = group(records);
  const clkBy = group(clocks);
  const team = { present: 0, late: 0, cuts: 0, absent: 0, leave: 0, minutes: 0 };
  const byDay = {};
  const people = [];
  staff.filter((s) => s.personId).forEach((s) => {
    const pm = personMonth({ records: recBy.get(s.personId) || [], clocks: clkBy.get(s.personId) || [], month, today });
    people.push({ personId: s.personId, name: s.name, role: s.jobRole || "", ...pm });
    Object.keys(team).forEach((k) => { team[k] += pm[k]; });
    pm.days.forEach(({ iso, record }) => {
      if (!record) return;
      const c = (byDay[Number(iso.slice(8, 10))] = byDay[Number(iso.slice(8, 10))] || { present: 0, late: 0, leave: 0, absent: 0 });
      if (record.status === "Present" || record.status === "Half-day") c.present += 1;
      else if (record.status === "Late") c.late += 1;
      else if (record.status === "Leave") c.leave += 1;
      else if (record.status === "Absent") c.absent += 1;
    });
  });
  const arrived = team.present + team.late;
  return { ...team, onTimePct: arrived ? Math.round((team.present / arrived) * 100) : null, byDay, people };
}

/** The weeks of a month, Monday first, as rows of seven (a null is a blank before the 1st or after the end). */
export function monthWeeks(month) {
  const lead = (new Date(month.y, month.m, 1).getDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: month.days }, (_, i) => isoOf(month.y, month.m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
