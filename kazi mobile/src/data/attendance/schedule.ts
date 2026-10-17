/**
 * Shift schedules + late-cut calculation (plan §3.12, item 26).
 * Ported from the reference `src/constants.js` — `EMPLOYEE_SCHEDULES`,
 * `getEmployeeScheduleForDate`, `calculateAttendanceStatus`.
 *
 * **Mock-only.** The lookup table below is keyed by the seeded roster's names,
 * so no real staffer ever matched it — which is why the live path now grades
 * arrivals with `live-shared.ts`'s `gradeArrival`, against the shift actually
 * stored on that person's directory entry.
 */

export interface Shift {
  /** "HH:MM" local start of shift. */
  start: string;
  /** "HH:MM" local end of shift. */
  end: string;
}

export const DEFAULT_SHIFT: Shift = { start: '09:00', end: '17:00' };

/** Keyed by the mock roster's display names (see `data/attendance/mock.ts` TEAM). */
export const EMPLOYEE_SCHEDULES: Record<string, Shift> = {
  'Sita Rai': { start: '09:00', end: '17:00' },
  'Anil Karki': { start: '08:00', end: '16:00' },
  'Pramila Thapa': { start: '09:00', end: '17:00' },
  'Rabin Bhandari': { start: '08:00', end: '16:00' },
  'Manisha Gurung': { start: '08:00', end: '16:00' },
  'Deepak Shrestha': { start: '09:30', end: '17:30' },
  'Sunita Rai': { start: '09:00', end: '17:00' },
  'Bimal Katwal': { start: '08:00', end: '16:00' },
};

/**
 * Minutes past shift start before a late arrival forfeits 25% of the day's
 * salary. Matches the reference `calculateAttendanceStatus` (`diffMins >= 15`).
 */
export const LATE_GRACE_MIN = 15;

/** Case-insensitive name lookup, `DEFAULT_SHIFT` when unknown (reference `getEmployeeScheduleForDate`). */
export function shiftFor(name: string | undefined | null): Shift {
  if (!name) return DEFAULT_SHIFT;
  const key = Object.keys(EMPLOYEE_SCHEDULES).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? EMPLOYEE_SCHEDULES[key] : DEFAULT_SHIFT;
}

export interface LateCalc {
  status: 'Present' | 'Late';
  /** Whole minutes after shift start, 0 when on time / early. */
  lateMinutes: number;
  /** `lateMinutes >= LATE_GRACE_MIN` — the 25% salary cut applies. */
  lateCutApplied: boolean;
  /** The shift start the arrival was measured against ("HH:MM"). */
  shiftStart: string;
}

/** Reference `calculateAttendanceStatus` — grade a clock-in time against the staffer's shift. */
export function calculateAttendanceStatus(name: string | undefined | null, clockInDate: Date): LateCalc {
  const shift = shiftFor(name);
  const [startHour, startMin] = shift.start.split(':').map(Number);
  const scheduled = new Date(clockInDate);
  scheduled.setHours(startHour, startMin, 0, 0);

  const diffMins = (clockInDate.getTime() - scheduled.getTime()) / 60_000;

  if (diffMins >= LATE_GRACE_MIN) {
    return { status: 'Late', lateMinutes: Math.round(diffMins), lateCutApplied: true, shiftStart: shift.start };
  }
  if (diffMins > 0) {
    return { status: 'Late', lateMinutes: Math.round(diffMins), lateCutApplied: false, shiftStart: shift.start };
  }
  return { status: 'Present', lateMinutes: 0, lateCutApplied: false, shiftStart: shift.start };
}
