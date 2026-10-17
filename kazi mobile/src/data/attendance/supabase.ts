/**
 * Live attendance readers: the workshop roll call and the raw GPS punches.
 *
 * The roll call is built exactly the way the reference web app's
 * `Attendance.jsx` builds it, because it has to agree with what the site shows:
 *
 *   roster    every active person in the directory — NOT everyone who happens
 *             to have an `attendance` row. Someone who has never been marked
 *             still belongs on the roll call.
 *   status    today's `attendance` row for that person, or "Absent" when there
 *             isn't one (the reference's `closedDefault`). Never a status
 *             carried over from an older day.
 *   times     today's real `clock_ins` punch — in → out.
 *
 * Everything joins on `person_id` (`people.id`). This module used to group by
 * display name, which was the right call before the Supabase migration but is
 * now the bug: the compat views expose `staffName` as whatever spelling was
 * typed at the time, so one person arrived as two roll-call lines ("Wilson" and
 * "wilson shah", "Sarbagya" and "Sarbagya Karki", "Deepa Sunam" and "Sunam
 * Deepa"), while anyone with no rows at all was missing from the list entirely.
 */

import type { AvatarTint } from '@/components/ui/avatar';
import { collection, getDocs, getDb } from '@/lib/supabase/collections';
import { num, str, tsToISO } from '@/lib/data/normalise';

import {
  activeRoster,
  attendanceByPerson,
  formatHours,
  hhmm,
  isSaturday,
  lateCutAmountNPR,
  nepalToday,
  punchDuration,
  punchesByPerson,
  readAttendanceRange,
  readEmployees,
  readPunchRange,
  scheduledHoursFor,
  dayNameOf,
  type DatedAtt,
  type DatedPunch,
  type EmployeeRecord,
} from './live-shared';

import type { AttendanceStatus, ClockPunch, MemberMonth, TeamMember } from './types';

const TINTS: AvatarTint[] = ['mint', 'clay', 'draft', 'amber', 'dark'];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** The reference's roll-call default: no row for today means Absent, not Present. */
function statusFor(att: DatedAtt | undefined, punch: DatedPunch | undefined, isWorkingDay: boolean): AttendanceStatus {
  if (att) return att.status;
  // A punch with no roll-call row still means they turned up.
  if (punch) return 'present';
  return isWorkingDay ? 'absent' : 'off';
}

/** `08:04 → 17:12`, `08:04 → —` while still on the clock, `— → —` when they never punched. */
function timesFor(punch: DatedPunch | undefined, status: AttendanceStatus): string {
  if (punch) return `${hhmm(punch.clockedInAt) ?? '—'} → ${punch.clockedOutAt ? (hhmm(punch.clockedOutAt) ?? '—') : '—'}`;
  if (status === 'leave') return 'Approved leave';
  if (status === 'off') return 'Weekly off';
  return '— → —';
}

/** Month-to-date tallies for one person, from their own rows only. */
function monthFor(employee: EmployeeRecord, rows: DatedAtt[], punches: DatedPunch[]): MemberMonth {
  const tally = { present: 0, late: 0, absent: 0, half: 0, leave: 0 };
  let cutDays = 0;
  for (const r of rows) {
    if (r.status === 'off') continue;
    tally[r.status] += 1;
    if (r.status === 'late' && r.lateCutApplied) cutDays += 1;
  }
  // Real clocked time only — the `hours` column carries the *scheduled* 8h even
  // on days nobody worked, so summing it invents time (see `firestore-month.ts`).
  const worked = punches.reduce((sum, p) => sum + (punchDuration(p) ?? 0), 0);
  return {
    ...tally,
    otHours: '0h 00m',
    hoursMTD: formatHours(worked),
    hoursMTDValue: worked,
    cutDays,
    // `basicSalaryNPR` is RLS-gated: it reads as 0 for anyone who may not see
    // salaries, and `lateCutAmountNPR` then honestly returns 0 rather than a guess.
    cutNPR: lateCutAmountNPR(employee.basicSalaryNPR, cutDays),
  };
}

function memberOf(
  employee: EmployeeRecord,
  index: number,
  today: string,
  att: DatedAtt | undefined,
  punch: DatedPunch | undefined,
  monthAtt: DatedAtt[],
  monthPunches: DatedPunch[],
): TeamMember {
  // Closed on Saturdays for everyone (the reference's blanket rule), and on
  // whatever weekdays this person's own roster leaves out.
  const isWorkingDay =
    !isSaturday(today) && (!employee.hasSchedule || scheduledHoursFor(employee.schedule, dayNameOf(today)) > 0);
  const status = statusFor(att, punch, isWorkingDay);
  const workedToday = punchDuration(punch);
  return {
    id: index + 1,
    staffId: employee.docId,
    employeeDocId: employee.docId,
    name: employee.name,
    role: (att?.role || employee.role || 'Staff').trim(),
    initials: initialsOf(employee.name),
    avatarTint: TINTS[index % TINTS.length],
    status,
    times: timesFor(punch, status),
    hours: formatHours(workedToday ?? 0),
    month: monthFor(employee, monthAtt, monthPunches),
  };
}

/** Group dated rows by `person_id`, preserving order. */
function bucket<T extends { personId: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const list = out.get(r.personId);
    if (list) list.push(r);
    else out.set(r.personId, [r]);
  }
  return out;
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const today = nepalToday();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [employees, monthAtt, monthPunches] = await Promise.all([
    readEmployees(),
    readAttendanceRange(monthStart, today),
    readPunchRange(monthStart, today),
  ]);

  // `readEmployees` degrades to [] on a denied read, which the month views want
  // but the roll call does not: an empty directory here means "0 on roll",
  // which reads as a fact rather than as the failure it is.
  if (employees.length === 0) throw new Error('attendance/team: the employee directory came back empty');

  // Today's slice comes out of the month read — one round trip instead of three.
  const todayAtt = attendanceByPerson(monthAtt.filter((r) => r.date === today));
  const todayPunch = punchesByPerson(monthPunches.filter((r) => r.date === today));
  const attByPerson = bucket(monthAtt);
  const punchByPerson = bucket(monthPunches);

  return activeRoster(employees).map((e, i) =>
    memberOf(
      e,
      i,
      today,
      todayAtt.get(e.docId),
      todayPunch.get(e.docId),
      attByPerson.get(e.docId) ?? [],
      punchByPerson.get(e.docId) ?? [],
    ),
  );
}

function mapPunchDoc(id: string, d: Record<string, unknown>): ClockPunch | null {
  const staffName = str(d.staffName).trim();
  const clockedInAt = str(d.clockedInAt).trim() || tsToISO(d.createdAt);
  if (!staffName || !clockedInAt) return null;
  return {
    id,
    staffName,
    date: str(d.date).trim() || clockedInAt.slice(0, 10),
    clockedInAt,
    clockedOutAt: str(d.clockedOutAt).trim() || null,
    lat: d.lat == null ? null : num(d.lat),
    lng: d.lng == null ? null : num(d.lng),
    accuracyM: d.accuracyM == null ? null : num(d.accuracyM),
    distanceToSiteM: d.distanceToSiteM == null ? null : num(d.distanceToSiteM),
    bypassUsed: false,
    status: /late/i.test(str(d.status)) ? 'Late' : 'Present',
    lateMinutes: num(d.lateMinutes),
    lateCutApplied: /true/i.test(str(d.lateCutApplied)),
  };
}

export async function fetchClockPunches(): Promise<ClockPunch[]> {
  const snap = await getDocs(collection(getDb(), 'clock_ins'));
  return snap.docs
    .map((d) => mapPunchDoc(d.id, d.data() as Record<string, unknown>))
    .filter((p): p is ClockPunch => p != null)
    .sort((a, b) => b.clockedInAt.localeCompare(a.clockedInAt));
}
