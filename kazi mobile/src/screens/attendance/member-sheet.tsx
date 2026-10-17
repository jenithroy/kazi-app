import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { TextField } from '@/components/ui/text-field';
import { ErrorState } from '@/components/ui/error-state';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { STATUS_LABELS, STATUS_RAMP } from '@/data/attendance/mock';
import { useMemberMonth, useSaveDayStatus, useSaveSchedule } from '@/data/attendance/hooks';
import {
  DAY_NAMES,
  formatHours,
  monthLabelOf,
  nepalToday,
  shiftDate,
  shiftMonth,
} from '@/data/attendance/live-shared';
import type { AttendanceStatus, TeamMember } from '@/data/attendance/types';

import { DayDetailBody } from './day-detail';

const STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'half', 'leave'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface MemberSheetProps {
  visible: boolean;
  member: TeamMember | null;
  /** `can('attendance')` — gates the status and schedule editors. */
  canEdit: boolean;
  onClose: () => void;
  /** Hands a finished CSV back to the screen, which owns the clipboard + toast. */
  onExport: (csv: string, label: string) => void;
}

/** ‹ label › stepper used for both the month and the day. */
function Stepper({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.stepper, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Pressable onPress={onPrev} hitSlop={8} style={styles.stepperButton}>
        <Icon name="chevron-left" size={18} color={theme.textPrimary} />
      </Pressable>
      <Text style={[styles.stepperLabel, { color: theme.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
      <Pressable onPress={onNext} hitSlop={8} style={styles.stepperButton}>
        <Icon name="chevron-right" size={18} color={theme.textPrimary} />
      </Pressable>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  const theme = useTheme();
  return <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{children}</Text>;
}

/**
 * Admin view of one staffer (Team tab → tap a name): step through their month
 * day by day to see the real clock-in / clock-out, correct the day's status
 * (including the reference app's 25% late cut), and edit the work schedule that
 * every late-calculation and overtime figure is measured against.
 */
export function MemberSheet({ visible, member, canEdit, onClose, onExport }: MemberSheetProps) {
  const theme = useTheme();
  const ramp = STATUS_RAMP[theme.scheme];
  const today = nepalToday();

  const [monthISO, setMonthISO] = useState(() => today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);

  const { data: report, isFetching, isError, error, refetch } = useMemberMonth(
    member?.staffId ? { staffId: member.staffId, name: member.name, monthISO } : null,
  );
  const saveStatus = useSaveDayStatus();
  const saveSchedule = useSaveSchedule();

  // Each time the sheet opens it starts fresh on today, whoever it's for. The
  // re-seed happens during render rather than in an effect so the first paint
  // is already on the right day instead of flashing the previous staffer's.
  const openedFor = visible ? `open:${member?.staffId ?? ''}` : 'closed';
  const [seededFor, setSeededFor] = useState(openedFor);
  if (seededFor !== openedFor) {
    setSeededFor(openedFor);
    if (visible) {
      const now = nepalToday();
      setMonthISO(now.slice(0, 7));
      setSelectedDate(now);
    }
  }

  const day = report?.days.find((d) => d.date === selectedDate) ?? null;

  // --- status draft -------------------------------------------------------
  const [draftStatus, setDraftStatus] = useState<AttendanceStatus | null>(null);
  const [draftCut, setDraftCut] = useState(false);
  const dayKey = `${day?.date}|${day?.status}|${day?.lateCutApplied}`;
  const [seededDay, setSeededDay] = useState(dayKey);
  if (seededDay !== dayKey) {
    setSeededDay(dayKey);
    setDraftStatus(day?.status ?? null);
    setDraftCut(day?.lateCutApplied ?? false);
  }

  const statusDirty = day != null && (draftStatus !== day.status || draftCut !== day.lateCutApplied);

  // --- schedule draft -----------------------------------------------------
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [workingDays, setWorkingDays] = useState<string[]>([]);
  // Keyed on the schedule's values, not on the report object: a refetch that
  // returns the same schedule must not throw away what's being typed.
  const scheduleKey = report ? `${report.schedule.start}|${report.schedule.end}|${report.schedule.workingDays.join()}` : '';
  const [seededSchedule, setSeededSchedule] = useState(scheduleKey);
  if (seededSchedule !== scheduleKey) {
    setSeededSchedule(scheduleKey);
    if (report) {
      setStart(report.schedule.start);
      setEnd(report.schedule.end);
      setWorkingDays(report.schedule.workingDays);
    }
  }

  const timesValid = TIME_PATTERN.test(start) && TIME_PATTERN.test(end);
  const scheduleDirty =
    !!report &&
    (start !== report.schedule.start ||
      end !== report.schedule.end ||
      workingDays.join() !== report.schedule.workingDays.join());

  function stepDay(delta: number) {
    const next = shiftDate(selectedDate, delta);
    // Stepping off either end of the month carries into the neighbouring one,
    // which re-runs the month read.
    if (next.slice(0, 7) !== monthISO) setMonthISO(next.slice(0, 7));
    setSelectedDate(next);
  }

  function stepMonth(delta: number) {
    const next = shiftMonth(monthISO, delta);
    setMonthISO(next);
    setSelectedDate(next === today.slice(0, 7) ? today : `${next}-01`);
  }

  function handleSaveStatus() {
    if (!member || !day || !draftStatus) return;
    saveStatus.mutate({
      staffId: member.staffId,
      staffName: member.name,
      role: member.role,
      date: day.date,
      status: draftStatus,
      lateCutApplied: draftStatus === 'late' && draftCut,
      lateMinutes: day.lateMinutes,
    });
  }

  function handleSaveSchedule() {
    if (!member?.employeeDocId || !timesValid) return;
    saveSchedule.mutate({
      employeeDocId: member.employeeDocId,
      schedule: { start, end, workingDays: workingDays.length ? workingDays : DAY_NAMES.slice(0, 6) },
    });
  }

  function handleExport() {
    if (!report || !member) return;
    const header = 'Date,Status,Clock in,Clock out,Hours worked,Schedule,Late minutes,25% cut,Note';
    const rows = report.days.map((d) =>
      [
        d.date,
        d.status ? STATUS_LABELS[d.status] : '',
        d.clockIn ?? '',
        d.clockOut ?? '',
        d.workedHours != null ? d.workedHours.toFixed(2) : '',
        d.shiftLabel ?? 'Weekly off',
        d.lateMinutes || '',
        d.lateCutApplied ? 'Yes' : '',
        d.note.replace(/"/g, '""'),
      ]
        .map((v) => `"${v}"`)
        .join(','),
    );
    onExport([header, ...rows].join('\n'), `${member.name} · ${report.monthLabel}`);
  }

  const canEditDay = canEdit && !!member?.staffId;
  const canEditSchedule = canEdit && !!member?.employeeDocId;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={member?.name ?? 'Employee'} maxHeight={680}>
      {member ? (
        <View style={styles.wrap}>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{member.role}</Text>

          <Stepper label={monthLabelOf(monthISO)} onPrev={() => stepMonth(-1)} onNext={() => stepMonth(1)} />

          {report ? (
            <View style={styles.tallyRow}>
              {STATUSES.map((s) => (
                <View key={s} style={[styles.tally, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={[styles.tallyDot, { backgroundColor: ramp[s].dot }]} />
                  <Text style={[styles.tallyValue, tabularNums, { color: theme.textPrimary }]}>{report.tally[s]}</Text>
                  <Text style={[styles.tallyLabel, { color: theme.textSecondary }]}>{STATUS_LABELS[s]}</Text>
                </View>
              ))}
              <View style={[styles.tally, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.tallyDot, { backgroundColor: theme.dangerWashText }]} />
                <Text style={[styles.tallyValue, tabularNums, { color: theme.textPrimary }]}>{report.cuts}</Text>
                <Text style={[styles.tallyLabel, { color: theme.textSecondary }]}>25% cuts</Text>
              </View>
              <View style={[styles.tally, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.tallyDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.tallyValue, tabularNums, { color: theme.textPrimary }]}>
                  {formatHours(report.hoursWorked)}
                </Text>
                <Text style={[styles.tallyLabel, { color: theme.textSecondary }]}>On clock</Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <SectionTitle>Day</SectionTitle>
          <Stepper label={day?.label ?? selectedDate} onPrev={() => stepDay(-1)} onNext={() => stepDay(1)} />

          {isFetching && !report ? (
            <View style={styles.pending}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : isError ? (
            // Without this the fall-through below claims "No record for this
            // date", which is a statement about the month — not something we
            // are entitled to make when the month never loaded.
            <ErrorState error={error} onRetry={refetch} retrying={isFetching} />
          ) : day ? (
            <DayDetailBody detail={day} />
          ) : (
            <Text style={[styles.empty, { color: theme.textSecondary }]}>No record for this date.</Text>
          )}

          {canEditDay && day ? (
            <>
              <SectionTitle>Set status</SectionTitle>
              <View style={styles.chipRow}>
                {STATUSES.map((s) => {
                  const on = draftStatus === s;
                  const tone = ramp[s];
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setDraftStatus(s)}
                      style={[
                        styles.chip,
                        { backgroundColor: on ? tone.chipBg : 'transparent', borderColor: on ? tone.dot : theme.border },
                      ]}
                    >
                      <Text style={[styles.chipLabel, { color: on ? tone.chipFg : theme.textSecondary }]}>
                        {STATUS_LABELS[s]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {draftStatus === 'late' ? (
                <View style={[styles.cutRow, { backgroundColor: theme.dangerWash }]}>
                  <View style={styles.cutText}>
                    <Text style={[styles.cutLabel, { color: theme.dangerWashText }]}>25% salary cut</Text>
                    <Text style={[styles.cutNote, { color: theme.dangerWashText }]}>
                      Applied when they clock in 15+ minutes after their shift starts.
                    </Text>
                  </View>
                  <Switch value={draftCut} onValueChange={() => setDraftCut((v) => !v)} />
                </View>
              ) : null}

              <Button
                label={saveStatus.isPending ? 'Saving…' : `Save ${day.label}`}
                onPress={handleSaveStatus}
                disabled={!statusDirty || !draftStatus || saveStatus.isPending}
                fullWidth
              />
            </>
          ) : null}

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <SectionTitle>Work schedule</SectionTitle>
          {canEditSchedule ? (
            <>
              <View style={styles.timeRow}>
                <View style={styles.timeField}>
                  <TextField label="Starts" value={start} onChangeText={setStart} placeholder="09:00" compact />
                </View>
                <View style={styles.timeField}>
                  <TextField label="Ends" value={end} onChangeText={setEnd} placeholder="17:00" compact />
                </View>
              </View>
              {!timesValid ? (
                <Text style={[styles.warn, { color: theme.dangerWashText }]}>Use 24-hour HH:MM, e.g. 09:30.</Text>
              ) : null}

              <View style={styles.chipRow}>
                {DAY_NAMES.map((d) => {
                  const on = workingDays.includes(d);
                  return (
                    <Pressable
                      key={d}
                      // Rebuilt from DAY_NAMES so the saved array stays Sun→Sat.
                      onPress={() =>
                        setWorkingDays((cur) => DAY_NAMES.filter((n) => (n === d ? !cur.includes(d) : cur.includes(n))))
                      }
                      style={[
                        styles.chip,
                        { backgroundColor: on ? theme.accentWash : 'transparent', borderColor: on ? theme.accent : theme.border },
                      ]}
                    >
                      <Text style={[styles.chipLabel, { color: on ? theme.accentWashText : theme.textSecondary }]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                Unselected days are weekly offs — they&apos;re excluded from working days and rostered hours.
              </Text>

              <Button
                label={saveSchedule.isPending ? 'Saving…' : 'Save schedule'}
                variant="secondary"
                onPress={handleSaveSchedule}
                disabled={!scheduleDirty || !timesValid || saveSchedule.isPending}
                fullWidth
              />
            </>
          ) : (
            <Text style={[styles.empty, { color: theme.textSecondary }]}>
              {report ? `${report.schedule.start}–${report.schedule.end} · ${report.schedule.workingDays.join(' ')}` : '—'}
              {canEdit && !member.employeeDocId ? '\nNo Employee Directory entry, so the schedule can’t be edited here.' : ''}
            </Text>
          )}

          <Button label="Export month (CSV)" variant="secondary" onPress={handleExport} disabled={!report} fullWidth />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  subtitle: { fontFamily: fontFamily.mono, fontSize: 10.5, marginTop: -12 },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 6 },
  stepperButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepperLabel: { flex: 1, textAlign: 'center', fontFamily: fontFamily.semibold, fontSize: 14 },
  tallyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tally: { minWidth: 78, flexGrow: 1, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9, gap: 3 },
  tallyDot: { width: 6, height: 6, borderRadius: 99 },
  tallyValue: { fontFamily: fontFamily.semibold, fontSize: 16 },
  tallyLabel: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.08 * 9, textTransform: 'uppercase' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  sectionTitle: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  pending: { paddingVertical: 28, alignItems: 'center' },
  empty: { fontSize: 13, lineHeight: 19 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 32, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12 },
  cutRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12 },
  cutText: { flex: 1, gap: 2 },
  cutLabel: { fontSize: 13.5, fontWeight: '600' },
  cutNote: { fontSize: 11.5, opacity: 0.85, lineHeight: 16 },
  timeRow: { flexDirection: 'row', gap: 10 },
  timeField: { flex: 1 },
  warn: { fontSize: 11.5, marginTop: -4 },
  hint: { fontFamily: fontFamily.mono, fontSize: 9.5, lineHeight: 14 },
});
