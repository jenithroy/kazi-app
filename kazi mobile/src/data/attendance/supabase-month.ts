/**
 * The signed-in user's own month — the data behind the "Mine" view's calendar,
 * weekly-hours bars and monthly summary. Every figure is derived from live
 * Firestore rows; nothing here is seeded.
 *
 * Sources (all filtered to the signed-in user):
 *   attendance       per-day status, late minutes and the 25%-cut flag
 *   clock_ins        real punches → the actual time between clock-in and out
 *   employees        the rostered shift + `basicSalaryNPR`
 *
 * Hours worked are measured **only** from real punches (clock-in → clock-out),
 * never from the `attendance` row's `hours` field: the web writes the *scheduled*
 * figure there, 8h even on days marked Absent, so summing it invents time nobody
 * worked. Overtime is whatever a day's real punch ran past that day's rostered
 * shift (a whole shift worked on a weekly off counts end to end).
 *
 * The salary deduction is computed exactly as the reference payroll does —
 * `basicSalaryNPR / 30 × 25%` per day marked Late with the cut applied — so the
 * app and the site agree without waiting for payroll to be run.
 *
 * Never throws: a denied rule or a missing profile yields an *empty* month (real
 * calendar shell, zeroed figures) rather than falling back to the mock — showing
 * a real user seeded "168h 40m" would be worse than showing nothing.
 */

import { getActor } from '@/data/notifications/actor';

import {
  DEFAULT_SCHEDULE,
  MONTH_NAMES,
  buildDayDetail,
  dayNameOf,
  daysInMonth,
  employeeById,
  formatHours,
  isoFor,
  lateCutAmountNPR,
  nepalToday,
  punchDuration,
  readAttendanceMonth,
  readEmployees,
  readPunchMonth,
  scheduledHoursFor,
  shiftForDay,
  weekdayOf,
  type AttRow,
  type PunchRow,
} from './live-shared';
import type { AttendanceStatus, DayCell, DayDetail, MyMonth, MySummary, WeekHours, WorkSchedule } from './types';

/**
 * Company policy allowances. Neither is stored anywhere in the live database —
 * the reference app hard-codes them too — so they stay constants here.
 */
const LATE_MARKS_ALLOWED = 4;
const PAID_LEAVE_ALLOWED = 12;

interface BuildInput {
  schedule: WorkSchedule;
  basicSalaryNPR: number;
  records: Map<string, AttRow>;
  punches: Map<string, PunchRow>;
}

function buildMonth({ schedule, basicSalaryNPR, records, punches }: BuildInput): MyMonth {
  const today = nepalToday();
  const year = Number(today.slice(0, 4));
  const month1 = Number(today.slice(5, 7));
  const todayDay = Number(today.slice(8, 10));
  const total = daysInMonth(year, month1);
  const firstISO = isoFor(year, month1, 1);
  const lastISO = isoFor(year, month1, total);

  const cells: DayCell[] = [];
  for (let i = 0; i < weekdayOf(firstISO); i++) cells.push({ day: null, dateISO: null, status: null, isToday: false });

  const details: Record<string, DayDetail> = {};
  let workingDays = 0;
  let hoursWorked = 0;
  let overtime = 0;
  let cutDays = 0;
  let openPunchDays = 0;
  const tally: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, half: 0, leave: 0, off: 0 };
  /** Real + rostered hours per day-of-month, for the weekly bars. */
  const perDay = Array.from({ length: total + 1 }, () => ({ actual: 0, target: 0 }));

  for (let day = 1; day <= total; day++) {
    const iso = isoFor(year, month1, day);
    const dayName = dayNameOf(iso);
    const target = scheduledHoursFor(schedule, dayName);
    const isWorkingDay = target > 0;
    if (isWorkingDay) workingDays += 1;

    const record = records.get(iso);
    const punch = punches.get(iso);
    // The actual time between clock-in and clock-out — nothing else counts.
    const actual = punchDuration(punch) ?? 0;
    // A punch that was never closed measures as 0h. That is missing data, not a
    // day nobody worked, so the totals carry the count and say so.
    if (punch && !punch.clockedOutAt) openPunchDays += 1;

    perDay[day] = { actual, target };
    hoursWorked += actual;
    // A whole shift worked on a weekly off is overtime end to end.
    if (actual > 0) overtime += isWorkingDay ? Math.max(0, actual - target) : actual;

    if (record) {
      tally[record.status] += 1;
      if (record.status === 'late' && record.lateCutApplied) cutDays += 1;
    }

    details[iso] = buildDayDetail(iso, schedule, record, punch);

    let status: DayCell['status'];
    if (record) {
      // A record wins even on a weekly off — someone who worked Saturday
      // shouldn't read as "off".
      status = record.status;
    } else if (punch) {
      status = 'present';
    } else if (!isWorkingDay) {
      status = 'off';
    } else if (day > todayDay) {
      status = 'future';
    } else {
      // A past working day with no attendance row and no punch: unrecorded, not
      // an assumed absence — the calendar leaves it blank.
      status = null;
    }

    cells.push({ day, dateISO: iso, status, isToday: day === todayDay });
  }

  // Calendar weeks (Sun–Sat) clipped to the month, matching the grid's rows.
  const weeks: WeekHours[] = [];
  const short = MONTH_NAMES[month1 - 1].slice(0, 3);
  for (let start = 1; start <= total; ) {
    const end = Math.min(total, start + (6 - weekdayOf(isoFor(year, month1, start))));
    let hours = 0;
    let target = 0;
    for (let d = start; d <= end; d++) {
      hours += perDay[d].actual;
      target += perDay[d].target;
    }
    weeks.push({
      label: start === end ? `${short} ${start}` : `${short} ${start}–${end}`,
      hours: Math.round(hours * 10) / 10,
      target: Math.round(target),
    });
    start = end + 1;
  }

  const deduction = lateCutAmountNPR(basicSalaryNPR, cutDays);
  const summary: MySummary = {
    hoursWorked: formatHours(hoursWorked),
    openPunchDays,
    overtime: formatHours(overtime),
    lateMarks: tally.late,
    lateAllowed: LATE_MARKS_ALLOWED,
    absentDays: tally.absent,
    leaveTaken: tally.leave,
    leaveAllowed: PAID_LEAVE_ALLOWED,
    deduction,
    deductionDays: cutDays,
    deductionNote: cutDays
      ? basicSalaryNPR
        ? `${cutDays} late ${cutDays === 1 ? 'day' : 'days'} · 25% of a day's salary each`
        : `${cutDays} late ${cutDays === 1 ? 'day' : 'days'} · no basic salary on file to price the cut`
      : '',
  };

  const todayShift = shiftForDay(schedule, dayNameOf(today));

  return {
    monthLabel: `${MONTH_NAMES[month1 - 1]} ${year}`,
    shiftLabel: todayShift ? `${todayShift.start}–${todayShift.end}` : 'Weekly off',
    monthISOStart: firstISO,
    monthISOEnd: lastISO,
    workingDays,
    todayDay,
    days: cells,
    details,
    weeks,
    summary,
  };
}

export async function fetchMyMonth(): Promise<MyMonth> {
  const actor = getActor();
  const personId = actor?.personId ?? null;
  const name = actor?.name?.trim() ?? '';

  const empty: BuildInput = { schedule: DEFAULT_SCHEDULE, basicSalaryNPR: 0, records: new Map(), punches: new Map() };
  if (!personId) return buildMonth(empty);

  const monthISO = nepalToday().slice(0, 7);
  const identity = { personId, name };
  const [employees, records, punches] = await Promise.all([
    readEmployees(),
    readAttendanceMonth(identity, monthISO),
    readPunchMonth(identity, monthISO),
  ]);

  const me = employeeById(employees, personId);
  return buildMonth({
    schedule: me?.schedule ?? DEFAULT_SCHEDULE,
    basicSalaryNPR: me?.basicSalaryNPR ?? 0,
    records,
    punches,
  });
}
