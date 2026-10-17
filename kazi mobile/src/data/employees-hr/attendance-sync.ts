import type { TeamMember } from '@/data/attendance/types';

import type { Employee } from './types';

/** Payroll attendance inputs derived from the month's roll-call (reference `autoCalculate`). */
export interface AttendancePrefill {
  /** Absent days this month. */
  absent: number;
  /** Late marks this month. */
  late: number;
  /** NPR forfeited to late cuts — only the marks that actually carried a 25% cut. */
  cutNPR: number;
  /** Overtime hours this month, rounded. */
  otH: number;
}

/** "9h 20m" → 9.33 */
function hoursFromHm(hm: string): number {
  const h = /(\d+)\s*h/.exec(hm)?.[1];
  const m = /(\d+)\s*m/.exec(hm)?.[1];
  return (h ? Number(h) : 0) + (m ? Number(m) / 60 : 0);
}

/**
 * Match an employee to the Attendance roster by name and read their
 * month-to-date tallies (item 28). Returns null for anyone not on the
 * roll-call — those keep whatever figures the payroll record already holds.
 */
export function attendancePrefill(team: TeamMember[], e: Employee): AttendancePrefill | null {
  const member = team.find((t) => t.name.toLowerCase() === e.name.toLowerCase());
  if (!member) return null;
  return {
    absent: member.month.absent,
    late: member.month.late,
    cutNPR: member.month.cutNPR,
    otH: Math.round(hoursFromHm(member.month.otHours)),
  };
}
