/**
 * One calendar day across the whole workshop — who punched in, when they
 * punched out, and what the roll call says about them.
 *
 * This is the admin counterpart to `firestore-month.ts`: that file reads one
 * person across a month, this one reads every person across a single date. Both
 * draw on the same two collections, so the display shape agrees.
 *
 *   clock_ins   the real punches — `clockedInAt` / `clockedOutAt`
 *   attendance  the roll-call status, late minutes and the 25%-cut flag
 *
 * The two are joined on `person_id`. They used to be joined on display name,
 * which split anyone whose `staffName` was spelled more than one way into two
 * entries for the same day.
 *
 * Never throws for a caller: a failed read is logged and yields an empty day
 * rather than a screen-wide error, matching how the month reader behaves.
 */

import {
  activeRoster,
  attendanceByPerson,
  employeeById,
  hhmm,
  punchDuration,
  punchesByPerson,
  readAttendanceRange,
  readEmployees,
  readPunchRange,
} from './live-shared';
import type { DayRosterEntry } from './types';

/**
 * The whole active roster for `dateISO` plus anyone else who left a row that
 * day, ordered by clock-in (earliest first), with the people who never punched
 * last. Status stays null for a person with no `attendance` row: on a past day
 * that is unrecorded, not an assumed absence.
 */
export async function fetchDayRoster(dateISO: string): Promise<DayRosterEntry[]> {
  const [employees, attRows, punchRows] = await Promise.all([
    readEmployees(),
    readAttendanceRange(dateISO),
    readPunchRange(dateISO),
  ]);

  const roll = attendanceByPerson(attRows);
  const punches = punchesByPerson(punchRows);

  // The whole active roster, as the roll call builds it — not only the people
  // who left a row that day, or "3 of 3 clocked in" counts itself.
  const rosterIds = activeRoster(employees).map((e) => e.docId);

  const entries: DayRosterEntry[] = [];
  for (const personId of new Set([...rosterIds, ...punches.keys(), ...roll.keys()])) {
    const p = punches.get(personId);
    const r = roll.get(personId);
    // The directory is the name of record; the rows' own `staffName` is only a
    // fallback for a person who has since been removed from it.
    const employee = employeeById(employees, personId);
    entries.push({
      staffId: personId,
      name: employee?.name ?? r?.staffName ?? '',
      role: (employee?.role || r?.role || 'Staff').trim(),
      status: r?.status ?? null,
      clockIn: p ? hhmm(p.clockedInAt) : null,
      clockOut: p?.clockedOutAt ? hhmm(p.clockedOutAt) : null,
      workedHours: p ? punchDuration(p) : null,
      lateMinutes: r?.lateMinutes ?? 0,
      lateCutApplied: r?.lateCutApplied ?? false,
      note: r?.note ?? '',
      distanceToSiteM: p?.distanceToSiteM ?? null,
    });
  }

  return entries.sort((a, b) => {
    // A missing clock-in sorts last, then it's earliest punch first, then name.
    if (!!a.clockIn !== !!b.clockIn) return a.clockIn ? -1 : 1;
    if (a.clockIn && b.clockIn && a.clockIn !== b.clockIn) return a.clockIn.localeCompare(b.clockIn);
    return a.name.localeCompare(b.name);
  });
}
