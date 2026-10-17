/**
 * Data-source selector for the attendance module.
 *   reads  → Supabase when configured (a failed read throws; no mock fallback)
 *   writes → Supabase when configured, mirrored into the mock (see `liveWrite`)
 *
 * `fetchClockStatus` is derived from today's `clock_ins` rows for the signed-in
 * user; `toggleClock` / `setMemberStatus` hit `clock_ins` / `attendance`.
 * Roll-call undo re-applies the prior status through `setMemberStatus`, so
 * `restoreTeam` stays mock-only (used only as a local snapshot restore).
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';
import { liveWrite } from '@/lib/supabase/write';

import * as live from './supabase';
import * as liveDay from './supabase-day';
import * as liveMonth from './supabase-month';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';
import type { AttendanceStatus, ClockStatus } from './types';
import type { ClockToggleInput } from './mock-api';

export { restoreTeam, statusLabel } from './mock-api';
export type { ClockToggleInput } from './mock-api';

export const fetchTeam = isSupabaseConfigured
  ? liveRead('attendance/team', live.fetchTeam)
  : mock.fetchTeam;

export const fetchClockPunches = isSupabaseConfigured
  ? liveRead('attendance/punches', live.fetchClockPunches)
  : mock.fetchClockPunches;

/** One date across the whole workshop — the admin calendar's day sheet. */
export const fetchDayRoster = isSupabaseConfigured
  ? liveRead('attendance/dayRoster', liveDay.fetchDayRoster)
  : mock.fetchDayRoster;

// No mock fallback: `writeLive.fetchClockStatus` already catches its own errors
// and returns a safe "not clocked in" state. Falling back to the mock here would
// surface its seeded "clocked in since 08:12" demo value to a real user.
export const fetchClockStatus = isSupabaseConfigured
  ? writeLive.fetchClockStatus
  : mock.fetchClockStatus;

// Same reasoning as `fetchClockStatus`: no mock fallback. `liveMonth.fetchMyMonth`
// catches its own read failures and returns an honest empty month — falling back
// would show a real user the seeded "168h 40m / NPR 1,250 deduction" persona.
export const fetchMyMonth = isSupabaseConfigured ? liveMonth.fetchMyMonth : mock.fetchMyMonth;

const toggleClockWrite = liveWrite('attendance/toggleClock', writeLive.toggleClock, mock.toggleClock);

// `liveWrite` hands back the MOCK's return value, and the mock's module state is
// seeded "clocked in since 08:12" against a name-keyed shift table no real
// person matches — so a live punch re-reads its own result instead. The status,
// late minutes and cut flag then come from the row that was just written.
export const toggleClock: (input: ClockToggleInput) => Promise<ClockStatus> = isSupabaseConfigured
  ? async (input) => {
      await toggleClockWrite(input);
      return writeLive.fetchClockStatus();
    }
  : toggleClockWrite;

export const setMemberStatus = liveWrite(
  'attendance/setMemberStatus',
  (id: number, status: AttendanceStatus, personId?: string, name?: string) =>
    writeLive.setMemberStatus(id, status, personId, name),
  (id: number, status: AttendanceStatus, _personId?: string, _name?: string) => mock.setMemberStatus(id, status),
);
