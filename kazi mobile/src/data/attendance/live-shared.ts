/**
 * Shared live-attendance primitives — the pieces both the "my month" reader
 * (`supabase-month.ts`) and the admin member sheet (`supabase-admin.ts`) need:
 * Kathmandu date maths, work schedules off the `employees` doc, and the per-day
 * merge of an `attendance` row with its `clock_ins` punch.
 *
 * The rules here mirror the reference web app (`src/constants.js`,
 * `src/pages/Attendance.jsx`, `src/pages/Employees.jsx`) so a figure shown in
 * the app matches the same figure on the site:
 *   - a shift comes from `scheduleStart` / `scheduleEnd`, narrowed by
 *     `scheduleWorkingDays` and then by `scheduleDayOverrides[weekday]`
 *   - 15+ minutes past shift start → Late **with** a 25% salary cut for the day;
 *     1–14 minutes → Late on grace, no cut
 *   - the cut is `basicSalaryNPR / 30 × 0.25` per cut day
 *
 * Every reader here swallows its own errors and degrades to an empty result, so
 * one denied collection can't blank a whole screen.
 */

import { collection, getDocs, query, where, type QueryConstraint } from '@/lib/supabase/collections';

import { getDb } from '@/lib/supabase/collections';
import { isDirectorPosition } from '@/auth/permissions';
import { arr, num, str, tsToISO } from '@/lib/data/normalise';

import type { AttendanceStatus, DayDetail, WorkSchedule } from './types';

export const ATTENDANCE = 'attendance';
export const CLOCK_INS = 'clock_ins';
export const EMPLOYEES = 'employees';

/** Nepal is a fixed UTC+5:45 with no DST — safe to offset by a constant. */
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60_000;

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Reference rule: 15+ minutes past shift start forfeits 25% of the day's salary. */
export const LATE_GRACE_MIN = 15;
export const LATE_CUT_FRACTION = 0.25;
/** The reference payroll divides the basic salary by a flat 30 to get a day rate. */
export const PAYROLL_DAYS_PER_MONTH = 30;

export const DEFAULT_WORKING_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const DEFAULT_SCHEDULE: WorkSchedule = {
  start: '09:00',
  end: '17:00',
  workingDays: DEFAULT_WORKING_DAYS,
  dayOverrides: {},
};

// ---------------------------------------------------------------------------
// Kathmandu date maths. Every ISO date is parsed as UTC midnight so the device's
// own timezone can never shift a weekday or a month boundary.

/** `YYYY-MM-DD` for an instant, in Asia/Kathmandu — the date the web writes. */
export function nepalToday(): string {
  return new Date(Date.now() + NEPAL_OFFSET_MS).toISOString().slice(0, 10);
}

export function isoFor(year: number, month1: number, day: number): string {
  return `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Weekday index (0 = Sun) of an ISO date. */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function dayNameOf(iso: string): string {
  return DAY_NAMES[weekdayOf(iso)];
}

/** The workshop is shut on Saturdays — the reference's blanket `isSaturday` rule. */
export function isSaturday(iso: string): boolean {
  return weekdayOf(iso) === 6;
}

/** `2026-08-31` → `Sun 31 Aug`. */
export function dayLabelOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)}`;
}

/** `2026-08` → `August 2026`. */
export function monthLabelOf(monthISO: string): string {
  const year = Number(monthISO.slice(0, 4));
  const month1 = Number(monthISO.slice(5, 7));
  return `${MONTH_NAMES[month1 - 1]} ${year}`;
}

/** Step a `YYYY-MM` month string by `delta` months. */
export function shiftMonth(monthISO: string, delta: number): string {
  const year = Number(monthISO.slice(0, 4));
  const month0 = Number(monthISO.slice(5, 7)) - 1 + delta;
  const d = new Date(Date.UTC(year, month0, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Step a `YYYY-MM-DD` date string by `delta` days. */
export function shiftDate(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** `HH:MM` of an ISO instant, in Asia/Kathmandu. */
export function hhmm(iso: string): string | null {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms + NEPAL_OFFSET_MS).toISOString().slice(11, 16);
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map((n) => parseInt(n, 10));
  if (!Number.isFinite(h)) return 0;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

// ---------------------------------------------------------------------------
// Schedules

/**
 * The shift rostered for one weekday, or null when it's a weekly off — the
 * reference's `getEmployeeScheduleForDate`, minus the runtime-override registry.
 */
export function shiftForDay(schedule: WorkSchedule, dayName: string): { start: string; end: string } | null {
  if (!schedule.workingDays.includes(dayName)) return null;
  const o = schedule.dayOverrides[dayName];
  if (o && (o.start || o.end)) return { start: o.start || schedule.start, end: o.end || schedule.end };
  return { start: schedule.start, end: schedule.end };
}

/** Rostered hours for one weekday, 0 on a weekly off. */
export function scheduledHoursFor(schedule: WorkSchedule, dayName: string): number {
  const shift = shiftForDay(schedule, dayName);
  if (!shift) return 0;
  const mins = minutesOf(shift.end) - minutesOf(shift.start);
  return mins > 0 ? mins / 60 : 8;
}

/** One staffer's directory entry, as far as attendance cares. */
export interface EmployeeRecord {
  /**
   * `people.id` — which is also `attendance.person_id` and `clock_ins.person_id`.
   * Since the Supabase migration this is the one key every attendance row
   * agrees on, so it is what the whole module joins by.
   */
  docId: string;
  name: string;
  email: string;
  role: string;
  /** Same value as {@link docId}; kept for callers that still read `staffId`. */
  staffId: string;
  /** `Active` / `Inactive` — the roll call lists the active ones, as the web does. */
  status: string;
  /** `positions.id` — powers excluding directors (UK, no attendance tracking) from the roster. */
  positionId: string;
  basicSalaryNPR: number;
  schedule: WorkSchedule;
  /**
   * True only when the directory actually carries a shift for this person.
   * {@link schedule} always resolves (to {@link DEFAULT_SCHEDULE}) so the
   * calendar has something to draw, but the late calc must know the difference
   * — the reference grades an employee with no roster by "in at 10:00 or later
   * is Late, with no salary cut" rather than against an invented 09:00 start.
   */
  hasSchedule: boolean;
}

function toSchedule(x: Record<string, unknown>): WorkSchedule {
  const days = arr<unknown>(x.scheduleWorkingDays)
    .map((d) => str(d).trim().slice(0, 3))
    .filter(Boolean);
  const raw = (x.scheduleDayOverrides ?? {}) as Record<string, unknown>;
  const dayOverrides: WorkSchedule['dayOverrides'] = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const start = str(o.start).trim();
      const end = str(o.end).trim();
      if (start || end) dayOverrides[k.slice(0, 3)] = { start: start || undefined, end: end || undefined };
    }
  }
  return {
    start: str(x.scheduleStart).trim() || DEFAULT_SCHEDULE.start,
    end: str(x.scheduleEnd).trim() || DEFAULT_SCHEDULE.end,
    workingDays: days.length ? days : DEFAULT_WORKING_DAYS,
    dayOverrides,
  };
}

/** Every `employees` doc, normalised. Empty on a denied read. */
export async function readEmployees(): Promise<EmployeeRecord[]> {
  try {
    const snap = await getDocs(collection(getDb(), EMPLOYEES));
    return snap.docs.map((d) => {
      const x = d.data() as Record<string, unknown>;
      return {
        docId: d.id,
        name: str(x.name).trim(),
        email: str(x.email).trim(),
        role: str(x.role).trim(),
        staffId: d.id,
        status: str(x.status).trim() || 'Active',
        positionId: str(x.positionId).trim(),
        basicSalaryNPR: num(x.basicSalaryNPR),
        schedule: toSchedule(x),
        hasSchedule: !!str(x.scheduleStart).trim() && !!str(x.scheduleEnd).trim(),
      };
    });
  } catch (err) {
    console.warn('[attendance] employees read failed — falling back to the default shift', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Row readers. Queries are single-field equality only, so no composite index is
// ever required; the month window is applied in memory.

export function mapStatus(raw: unknown): AttendanceStatus {
  const s = str(raw).trim().toLowerCase();
  if (s.startsWith('late')) return 'late';
  if (s.startsWith('absent')) return 'absent';
  if (s.startsWith('half')) return 'half';
  if (s.startsWith('leave')) return 'leave';
  return 'present';
}

/**
 * Mobile status → the exact label the web writes to `attendance.status`.
 * `off` has no label because it is never written — see {@link AttendanceStatus}.
 */
export const STATUS_TO_LIVE: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  // "Half-day" exactly — the reference's STATUS_OPTIONS value, which its report
  // and payroll filters match on.
  half: 'Half-day',
  leave: 'Leave',
  off: '',
};

/** Hours the reference writes alongside a manually-set status. */
export const STATUS_TO_HOURS: Record<AttendanceStatus, number> = {
  present: 8,
  late: 8,
  half: 4,
  absent: 0,
  leave: 0,
  off: 0,
};

export interface AttRow {
  /** `people.id` — the key everything downstream groups by. */
  personId: string;
  status: AttendanceStatus;
  hours: number;
  note: string;
  lateMinutes: number;
  lateCutApplied: boolean;
  role: string;
  staffName: string;
  /** Used only to break a tie when two identities hold the same day. */
  createdAt: string;
}

export interface PunchRow {
  id: string;
  /** `people.id` — the key everything downstream groups by. */
  personId: string;
  clockedInAt: string;
  clockedOutAt: string | null;
  distanceToSiteM: number | null;
}

function boolish(v: unknown): boolean {
  return v === true || /^true$/i.test(str(v));
}

/**
 * One person's identity in the attendance collections.
 *
 * `personId` (`people.id`) is the real key: every `attendance` / `clock_ins`
 * row carries `person_id`, and it is single-valued per person. The legacy
 * `ids` / `name` sweep is only a fallback for a caller that has neither — it
 * cannot be the primary path, because `staffId` in the compat views is
 * `COALESCE(legacy_staff_id, legacy_firebase_uid, person_id)` (three different
 * values across one person's rows) and `staffName` is whatever spelling was
 * typed at the time ("Wilson" vs "wilson shah", "Sarbagya" vs "Sarbagya Karki").
 */
export interface StaffIdentity {
  /** `people.id`. When set, nothing else is needed. */
  personId?: string | null;
  /** Legacy `staffId` values, used only when there's no `personId`. */
  ids?: string[];
  /** Display name as it appears in `staffName`; last-resort fallback. */
  name?: string;
}

/** Equality-only filters covering an identity — `person_id` alone when we have it. */
function identityFilters({ personId, ids, name }: StaffIdentity): QueryConstraint[][] {
  if (personId) return [[where('person_id', '==', personId)]];
  const filters: QueryConstraint[][] = [];
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (unique.length === 1) filters.push([where('staffId', '==', unique[0])]);
  else if (unique.length > 1) filters.push([where('staffId', 'in', unique.slice(0, 30))]);
  if (name) filters.push([where('staffName', '==', name)]);
  return filters;
}

/** One `attendance` row, normalised. */
export function toAttRow(x: Record<string, unknown>): AttRow {
  return {
    personId: str(x.person_id).trim(),
    status: mapStatus(x.status),
    hours: num(x.hours),
    note: str(x.note).trim(),
    lateMinutes: num(x.lateMinutes),
    lateCutApplied: boolish(x.lateCutApplied),
    role: str(x.role).trim(),
    staffName: str(x.staffName).trim(),
    createdAt: tsToISO(x.createdAt),
  };
}

/** One `clock_ins` row, normalised. */
export function toPunchRow(id: string, x: Record<string, unknown>): PunchRow {
  return {
    id,
    personId: str(x.person_id).trim(),
    clockedInAt: tsToISO(x.clockedInAt ?? x.createdAt),
    clockedOutAt: x.clockedOutAt ? tsToISO(x.clockedOutAt) : null,
    distanceToSiteM: x.distanceToSiteM == null ? null : num(x.distanceToSiteM),
  };
}

/** An {@link AttRow} that still knows which day it belongs to. */
export interface DatedAtt extends AttRow {
  date: string;
}
/** A {@link PunchRow} that still knows which day it belongs to. */
export interface DatedPunch extends PunchRow {
  date: string;
}

function dateConstraints(startISO: string, endISO?: string): QueryConstraint[] {
  // The compat views expose `date` as a `YYYY-MM-DD` string, so a lexicographic
  // range is a chronological one and no composite index is involved.
  return endISO && endISO !== startISO
    ? [where('date', '>=', startISO), where('date', '<=', endISO)]
    : [where('date', '==', startISO)];
}

/**
 * Every `attendance` row in a date range, across everyone the reader may see.
 * Rows with no `person_id` are dropped: there is nothing to attribute them to,
 * and guessing from `staffName` is exactly what used to split one person into
 * two roll-call lines.
 */
export async function readAttendanceRange(startISO: string, endISO?: string): Promise<DatedAtt[]> {
  try {
    const snap = await getDocs(query(collection(getDb(), ATTENDANCE), ...dateConstraints(startISO, endISO)));
    return snap.docs
      .map((d) => {
        const x = d.data() as Record<string, unknown>;
        return { ...toAttRow(x), date: str(x.date).trim() || tsToISO(x.createdAt).slice(0, 10) };
      })
      .filter((r) => r.personId && r.date);
  } catch (err) {
    console.warn('[attendance] attendance range read failed', err);
    return [];
  }
}

/** Every `clock_ins` punch in a date range, across everyone the reader may see. */
export async function readPunchRange(startISO: string, endISO?: string): Promise<DatedPunch[]> {
  try {
    const snap = await getDocs(query(collection(getDb(), CLOCK_INS), ...dateConstraints(startISO, endISO)));
    return snap.docs
      .map((d) => {
        const x = d.data() as Record<string, unknown>;
        const row = toPunchRow(d.id, x);
        return { ...row, date: str(x.date).trim() || row.clockedInAt.slice(0, 10) };
      })
      .filter((r) => r.personId && r.clockedInAt);
  } catch (err) {
    console.warn('[attendance] clock_ins range read failed', err);
    return [];
  }
}

/**
 * Collapse a person's punches for one day into the day they actually worked:
 * the earliest clock-in and the latest clock-out. Someone can punch more than
 * once (a break, a corrected clock-out).
 */
export function mergePunches(a: PunchRow, b: PunchRow): PunchRow {
  const outAt =
    !a.clockedOutAt || !b.clockedOutAt
      ? (a.clockedOutAt ?? b.clockedOutAt)
      : a.clockedOutAt > b.clockedOutAt
        ? a.clockedOutAt
        : b.clockedOutAt;
  return {
    ...a,
    clockedInAt: b.clockedInAt < a.clockedInAt ? b.clockedInAt : a.clockedInAt,
    clockedOutAt: outAt,
    distanceToSiteM: a.distanceToSiteM ?? b.distanceToSiteM,
  };
}

/** Punches for one day, one per person, merged by {@link mergePunches}. */
export function punchesByPerson(rows: DatedPunch[]): Map<string, DatedPunch> {
  const out = new Map<string, DatedPunch>();
  for (const r of rows) {
    const prev = out.get(r.personId);
    out.set(r.personId, prev ? { ...mergePunches(prev, r), date: prev.date } : r);
  }
  return out;
}

/** Roll-call rows for one day, one per person — the most recently written wins. */
export function attendanceByPerson(rows: DatedAtt[]): Map<string, DatedAtt> {
  const out = new Map<string, DatedAtt>();
  for (const r of rows) {
    const prev = out.get(r.personId);
    if (!prev || r.createdAt > prev.createdAt) out.set(r.personId, r);
  }
  return out;
}

/** `attendance` rows for one person in one `YYYY-MM`, keyed by date. */
export async function readAttendanceMonth(identity: StaffIdentity, monthISO: string): Promise<Map<string, AttRow>> {
  const out = new Map<string, AttRow>();
  for (const constraints of identityFilters(identity)) {
    try {
      const snap = await getDocs(query(collection(getDb(), ATTENDANCE), ...constraints));
      for (const d of snap.docs) {
        const x = d.data() as Record<string, unknown>;
        const date = str(x.date).trim() || tsToISO(x.createdAt).slice(0, 10);
        if (!date.startsWith(monthISO)) continue;
        const row = toAttRow(x);
        // Two identities can both hold a row for the same day — the newer wins.
        const prev = out.get(date);
        if (!prev || row.createdAt > prev.createdAt) out.set(date, row);
      }
    } catch (err) {
      console.warn('[attendance] attendance month read failed', err);
    }
  }
  return out;
}

/** `clock_ins` punches for one person in one `YYYY-MM`, keyed by date. */
export async function readPunchMonth(identity: StaffIdentity, monthISO: string): Promise<Map<string, PunchRow>> {
  const out = new Map<string, PunchRow>();
  for (const constraints of identityFilters(identity)) {
    try {
      const snap = await getDocs(query(collection(getDb(), CLOCK_INS), ...constraints));
      for (const d of snap.docs) {
        const x = d.data() as Record<string, unknown>;
        const clockedInAt = tsToISO(x.clockedInAt ?? x.createdAt);
        const date = str(x.date).trim() || clockedInAt.slice(0, 10);
        if (!date.startsWith(monthISO)) continue;
        const row = toPunchRow(d.id, x);
        // A day can hold more than one punch (a break, a corrected clock-out) —
        // the day worked runs from the earliest in to the latest out.
        const prev = out.get(date);
        out.set(date, prev ? mergePunches(prev, row) : row);
      }
    } catch (err) {
      console.warn('[attendance] clock_ins month read failed', err);
    }
  }
  return out;
}

/**
 * Real clocked duration in hours — measured from the punch timestamps, not from
 * the stored `workedHours`, so the figure is always the actual time between
 * clock-in and clock-out. Null while a punch is still open.
 */
export function punchDuration(punch: PunchRow | undefined): number | null {
  if (!punch?.clockedOutAt) return null;
  const inMs = new Date(punch.clockedInAt).getTime();
  const outMs = new Date(punch.clockedOutAt).getTime();
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs) || outMs <= inMs) return null;
  return Math.round(((outMs - inMs) / 3_600_000) * 100) / 100;
}

/** Merge one date's `attendance` row and `clock_ins` punch into a display shape. */
export function buildDayDetail(
  date: string,
  schedule: WorkSchedule,
  att: AttRow | undefined,
  punch: PunchRow | undefined,
): DayDetail {
  const dayName = dayNameOf(date);
  const shift = shiftForDay(schedule, dayName);
  const worked = punchDuration(punch);
  return {
    date,
    label: dayLabelOf(date),
    status: att?.status ?? null,
    clockIn: punch ? hhmm(punch.clockedInAt) : null,
    clockOut: punch?.clockedOutAt ? hhmm(punch.clockedOutAt) : null,
    workedHours: worked,
    scheduledHours: scheduledHoursFor(schedule, dayName),
    shiftLabel: shift ? `${shift.start}–${shift.end}` : null,
    lateMinutes: att?.lateMinutes ?? 0,
    lateCutApplied: att?.lateCutApplied ?? false,
    note: att?.note ?? '',
    distanceToSiteM: punch?.distanceToSiteM ?? null,
    isWeeklyOff: shift === null,
  };
}

/**
 * The reference payroll's late deduction: a flat 25% of one day's salary per
 * cut day, where a day is the basic salary over 30.
 */
export function lateCutAmountNPR(basicSalaryNPR: number, cutDays: number): number {
  if (!basicSalaryNPR || !cutDays) return 0;
  return Math.round((basicSalaryNPR / PAYROLL_DAYS_PER_MONTH) * LATE_CUT_FRACTION * cutDays);
}

/** `7.25` → `"7h 15m"`. */
export function formatHours(totalHours: number): string {
  const safe = Math.max(0, totalHours);
  const h = Math.floor(safe);
  const m = Math.round((safe - h) * 60);
  // 7.999h → "8h 00m", not "7h 60m".
  return m === 60 ? `${h + 1}h 00m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

// ---------------------------------------------------------------------------
// Late grading
//
// Ported from the reference `calculateAttendanceStatus` in `src/constants.js`,
// including the branch mobile used to be missing: when the directory holds no
// shift for someone (or the weekday is one of their offs), the reference grades
// them on a flat "clocked in at 10:00 or later is Late" rule and applies **no**
// salary cut. `data/attendance/schedule.ts` graded everyone against a hardcoded
// 09:00 instead, because its lookup table is keyed by the *mock* roster's names
// — no real staffer matched it. That marked people Late, and docked 25% of a
// day's pay, for arriving on time on an 11:00 or 12:00 shift.

/** The reference's "no roster on file" cut-off: in at 10:00 or later reads as Late. */
const NO_SCHEDULE_LATE_HOUR = 10;

export interface LateGrade {
  status: 'Present' | 'Late';
  lateMinutes: number;
  lateCutApplied: boolean;
}

/**
 * Grade an arrival against a staffer's rostered shift.
 *
 * `at` is graded on the Kathmandu wall clock, the same timezone the dates are
 * written in. It used to read the device's own hours, which held for a phone in
 * Nepal but graded the UK staff against their local time — 10:00 BST is 15:45 at
 * the workshop, and it was passing as on time.
 */
export function gradeArrival(employee: EmployeeRecord | null, at: Date): LateGrade {
  // Shifted into Kathmandu, then read with the UTC getters: the `getUTC*` values
  // are the Nepal wall clock, and a Nepal-local punch grades exactly as before.
  const nepal = new Date(at.getTime() + NEPAL_OFFSET_MS);
  const shift = employee?.hasSchedule ? shiftForDay(employee.schedule, DAY_NAMES[nepal.getUTCDay()]) : null;
  if (!shift) {
    return { status: nepal.getUTCHours() >= NO_SCHEDULE_LATE_HOUR ? 'Late' : 'Present', lateMinutes: 0, lateCutApplied: false };
  }

  const scheduled = new Date(nepal);
  const [h, m] = shift.start.split(':').map((n) => parseInt(n, 10));
  scheduled.setUTCHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);

  const diffMins = (nepal.getTime() - scheduled.getTime()) / 60_000;
  if (diffMins >= LATE_GRACE_MIN) return { status: 'Late', lateMinutes: Math.round(diffMins), lateCutApplied: true };
  if (diffMins > 0) return { status: 'Late', lateMinutes: Math.round(diffMins), lateCutApplied: false };
  return { status: 'Present', lateMinutes: 0, lateCutApplied: false };
}

/** Look a staffer up by `people.id` — the only join this module trusts. */
export function employeeById(employees: EmployeeRecord[], personId: string | null | undefined): EmployeeRecord | null {
  if (!personId) return null;
  return employees.find((e) => e.docId === personId) ?? null;
}

/**
 * The active roll call, as the reference builds it: everyone in the directory
 * bar the leavers — and bar directors, who are UK-based and never clock in
 * (Attendance is Nepal-staff self-tracking; see the ERP Adoption Plan).
 */
export function activeRoster(employees: EmployeeRecord[]): EmployeeRecord[] {
  return employees
    .filter((e) => e.name && e.status.trim().toLowerCase() !== 'inactive' && !isDirectorPosition(e.positionId))
    .sort((a, b) => a.name.trim().localeCompare(b.name.trim()));
}
