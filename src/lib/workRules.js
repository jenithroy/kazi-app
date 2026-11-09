/**
 * The attendance and pay rules in one place, free of React and the database so they can be read, and checked, on their own.
 *
 * Two sets of rules sit side by side. Attendance dated BEFORE `NEW_RULES_FROM` follows the old rule: a clock-in 15 minutes or
 * more after the start is "Late" and flags a quarter-day cut. Attendance from that day on follows the management memo: a 10-minute
 * grace, lateness recorded in minutes with no pay cut, and every 7 unapproved absences in a month costing a day of salary.
 *
 * THE DAY decides which rule judged it, never the client that wrote it or the month it falls in: a cut flag on a day from the switch
 * on is ignored (a phone app that still grades by the old rule writes one), and an absence before it never counts toward the 7. So
 * nothing already recorded is judged again and no penalty is retroactive. A month that holds the switch day is "mixed" (see
 * `rulesOfMonth`): its payroll takes the old cuts of the days before the switch and the absences of the days from it.
 *
 * What is not decided here: the pro-rata formula for time actually missed (Deepa is preparing it; until it exists the payroll card's
 * adjustment is where a manual amount goes), and any tax slab beyond the flat 1%.
 */

/** The first day the memo's rules apply to (Kathmandu's calendar day). Change it here and the clock-in, the Attendance page and Payroll all follow. */
export const NEW_RULES_FROM = "2026-11-04";
/** That day as a person reads it: "4 November 2026". */
export const NEW_RULES_LABEL = new Date(`${NEW_RULES_FROM}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export const GRACE_MIN = 10;            // minutes after the start that still count as on time (not a new start time)
export const OLD_CUT_AFTER_MIN = 15;    // the old rule: this late or later flagged a quarter-day cut
export const ABSENCES_PER_DAY_CUT = 7;  // unapproved absences in a month that cost one day of salary
export const PAY_DIVISOR = 30;          // a day's pay is the monthly basic over this: every slip and leave line in the accountant's sheets is built on it
export const STANDARD_DAY_HOURS = 8;    // the hours of a shift when a person has none saved; otherwise an hour's pay is a day's over THEIR shift hours (as the sheets)
export const OT_RATE = 1.5;             // overtime pays this many times the hour's pay (the sheets have no formula for overtime, only typed amounts: confirm with the accountant)
export const DEFAULT_TDS_PCT = 1;       // "Income Tax (1%)" on every slip, taken on the basic salary and any bonus
export const BONUS_REASON_MAX = 60;     // letters in what a bonus was for
/** What a bonus is often for. Suggestions only: anything can be typed. */
export const BONUS_SUGGESTIONS = ["Dashain", "Tihar", "Performance", "Attendance"];

/** The hours of someone with none of their own set: the memo's normal day. */
export const DEFAULT_SHIFT = { start: "10:00", end: "18:00" };

/** Why overtime was needed, the memo's own list, so recurring causes can be found. */
export const OT_REASONS = [
  { value: "late_client_change", label: "Late client change" },
  { value: "bottleneck", label: "Bottleneck" },
  { value: "rework", label: "Rework" },
  { value: "material_delay", label: "Material delay" },
  { value: "unrealistic_deadline", label: "Unrealistic deadline" },
  { value: "other", label: "Other" },
];

const pad = (n) => String(n).padStart(2, "0");

/** The local calendar day of a Date, as YYYY-MM-DD (how the rest of the app reads "a day"). */
export const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "new" for a day on or after NEW_RULES_FROM, else "old". */
export const rulesOn = (iso) => (String(iso) >= NEW_RULES_FROM ? "new" : "old");

/**
 * The rules a month's payroll follows: "old" (every day of it is before the switch), "new" (every day is from it on), or "mixed"
 * (the month holds the switch day: the days before it are judged by the old rule, the days from it by the new one, each by ITS day).
 * `monthIndex` is 0 to 11.
 */
export function rulesOfMonth(year, monthIndex) {
  const first = `${year}-${pad(monthIndex + 1)}-01`;
  const last = `${year}-${pad(monthIndex + 1)}-${pad(new Date(Number(year) || 2000, monthIndex + 1, 0).getDate())}`;
  if (last < NEW_RULES_FROM) return "old";
  if (first >= NEW_RULES_FROM) return "new";
  return "mixed";
}

/** Whole minutes `at` is after a "HH:MM" start on the same day (negative when before it). */
function minutesAfter(start, at) {
  const [h, m] = String(start).split(":").map(Number);
  const startAt = new Date(at);
  startAt.setHours(h, m, 0, 0);
  return Math.floor((at.getTime() - startAt.getTime()) / 60000);
}

/**
 * How an arrival is judged: `shift` is the person's { start, end } for that day (null when they have none), `at` the moment they
 * clocked in. Resolves to { status, lateMinutes, lateCutApplied }.
 *
 * New rules: up to GRACE_MIN minutes after the start is on time; later is "Late" with the minutes counted from the START (the grace is
 * a tolerance, not a new start time); no cut is ever flagged. Someone with no hours is judged against DEFAULT_SHIFT.
 * Old rules: exactly as the clock-in always judged it.
 */
export function judgeArrival(shift, at) {
  if (rulesOn(localIso(at)) === "new") {
    const mins = minutesAfter((shift || DEFAULT_SHIFT).start, at);
    return mins <= GRACE_MIN
      ? { status: "Present", lateCutApplied: false, lateMinutes: 0 }
      : { status: "Late", lateCutApplied: false, lateMinutes: mins };
  }

  if (!shift) {
    return { status: at.getHours() >= 10 ? "Late" : "Present", lateCutApplied: false, lateMinutes: 0 };
  }
  const [startHour, startMin] = shift.start.split(":").map(Number);
  const scheduledTime = new Date(at);
  scheduledTime.setHours(startHour, startMin, 0, 0);
  const diffMins = (at.getTime() - scheduledTime.getTime()) / (1000 * 60);

  if (diffMins >= OLD_CUT_AFTER_MIN) return { status: "Late", lateCutApplied: true, lateMinutes: Math.round(diffMins) };
  if (diffMins > 0) return { status: "Late", lateCutApplied: false, lateMinutes: Math.round(diffMins) };
  return { status: "Present", lateCutApplied: false, lateMinutes: 0 };
}
