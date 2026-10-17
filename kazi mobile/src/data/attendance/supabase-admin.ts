/**
 * Admin member sheet — one staffer's month, plus the two things an admin can
 * change about them from the Team tab: a day's attendance status (with the 25%
 * late cut) and their work schedule.
 *
 * Mirrors the reference web app:
 *   `Attendance.jsx` roll-call editor → `attendance/{date}_{staffId}` (merge),
 *      writing `lateCutApplied` / `lateMinutes` only while the status is Late
 *   `Employees.jsx` Edit → Work Schedule → `employees/{docId}`'s
 *      `scheduleStart` / `scheduleEnd` / `scheduleWorkingDays`
 *
 * Both writes are admin-gated in the UI (`can('attendance')`); the Firestore
 * rules are the real boundary.
 */

import { serverTimestamp } from '@/lib/supabase/collections';

import { patchDocument, setDocument } from '@/lib/supabase/write';
import { getActor } from '@/data/notifications/actor';

import {
  ATTENDANCE,
  DEFAULT_SCHEDULE,
  EMPLOYEES,
  STATUS_TO_HOURS,
  STATUS_TO_LIVE,
  buildDayDetail,
  daysInMonth,
  employeeById,
  isoFor,
  monthLabelOf,
  punchDuration,
  readAttendanceMonth,
  readEmployees,
  readPunchMonth,
} from './live-shared';
import type { AttendanceStatus, DayDetail, MemberMonthReport, WorkSchedule } from './types';

export interface MemberMonthQuery {
  /** `people.id` — the key the person's rows are filed under. */
  staffId: string;
  name: string;
  /** `YYYY-MM`. */
  monthISO: string;
}

/** One staffer's month: every day merged with its punch, plus their roster. */
export async function fetchMemberMonth({ staffId, name, monthISO }: MemberMonthQuery): Promise<MemberMonthReport> {
  const identity = { personId: staffId, name };
  const [employees, records, punches] = await Promise.all([
    readEmployees(),
    readAttendanceMonth(identity, monthISO),
    readPunchMonth(identity, monthISO),
  ]);

  const employee = employeeById(employees, staffId);
  const schedule = employee?.schedule ?? DEFAULT_SCHEDULE;

  const year = Number(monthISO.slice(0, 4));
  const month1 = Number(monthISO.slice(5, 7));
  const days: DayDetail[] = [];
  const tally: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, half: 0, leave: 0, off: 0 };
  let cuts = 0;
  let hoursWorked = 0;

  for (let day = 1; day <= daysInMonth(year, month1); day++) {
    const iso = isoFor(year, month1, day);
    const att = records.get(iso);
    const punch = punches.get(iso);
    days.push(buildDayDetail(iso, schedule, att, punch));
    if (att) {
      tally[att.status] += 1;
      if (att.status === 'late' && att.lateCutApplied) cuts += 1;
    }
    hoursWorked += punchDuration(punch) ?? 0;
  }

  return {
    staffId,
    name,
    monthISO,
    monthLabel: monthLabelOf(monthISO),
    schedule,
    days,
    tally,
    cuts,
    hoursWorked: Math.round(hoursWorked * 10) / 10,
  };
}

export interface SaveDayStatusInput {
  staffId: string;
  staffName: string;
  role: string;
  /** `YYYY-MM-DD`. */
  date: string;
  status: AttendanceStatus;
  /** Only meaningful while `status` is 'late'. */
  lateCutApplied: boolean;
  lateMinutes: number;
}

/**
 * Set one staffer's status for one date. Keyed `{date}_{staffId}` exactly as the
 * web does, and — like the web — the late fields are cleared whenever the status
 * moves off Late, so a stale 25% cut can't survive a correction.
 */
export async function saveDayStatus(input: SaveDayStatusInput): Promise<void> {
  if (!input.staffId) throw new Error('saveDayStatus: staffId is required — attendance rows are keyed by it');
  if (input.status === 'off') return; // display-only — nothing to record
  const isLate = input.status === 'late';
  await setDocument(
    ATTENDANCE,
    `${input.date}_${input.staffId}`,
    {
      date: input.date,
      staffId: input.staffId,
      staffName: input.staffName,
      role: input.role,
      status: STATUS_TO_LIVE[input.status],
      hours: STATUS_TO_HOURS[input.status],
      loggedBy: getActor()?.name ?? 'kazi-mobile',
      createdAt: serverTimestamp(),
      lateCutApplied: isLate ? input.lateCutApplied : false,
      lateMinutes: isLate ? input.lateMinutes : 0,
    },
    { merge: true },
  );
}

export interface SaveScheduleInput {
  /** `employees` doc id — schedules live on the directory entry, not on attendance. */
  employeeDocId: string;
  schedule: Pick<WorkSchedule, 'start' | 'end' | 'workingDays'>;
}

/** Write a staffer's shift back to their `employees` doc (Employee Directory → Work Schedule). */
export async function saveSchedule({ employeeDocId, schedule }: SaveScheduleInput): Promise<void> {
  if (!employeeDocId) throw new Error('saveSchedule: no employees doc for this staffer');
  // No `updatedBy` — `people` has no such column, and sending one rejected
  // the whole statement, so every schedule save used to fail silently.
  await patchDocument(EMPLOYEES, employeeDocId, {
    scheduleStart: schedule.start,
    scheduleEnd: schedule.end,
    scheduleWorkingDays: schedule.workingDays,
    updatedAt: serverTimestamp(),
  });
}
