/**
 * The attendance rules, in one place and free of React and the database so they can be read, and checked, on their own. The website's
 * `src/lib/workRules.js`, which owns them: the two have to agree to the minute, because both write the day's record.
 *
 * Two sets of rules sit side by side. Attendance dated BEFORE `NEW_RULES_FROM` follows the old rule: a clock-in 15 minutes or more after
 * the start is "Late" and flags a quarter-day cut. Attendance from that day on follows the management memo: a 10-minute grace, lateness
 * recorded in minutes with no pay cut, and every 7 unapproved absences in a month costing a day of salary. The day an arrival happened
 * decides which rule judged it, and a month takes the rule of the month it is for, so nothing already recorded is judged again and no
 * penalty is retroactive.
 *
 * The date is the website's `NEW_RULES_FROM`; change it in both places. There is no over-the-air update for this app, so a build made
 * before that day has to be in people's hands by it.
 */

import type { AttRow, PunchRow } from './live-shared';

/** The first day the memo's rules apply to. */
export const NEW_RULES_FROM = '2026-12-01';

/** Minutes after the start that still count as on time (a tolerance, not a new start time). */
export const GRACE_MIN = 10;
/** The old rule: this late or later flagged a quarter-day cut. */
export const OLD_CUT_AFTER_MIN = 15;
/** Unapproved absences in a month that cost one day of salary. */
export const ABSENCES_PER_DAY_CUT = 7;

/** The hours of someone with none of their own set: the memo's normal day. */
export const DEFAULT_SHIFT = { start: '10:00', end: '18:00' } as const;

export type Rules = 'old' | 'new';

/** The rules that judge a day (`YYYY-MM-DD`). */
export const rulesOn = (iso: string): Rules => (iso >= NEW_RULES_FROM ? 'new' : 'old');

/** The rules a whole month follows (the memo starts on the first of a month, so a month is never split). `monthISO` is `YYYY-MM`. */
export const rulesOfMonth = (monthISO: string): Rules => rulesOn(`${monthISO.slice(0, 7)}-01`);

export interface Arrival {
  status: 'Present' | 'Late';
  lateMinutes: number;
  lateCutApplied: boolean;
}

/**
 * How an arrival is judged. `shift` is the person's start for that day (null when they have none), and `wall` the moment they clocked
 * in, shifted so that its UTC getters read the Kathmandu wall clock (how the rest of this module reads time: the office is there, and a
 * phone in the UK must not grade people on its own clock).
 *
 * New rules: up to `GRACE_MIN` minutes after the start is on time; later is "Late", the minutes counted from the START, and no cut is
 * ever flagged. Someone with no hours is judged against `DEFAULT_SHIFT`.
 * Old rules: as the clock-in always judged it. Someone with no hours is Late from 10:00 with no minutes and no cut.
 */
export function judgeArrival(shift: { start: string } | null, wall: Date): Arrival {
  const day = wall.toISOString().slice(0, 10);
  const startOf = (start: string): Date => {
    const [h, m] = start.split(':').map((n) => parseInt(n, 10));
    const at = new Date(wall);
    at.setUTCHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
    return at;
  };

  if (rulesOn(day) === 'new') {
    const mins = Math.floor((wall.getTime() - startOf((shift ?? DEFAULT_SHIFT).start).getTime()) / 60_000);
    return mins <= GRACE_MIN
      ? { status: 'Present', lateMinutes: 0, lateCutApplied: false }
      : { status: 'Late', lateMinutes: mins, lateCutApplied: false };
  }

  if (!shift) return { status: wall.getUTCHours() >= 10 ? 'Late' : 'Present', lateMinutes: 0, lateCutApplied: false };
  const diffMins = (wall.getTime() - startOf(shift.start).getTime()) / 60_000;
  if (diffMins >= OLD_CUT_AFTER_MIN) return { status: 'Late', lateMinutes: Math.round(diffMins), lateCutApplied: true };
  if (diffMins > 0) return { status: 'Late', lateMinutes: Math.round(diffMins), lateCutApplied: false };
  return { status: 'Present', lateMinutes: 0, lateCutApplied: false };
}

/**
 * What a day reads as once it is over. A past day with a clock-in and no clock-out counts as Absent: nothing says it was worked
 * through (the website's `effectiveRecord`). Today is left alone, they may still be at work, and so is a record somebody set by hand:
 * the clock-in stamps its own record "GPS", and a person's decision stands. From December 2026 these are the absences that count
 * towards a day's pay.
 */
export function effectiveAtt<T extends AttRow>(att: T | undefined, punch: PunchRow | undefined, date: string, today: string): T | AttRow | undefined {
  const byClock = !att || att.loggedBy === 'GPS';
  if (!(byClock && date < today && punch?.clockedInAt && !punch.clockedOutAt)) return att;
  return {
    personId: punch.personId,
    hours: 0,
    lateMinutes: 0,
    role: '',
    staffName: '',
    loggedBy: '',
    createdAt: '',
    ...att,
    status: 'absent',
    lateCutApplied: false,
    note: att?.note || 'No clock-out',
  };
}
