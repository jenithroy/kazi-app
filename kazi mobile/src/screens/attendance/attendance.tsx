import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { useAuth } from '@/auth/auth-context';
import { isDirector } from '@/auth/permissions';
import { useToast } from '@/components/toast/toast-provider';
import { HeaderAccount } from '@/components/ui/header-account';
import { hasFailed, isBlocked, ScreenGate } from '@/components/ui/screen-gate';
import { ScreenHeader } from '@/components/ui/screen-header';
import { toCSV } from '@/lib/export/csv';
import * as haptics from '@/lib/haptics';
import { useBackHandler } from '@/lib/use-back-handler';
import { useScrollTop } from '@/lib/use-scroll-top';
import { useTheme } from '@/theme/theme-provider';
import {
  useClockStatus,
  useDayRoster,
  useMyMonth,
  useSetMemberStatus,
  useTeamRoster,
  useToggleClock,
} from '@/data/attendance/hooks';
import { MY_NAME, STATUS_LABELS } from '@/data/attendance/mock';
import { dayLabelOf, formatHours } from '@/data/attendance/live-shared';
import { currentMonthLabel, todayLabel } from '@/data/attendance/utils';
import type { AttendanceStatus, AttendanceView, TeamFilter, TeamMember, TeamMonthStats } from '@/data/attendance/types';
import { useMoneySignature } from '@/lib/money';

import { ClockCard } from './clock-card';
import { DayRosterSheet } from './day-roster-sheet';
import { MemberSheet } from './member-sheet';
import { MineView } from './mine-view';
import { MonthCalendar } from './month-calendar';
import { TabsHeader } from './tabs-header';
import { TeamView } from './team-view';
import { useGeoClockIn } from './use-geo-clock-in';

/**
 * The one account that keeps the two-tab layout. Everyone else with edit rights
 * gets the merged single view: their own month calendar on top, and tapping a
 * day shows the whole workshop's punches for it rather than only their own.
 */
const TWO_TAB_EMAIL = 'crrishav.business@gmail.com';

export function Attendance() {
  const theme = useTheme();
  // Money is formatted by plain functions (`@/lib/money`), so this is what
  // re-renders the screen when the currency preference or the rate changes.
  useMoneySignature();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { profile, can } = useAuth();
  const staffName = profile?.name ?? MY_NAME;
  const canEdit = can('attendance');
  // Admins see one merged view; the account above keeps "Mine" and "Team" split.
  const twoTabs = canEdit && (profile?.email ?? '').trim().toLowerCase() === TWO_TAB_EMAIL;
  const merged = canEdit && !twoTabs;

  const clockStatusQuery = useClockStatus();
  const { data: clockStatus } = clockStatusQuery;
  const toggleClock = useToggleClock();
  const geoClock = useGeoClockIn();
  const teamQuery = useTeamRoster();
  const { data: team } = teamQuery;
  const monthQuery = useMyMonth();
  const { data: month } = monthQuery;
  const setMemberStatus = useSetMemberStatus();
  // Stable for the session — the label only turns over at midnight in Kathmandu.
  const today = useMemo(() => todayLabel(), []);

  const [view, setView] = useState<AttendanceView>('mine');
  const scrollRef = useScrollTop(view);
  const [filter, setFilter] = useState<TeamFilter>('all');
  const [elapsed, setElapsed] = useState(0);
  const [rollEdit, setRollEdit] = useState(false);
  const [rollEdits, setRollEdits] = useState(0);
  const [reportMember, setReportMember] = useState<TeamMember | null>(null);
  /** The day tapped in either admin calendar — `YYYY-MM-DD`, null when closed. */
  const [rosterDay, setRosterDay] = useState<string | null>(null);

  const rosterQuery = useDayRoster(canEdit ? rosterDay : null);

  // Mine / Team is this route's own tab strip; roll-call edit mode is a state
  // the screen can be stuck in. Both unwind before back leaves Attendance.
  useBackHandler(() => {
    if (rollEdit) {
      setRollEdit(false);
      return true;
    }
    if (view !== 'mine') {
      setView('mine');
      return true;
    }
    return false;
  });

  // Re-seed from the server on first load and whenever the session changes — a
  // new clock-in, or a clock-out made on another device / the web. Done during
  // render, not from an effect, so the ticker never shows a stale second.
  const session = `${clockStatus?.clockedIn}|${clockStatus?.inTime}|${clockStatus?.outTime}`;
  const [seededFrom, setSeededFrom] = useState(session);
  if (seededFrom !== session) {
    setSeededFrom(session);
    if (clockStatus) setElapsed(clockStatus.elapsedSeconds);
  }

  useEffect(() => {
    if (!clockStatus?.clockedIn) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [clockStatus?.clockedIn]);

  // Both gates below wear the loaded screen's header; the subtitle is the one
  // part that has to wait, since it counts off the month that is still reading.
  const attendanceGateHeader = <ScreenHeader title="Attendance" rightSlot={<HeaderAccount />} />;

  if (isBlocked(clockStatusQuery, teamQuery) || !clockStatus || !team)
    return <ScreenGate queries={[clockStatusQuery, teamQuery]} header={attendanceGateHeader} />;
  // The month loads progressively (MineView draws its own spinner), but a
  // failure there would leave that spinner up for ever.
  if (hasFailed(monthQuery)) return <ScreenGate queries={[monthQuery]} header={attendanceGateHeader} />;

  const counts: Record<TeamFilter, number> = { all: team.length, present: 0, late: 0, absent: 0, half: 0, leave: 0, off: 0 };
  team.forEach((m) => {
    counts[m.status] += 1;
  });
  const filteredMembers = team.filter((m) => filter === 'all' || m.status === filter);

  // The team card's month figures, totalled from the same rows the rows show.
  const monthStats: TeamMonthStats = {
    lineLabel: `Month to date · ${currentMonthLabel()}`,
    teamHours: formatHours(team.reduce((sum, m) => sum + m.month.hoursMTDValue, 0)),
    attendanceCuts: team.reduce((sum, m) => sum + m.month.cutNPR, 0),
    // Salaries are masked for anyone below `employees` tier 2, so their
    // colleagues' cut days arrive priced at 0 — say so rather than total them in.
    unpricedCutDays: team.reduce((sum, m) => sum + (m.month.cutNPR === 0 ? m.month.cutDays : 0), 0),
  };

  // GPS geofenced clock-in (item 26) — take a fix, verify against WORK_SITE, then punch.
  const finishClockIn = async (coords: { lat: number; lng: number; accuracyM: number } | null) => {
    const next = await toggleClock.mutateAsync({ elapsedSeconds: elapsed, staffName, coords, bypassUsed: false });
    geoClock.reset();
    const p = next.lastPunch;
    if (p?.status === 'Late') {
      // Clocking in is done at the workshop door, often without looking at the
      // screen — and being late costs a quarter of the day. The buzz says which
      // of the two it was before you have read anything.
      haptics.warned();
      toast.show({
        message: `Clocked in · ${p.lateMinutes} min late${p.lateCutApplied ? ' · salary cut applied' : ''}`,
        tone: p.lateCutApplied ? 'warn' : 'ok',
      });
      return;
    }
    haptics.committed();
    // With no punch summary read back there is no grade to claim either way.
    toast.show({ message: p ? 'Clocked in · at the workshop, on time' : 'Clocked in · at the workshop', tone: 'ok' });
  };

  const handleToggleClock = async () => {
    if (clockStatus?.clockedIn) {
      await toggleClock.mutateAsync({ elapsedSeconds: elapsed, staffName, coords: null, bypassUsed: false });
      haptics.committed();
      geoClock.reset();
      return;
    }
    const res = await geoClock.locate();
    if (res.ok && res.coords) {
      await finishClockIn(res.coords);
      return;
    }
    // The clock card shows the blocked banner — clock-in needs a valid on-site
    // fix. Refused, not merely unfinished: you are standing there believing you
    // have clocked in.
    haptics.refused();
  };

  const handleRaiseCorrection = () => toast.show({ message: 'Correction request sent · HR reviews within 2 working days', tone: 'ok' });

  // Admin roll-call editor (item 27) — set a staffer's status for the day, with undo.
  const handleSetStatus = (id: number, status: AttendanceStatus) => {
    if (!canEdit) return;
    const target = team?.find((m) => m.id === id);
    if (!target || target.status === status) return;
    const prevStatus = target.status;
    // Marking a roll call is a rapid run of taps with your eyes on the list
    // rather than the row under your thumb.
    haptics.changed();
    setMemberStatus.mutate({ id, personId: target.staffId, name: target.name, status });
    setRollEdits((n) => n + 1);
    toast.show({
      message: `${target.name} · ${STATUS_LABELS[status]}`,
      tone: 'ok',
      action: {
        label: 'Undo',
        onPress: () => {
          // Re-apply the prior status — works against Postgres and the mock alike.
          setMemberStatus.mutate({ id, personId: target.staffId, name: target.name, status: prevStatus });
          setRollEdits((n) => Math.max(0, n - 1));
        },
      },
    });
  };

  const handleToggleEdit = () => {
    if (!canEdit) return;
    if (rollEdit) {
      if (rollEdits > 0) toast.show({ message: `Roll call saved · ${rollEdits} ${rollEdits === 1 ? 'change' : 'changes'} · ${today}`, tone: 'ok' });
      setRollEdits(0);
    }
    setRollEdit((v) => !v);
  };

  // Real CSV export (item 27) — the roll call, or one staffer's month, to the clipboard.
  const exportCsv = async (csv: string, label: string) => {
    await Clipboard.setStringAsync(csv);
    toast.show({ message: `${label} copied as CSV`, tone: 'ok' });
  };

  const handleExportRollCall = () => {
    if (!team) return;
    const csv = toCSV(team, [
      { header: 'Name', value: (m) => m.name },
      { header: 'Role', value: (m) => m.role },
      { header: 'Status', value: (m) => STATUS_LABELS[m.status] },
      { header: 'Times', value: (m) => m.times },
      { header: 'Hours', value: (m) => m.hours },
    ]);
    void exportCsv(csv, `Roll call · ${today}`);
  };


  /**
   * The same month calendar the "Mine" tab shows, but a tapped day opens the
   * whole workshop's punches (`DayRosterSheet`) instead of only the signed-in
   * person's — this is the only way either Team layout has to look at a day
   * other than today.
   */
  const monthCalendar = month ? (
    <MonthCalendar
      monthLabel={month.monthLabel}
      monthISOStart={month.monthISOStart}
      monthISOEnd={month.monthISOEnd}
      workingDays={month.workingDays}
      days={month.days}
      onSelectDay={setRosterDay}
    />
  ) : (
    <View style={styles.calendarPending}>
      <ActivityIndicator color={theme.accent} />
    </View>
  );

  /**
   * The merged single-tab layout's top block. The clock card follows the
   * calendar so an admin can still punch in — they have no separate "Mine"
   * tab to do it from. The two-tab account keeps that tab, so its own Team
   * header below is the calendar alone.
   */
  const workshopHeader = (
    <>
      {monthCalendar}

      {!isDirector(profile) ? (
        <ClockCard
          clockedIn={clockStatus.clockedIn}
          inTime={clockStatus.inTime}
          outTime={clockStatus.outTime}
          elapsedSeconds={elapsed}
          onToggle={handleToggleClock}
          geoState={geoClock.state}
          geo={geoClock.geo}
          lastPunch={clockStatus.lastPunch}
          onOpenSettings={geoClock.openSettings}
        />
      ) : null}
    </>
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Attendance"
        subtitle={month ? `${today} · ${month.shiftLabel}` : today}
        rightSlot={<HeaderAccount />}
      />
      {twoTabs ? <TabsHeader view={view} onChange={setView} /> : null}

      <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        {!canEdit || (twoTabs && view === 'mine') ? (
          <MineView
            clockedIn={clockStatus.clockedIn}
            inTime={clockStatus.inTime}
            outTime={clockStatus.outTime}
            elapsedSeconds={elapsed}
            onToggleClock={handleToggleClock}
            onRaiseCorrection={handleRaiseCorrection}
            geoState={geoClock.state}
            geo={geoClock.geo}
            lastPunch={clockStatus.lastPunch}
            onOpenSettings={geoClock.openSettings}
            month={month}
          />
        ) : (
          <TeamView
            filter={filter}
            onFilterChange={setFilter}
            counts={counts}
            members={filteredMembers}
            editMode={rollEdit}
            edits={rollEdits}
            onToggleEdit={handleToggleEdit}
            onSetStatus={handleSetStatus}
            onOpenReport={setReportMember}
            onExportPayroll={handleExportRollCall}
            monthStats={monthStats}
            header={merged ? workshopHeader : twoTabs ? monthCalendar : undefined}
          />
        )}
      </ScrollView>

      <DayRosterSheet
        visible={rosterDay !== null}
        label={rosterDay ? dayLabelOf(rosterDay) : 'Day'}
        entries={rosterQuery.data}
        loading={rosterQuery.isPending || rosterQuery.isFetching}
        onClose={() => setRosterDay(null)}
      />

      <MemberSheet
        visible={reportMember !== null}
        member={reportMember}
        canEdit={canEdit}
        onClose={() => setReportMember(null)}
        onExport={(csv, label) => void exportCsv(csv, label)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Attendance pushes as a sibling of (tabs) — the tab bar is hidden, so the
  // bottom pad is just the safe-area inset (applied inline), not room for a bar.
  content: { padding: 20, paddingTop: 4, gap: 16 },
  calendarPending: { paddingVertical: 48, alignItems: 'center' },
});
