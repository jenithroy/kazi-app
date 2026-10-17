import { simulateLatency } from '../mock/delay';
import { evaluateGeofence } from '@/lib/geo';
import {
  CLOCK_PUNCHES,
  DEFAULT_CLOCK_STATUS,
  MONTH_ISO_END,
  MONTH_ISO_START,
  MONTH_LABEL,
  MY_NAME,
  MY_SUMMARY,
  STATUS_LABELS,
  TEAM,
  TODAY_DAY,
  WEEKLY_HOURS,
  WORKING_DAYS,
} from './mock';
import { calculateAttendanceStatus, shiftFor } from './schedule';
import { minutesOf } from './live-shared';
import { buildMonthDays } from './utils';
import type {
  AttendanceStatus,
  ClockPunch,
  ClockStatus,
  DayRosterEntry,
  MyMonth,
  PunchSummary,
  TeamMember,
} from './types';

let clock: ClockStatus = { ...DEFAULT_CLOCK_STATUS };
let teamDb: TeamMember[] = TEAM.map((m) => ({ ...m }));
let punchesDb: ClockPunch[] = CLOCK_PUNCHES.map((p) => ({ ...p }));

function nowLabel(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isoDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function fetchClockStatus(): Promise<ClockStatus> {
  await simulateLatency();
  return { ...clock };
}

/** GPS clock-in/out payload — coords present on a real fix, null on bypass or clock-out. */
export interface ClockToggleInput {
  elapsedSeconds: number;
  staffName: string;
  coords: { lat: number; lng: number; accuracyM: number } | null;
  /** The user proceeded past a failed geofence / accuracy / permission gate. */
  bypassUsed: boolean;
}

export async function toggleClock(input: ClockToggleInput): Promise<ClockStatus> {
  await simulateLatency(250);
  const now = new Date();

  if (clock.clockedIn) {
    // Clock out — close the open punch, keep the session's punch summary for display.
    const open = [...punchesDb].reverse().find((p) => p.staffName === input.staffName && p.clockedOutAt === null);
    if (open) open.clockedOutAt = now.toISOString();
    punchesDb = [...punchesDb];
    clock = {
      clockedIn: false,
      inTime: clock.inTime,
      outTime: nowLabel(now),
      elapsedSeconds: input.elapsedSeconds,
      lastPunch: clock.lastPunch,
    };
    return { ...clock };
  }

  // Clock in — grade against the shift, geofence the fix, record a clock_ins row.
  const late = calculateAttendanceStatus(input.staffName, now);
  const geo = input.coords
    ? evaluateGeofence(input.coords.lat, input.coords.lng, input.coords.accuracyM)
    : null;

  const summary: PunchSummary = {
    distanceToSiteM: geo ? geo.distanceM : null,
    accuracyM: geo ? geo.accuracyM : null,
    bypassUsed: input.bypassUsed,
    status: late.status,
    lateMinutes: late.lateMinutes,
    lateCutApplied: late.lateCutApplied,
  };

  punchesDb = [
    ...punchesDb,
    {
      id: `ci-${now.getTime()}`,
      staffName: input.staffName,
      date: isoDate(now),
      clockedInAt: now.toISOString(),
      clockedOutAt: null,
      lat: input.coords?.lat ?? null,
      lng: input.coords?.lng ?? null,
      ...summary,
    },
  ];

  clock = {
    clockedIn: true,
    inTime: nowLabel(now),
    outTime: null,
    elapsedSeconds: input.elapsedSeconds,
    lastPunch: summary,
  };
  return { ...clock };
}

export async function fetchClockPunches(): Promise<ClockPunch[]> {
  await simulateLatency();
  return [...punchesDb].sort((a, b) => b.clockedInAt.localeCompare(a.clockedInAt)).map((p) => ({ ...p }));
}

export async function fetchTeam(): Promise<TeamMember[]> {
  await simulateLatency();
  return teamDb.map((m) => ({ ...m }));
}

/** `'08:04 → —'` → `['08:04', null]`; anything that isn't a punch pair → `[null, null]`. */
function splitTimes(times: string): [string | null, string | null] {
  const [a, b] = times.split('→').map((s) => s.trim());
  const clean = (s: string | undefined) => (s && /^\d{2}:\d{2}$/.test(s) ? s : null);
  return [clean(a), clean(b)];
}

/**
 * The whole team's punches for one date. The mock keeps a single day's roster,
 * so every date returns the same shape the live reader would — enough to lay
 * the admin day sheet out without Supabase configured.
 */
export async function fetchDayRoster(_dateISO: string): Promise<DayRosterEntry[]> {
  await simulateLatency();
  return teamDb
    .map((m) => {
      const [clockIn, clockOut] = splitTimes(m.times);
      return {
        staffId: m.staffId,
        name: m.name,
        role: m.role,
        status: m.status,
        clockIn,
        clockOut,
        workedHours: clockIn && clockOut ? (minutesOf(clockOut) - minutesOf(clockIn)) / 60 : null,
        lateMinutes: m.status === 'late' ? 22 : 0,
        lateCutApplied: m.status === 'late',
        note: '',
        distanceToSiteM: clockIn ? 40 : null,
      };
    })
    .sort((a, b) => {
      if (!!a.clockIn !== !!b.clockIn) return a.clockIn ? -1 : 1;
      if (a.clockIn && b.clockIn && a.clockIn !== b.clockIn) return a.clockIn.localeCompare(b.clockIn);
      return a.name.localeCompare(b.name);
    });
}

/** Admin roll-call edit (item 27) — set a staffer's status for the day; `times`/`hours` follow the status. */
export async function setMemberStatus(id: number, status: AttendanceStatus): Promise<void> {
  await simulateLatency(180);
  teamDb = teamDb.map((m) => {
    if (m.id !== id) return m;
    const times =
      status === 'absent' ? '— → —' : status === 'leave' ? 'Approved leave' : status === 'half' ? '08:10 → 12:30' : m.times.includes('→') && m.times !== '— → —' ? m.times : '08:00 → —';
    const hours = status === 'absent' || status === 'leave' ? '0h 00m' : status === 'half' ? '4h 20m' : m.hours === '0h 00m' ? '6h 30m' : m.hours;
    return { ...m, status, times, hours };
  });
}

export async function restoreTeam(previous: TeamMember[]): Promise<void> {
  await simulateLatency(120);
  teamDb = previous.map((m) => ({ ...m }));
}

/** Human-readable status label — re-exported for CSV builders. */
export const statusLabel = (s: AttendanceStatus) => STATUS_LABELS[s];

/**
 * Mock "my month" — the seeded August 2026 persona. Only used when Firebase is
 * unconfigured; the live path never falls back here (see `api.ts`).
 */
export async function fetchMyMonth(): Promise<MyMonth> {
  await simulateLatency();
  return {
    monthLabel: MONTH_LABEL,
    monthISOStart: MONTH_ISO_START,
    monthISOEnd: MONTH_ISO_END,
    workingDays: WORKING_DAYS,
    shiftLabel: `${shiftFor(MY_NAME).start}–${shiftFor(MY_NAME).end}`,
    todayDay: TODAY_DAY,
    days: buildMonthDays(),
    // The mock has no punch history to detail — tapping a day shows nothing.
    details: {},
    weeks: WEEKLY_HOURS.map((w) => ({ ...w })),
    summary: { ...MY_SUMMARY },
  };
}
