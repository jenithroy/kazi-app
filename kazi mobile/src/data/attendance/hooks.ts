import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isSupabaseConfigured } from '@/lib/supabase';
import { notify } from '@/data/notifications/notify';

import { attendanceKeys } from './keys';
import * as admin from './supabase-admin';
import * as api from './api';
import type { ClockToggleInput } from './api';
import type { AttendanceStatus, ClockStatus, TeamMember } from './types';

export function useClockStatus() {
  // Clock state changes server-side (a clock-out on the web, another device) and
  // is time-sensitive — always re-read on mount, never serve it stale.
  return useQuery({
    queryKey: attendanceKeys.clock(),
    queryFn: api.fetchClockStatus,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** GPS clock-in / clock-out — payload carries the fix (or a bypass flag) per item 26. */
export function useToggleClock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClockToggleInput) => api.toggleClock(input),
    onSuccess: (data: ClockStatus, input) => {
      queryClient.setQueryData(attendanceKeys.clock(), data);
      queryClient.invalidateQueries({ queryKey: attendanceKeys.punches() });
      // Today's cell, this week's bar and the month totals all move with a punch.
      queryClient.invalidateQueries({ queryKey: attendanceKeys.myMonth() });
      // So does the admin day sheet, which lists this punch among everyone's.
      queryClient.invalidateQueries({ queryKey: attendanceKeys.dayRosters() });
      // Re-derive the session from Firestore (`fetchClockStatus` reads today's clock_ins).
      queryClient.invalidateQueries({ queryKey: attendanceKeys.clock() });
      // A clock-IN that bypassed the geofence or had no GPS fix is worth flagging.
      if (data.clockedIn && (input.bypassUsed || !input.coords)) {
        notify({
          eventType: 'attendance.clock_in_flagged',
          section: 'attendance',
          payload: { employee: input.staffName, label: input.bypassUsed ? 'geofence bypassed' : 'no GPS fix' },
        });
      }
    },
  });
}

/**
 * The signed-in user's own month — calendar cells, weekly bars and the monthly
 * summary, all read from `attendance` / `clock_ins` / `finance_payroll`.
 * Re-read on mount: a punch or a roll-call edit made elsewhere changes it.
 */
export function useMyMonth() {
  return useQuery({
    queryKey: attendanceKeys.myMonth(),
    queryFn: api.fetchMyMonth,
    refetchOnMount: 'always',
  });
}

/**
 * Every staffer's punches for one date — the admin calendar's day sheet.
 * Disabled until a day is tapped, and re-read on mount because a roll-call
 * edit or a live punch moves it.
 */
export function useDayRoster(dateISO: string | null) {
  return useQuery({
    queryKey: attendanceKeys.dayRoster(dateISO ?? ''),
    queryFn: () => api.fetchDayRoster(dateISO as string),
    enabled: !!dateISO,
    refetchOnMount: 'always',
  });
}

/** Raw GPS punches — reference `clock_ins` collection (item 26). */
export function useClockPunches() {
  return useQuery({ queryKey: attendanceKeys.punches(), queryFn: api.fetchClockPunches });
}

export function useTeamRoster() {
  // Roll-call is edited from the web too — re-read on mount so the app reflects it.
  return useQuery({ queryKey: attendanceKeys.team(), queryFn: api.fetchTeam, refetchOnMount: 'always' });
}

/** Admin roll-call: set one staffer's status for the day (item 27). */
export function useSetMemberStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, personId, name }: { id: number; status: AttendanceStatus; personId?: string; name?: string }) =>
      api.setMemberStatus(id, status, personId, name),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: attendanceKeys.team() });
      queryClient.setQueryData<TeamMember[]>(attendanceKeys.team(), (old) =>
        (old ?? []).map((m) => (m.id === id ? { ...m, status } : m)),
      );
    },
    onSuccess: (_data, { id, status }) => {
      if (status !== 'absent' && status !== 'late') return;
      const member = queryClient.getQueryData<TeamMember[]>(attendanceKeys.team())?.find((m) => m.id === id);
      notify({
        eventType: 'attendance.absent_late',
        section: 'attendance',
        payload: { employee: member?.name, status: status === 'absent' ? 'Absent' : 'Late' },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.team() });
      queryClient.invalidateQueries({ queryKey: attendanceKeys.myMonth() });
      queryClient.invalidateQueries({ queryKey: attendanceKeys.dayRosters() });
    },
  });
}

export function useRestoreTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: TeamMember[]) => api.restoreTeam(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: attendanceKeys.team() });
      queryClient.setQueryData<TeamMember[]>(attendanceKeys.team(), previous);
    },
  });
}

/**
 * One staffer's month for the admin sheet (Team tab → tap a name). Live-only:
 * there's no mock equivalent, so it stays disabled until a staffer is picked.
 */
export function useMemberMonth(query: admin.MemberMonthQuery | null) {
  return useQuery({
    queryKey: attendanceKeys.memberMonth(query?.staffId ?? '', query?.monthISO ?? ''),
    queryFn: () => admin.fetchMemberMonth(query as admin.MemberMonthQuery),
    enabled: isSupabaseConfigured && !!query?.staffId && !!query?.monthISO,
    refetchOnMount: 'always',
  });
}

/** Admin: set one staffer's status for one date, including the 25% late cut. */
export function useSaveDayStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: admin.SaveDayStatusInput) => admin.saveDayStatus(input),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.memberMonths() });
      queryClient.invalidateQueries({ queryKey: attendanceKeys.team() });
      // The edited person may be the signed-in user — their own month moves too.
      queryClient.invalidateQueries({ queryKey: attendanceKeys.myMonth() });
      queryClient.invalidateQueries({ queryKey: attendanceKeys.dayRosters() });
      if (input.status !== 'absent' && input.status !== 'late') return;
      notify({
        eventType: 'attendance.absent_late',
        section: 'attendance',
        payload: { employee: input.staffName, status: input.status === 'absent' ? 'Absent' : 'Late' },
      });
    },
  });
}

/** Admin: rewrite a staffer's work schedule on their `employees` doc. */
export function useSaveSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: admin.SaveScheduleInput) => admin.saveSchedule(input),
    onSuccess: () => {
      // Schedules drive rostered hours, weekly-off shading and overtime.
      queryClient.invalidateQueries({ queryKey: attendanceKeys.memberMonths() });
      queryClient.invalidateQueries({ queryKey: attendanceKeys.myMonth() });
      queryClient.invalidateQueries({ queryKey: attendanceKeys.team() });
    },
  });
}
