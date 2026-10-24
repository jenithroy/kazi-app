/**
 * The person card's sums, with no React in them: what its attendance, points and pay panels add up. The card (components/profile/)
 * only draws what these say. Who may see what is lib/personAccess.js, kept apart because the profile card in the top bar needs that
 * and nothing here, and this file pulls in the attendance maths, which the app's first download should not carry.
 */
import { buildRoster, fmtClock, fmtMinutes, monthOf, personMonth, shiftMonth, workedMinutes } from "./attendance";
import { sameId } from "./personAccess";
import { tsDate } from "../utils/date";

// The small helpers live in their own files; they are here too so the card's code can take everything from one place.
export { firstName, possessive } from "./personName";
export { isSelf, sameId, seesOf } from "./personAccess";

/* ── Today ─────────────────────────────────────────────────────── */

/**
 * One person's day today in the roll call's own reading (`buildRoster`), so the card and the Attendance page can never say
 * different things about the same day. `records` and `clocks` are the rows for any range that includes `today`.
 */
export function dayOf({ person, records, clocks, today, now = new Date(), holidays = [] }) {
  const staff = [{ personId: person.id, name: person.name, jobRole: person.role, location: person.location }];
  return buildRoster({
    staff,
    records: records.filter((r) => r.date === today),
    clocks: clocks.filter((c) => c.date === today),
    date: today, today, now, holidays,
  })[0] || null;
}

/**
 * How the day reads, in a word, a colour and a line of times:
 *   { tone: "good" | "warn" | "bad" | "info" | "mute", label, detail }
 * `detail` is "In 09:58 · 3h 20m so far", "In 09:58 · Out 18:02 · 8h 04m", or "".
 */
export function dayLine(r) {
  if (!r) return { tone: "mute", label: "No record", detail: "" };
  const inT = fmtClock(r.inAt);
  const outT = fmtClock(r.outAt);
  let detail = "";
  if (inT && outT) detail = `In ${inT} · Out ${outT}${r.worked != null ? ` · ${fmtMinutes(r.worked)}` : ""}`;
  else if (inT) detail = `In ${inT}${r.sofar != null ? ` · ${fmtMinutes(r.sofar)} so far` : r.missedClockOut ? " · no clock-out" : ""}`;
  switch (r.state) {
    case "present": return { tone: "good", label: "Present", detail };
    case "half": return { tone: "good", label: "Half-day", detail };
    case "late": return { tone: "warn", label: r.lateMinutes ? `Late · ${r.lateMinutes} min` : "Late", detail };
    case "leave": return { tone: "info", label: "On leave", detail };
    case "absent": return { tone: "bad", label: "Absent", detail };
    case "closed": return { tone: "mute", label: r.off?.kind === "holiday" ? r.off.name : "Day off", detail: r.off?.kind === "holiday" ? "Holiday: nobody is expected in" : "The office's day off" };
    default: return { tone: "mute", label: "Not in yet", detail: "" };
  }
}

/* ── A month ───────────────────────────────────────────────────── */

export const thisMonth = (today) => monthOf(today);
export const stepMonth = (month, by) => shiftMonth(month, by);
/** Is `month` as late as the month `today` is in? (There is nothing to look at after it.) */
export const isLatestMonth = (month, today) => month.start >= monthOf(today).start;

/**
 * The month's counts and its days, newest first and none after today: { present, late, absent, leave, cuts, minutes, onTimePct, days, blank }.
 * This is `personMonth` (the Attendance page's own), so the card and the page can never disagree.
 */
export function monthOfDays({ records, clocks, month, today, holidays = [], region }) {
  const pm = personMonth({ records, clocks, month, today, holidays, region });
  const arrived = pm.present + pm.late;
  return {
    present: pm.present, late: pm.late, absent: pm.absent, leave: pm.leave, cuts: pm.cuts, minutes: pm.minutes,
    onTimePct: arrived ? Math.round((pm.present / arrived) * 100) : null,
    days: pm.days.filter((d) => d.iso <= today).reverse(),
    // nobody marked a single day and nothing was clocked: a month before they joined, or one nobody has looked at, not a run of absences
    blank: pm.days.every((d) => !d.record && !d.clock),
  };
}

/** One day of a month for the list: the times and how long, from the clock-in record. */
export function dayTimes(clock) {
  const inAt = tsDate(clock?.clockedInAt);
  const outAt = tsDate(clock?.clockedOutAt);
  return { inT: fmtClock(inAt), outT: fmtClock(outAt), mins: workedMinutes(clock) };
}

/** "142h" / "7h 30m": hours worked in a month, for the line under the counts. */
export const hoursLabel = (minutes) => (minutes > 0 ? fmtMinutes(minutes).replace(/ 00m$/, "") : "");

/* ── Points ────────────────────────────────────────────────────── */

/**
 * Where one person stands, read off the two boards (`points_leaderboard`): { total, week, rankWeek, peopleWeek, rankTotal, peopleTotal }.
 * Only people who are still Active are on a board, so anyone else reads as no points.
 */
export function pointsOf(boards, personId) {
  const w = boards.week.find((r) => sameId(r.personId, personId));
  const a = boards.all.find((r) => sameId(r.personId, personId));
  return {
    total: a ? a.points : 0,
    week: w ? w.points : 0,
    rankWeek: w ? w.rank : null,
    peopleWeek: boards.week.length,
    rankTotal: a ? a.rank : null,
    peopleTotal: boards.all.length,
  };
}
