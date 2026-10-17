import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { RiseIn } from '@/components/ui/rise-in';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { todayLabel , npr } from '@/data/attendance/utils';

import type { AttendanceStatus, TeamFilter, TeamMember, TeamMonthStats } from '@/data/attendance/types';

import { RollCall } from './roll-call';
import { TeamRow } from './team-row';

export interface TeamViewProps {
  filter: TeamFilter;
  onFilterChange: (f: TeamFilter) => void;
  counts: Record<TeamFilter, number>;
  members: TeamMember[];
  editMode: boolean;
  edits: number;
  onToggleEdit: () => void;
  onSetStatus: (id: number, status: AttendanceStatus) => void;
  onOpenReport: (member: TeamMember) => void;
  onExportPayroll: () => void;
  /** Month-to-date figures for the whole roster, derived from the same rows. */
  monthStats: TeamMonthStats;
  /**
   * Rendered above the roll call, inside the same rise-in. Used by the merged
   * single-tab layout to put the month calendar at the top of this view rather
   * than animating it separately.
   */
  header?: ReactNode;
}

export function TeamView({
  filter,
  onFilterChange,
  counts,
  members,
  editMode,
  edits,
  onToggleEdit,
  onSetStatus,
  onOpenReport,
  onExportPayroll,
  monthStats,
  header,
}: TeamViewProps) {
  const theme = useTheme();

  return (
    <RiseIn viewKey="team">
      <View style={styles.wrap}>
        {header}

        <RollCall filter={filter} onFilterChange={onFilterChange} counts={counts} />

        <Pressable
          onPress={onToggleEdit}
          style={[styles.editToggle, { backgroundColor: editMode ? theme.accentWash : theme.surface, borderColor: editMode ? theme.accent : theme.border }]}
        >
          <Icon name={editMode ? 'check' : 'edit-2'} size={14} color={editMode ? theme.accentWashText : theme.textPrimary} />
          <Text style={[styles.editToggleLabel, { color: editMode ? theme.accentWashText : theme.textPrimary }]}>
            {editMode ? `Done${edits ? ` · ${edits} updated` : ''}` : `Edit roll call · ${todayLabel()}`}
          </Text>
        </Pressable>

        <View style={styles.rowsWrap}>
          {members.map((m, i) => (
            <TeamRow
              key={m.id}
              member={m}
              index={i}
              editable={editMode}
              onSetStatus={(s) => onSetStatus(m.id, s)}
              onOpenReport={() => onOpenReport(m)}
            />
          ))}
        </View>

        <View style={[styles.monthCard, { backgroundColor: theme.surfaceHero, borderColor: theme.surfaceHeroBorder, borderWidth: theme.scheme === 'dark' ? 1 : 0, boxShadow: theme.shadows.raised }]}>
          <Text style={[styles.monthTitle, { color: theme.onHero.text }]}>{monthStats.lineLabel}</Text>
          <View style={styles.monthGrid}>
            <View style={styles.gap4}>
              <Text style={[styles.monthValue, tabularNums, { color: theme.onHero.text }]}>{monthStats.teamHours}</Text>
              <Text style={[styles.monthCaption, { color: theme.onHero.textMuted }]}>Team hours</Text>
            </View>
            <View style={styles.gap4}>
              {monthStats.attendanceCuts > 0 || monthStats.unpricedCutDays === 0 ? (
                <Text style={[styles.monthValue, tabularNums, { color: theme.onHero.dangerWashText }]}>{npr(monthStats.attendanceCuts)}</Text>
              ) : (
                <Text style={[styles.monthPending, { color: theme.onHero.dangerWashText }]}>Amount pending</Text>
              )}
              <Text style={[styles.monthCaption, { color: theme.onHero.textMuted }]}>
                {monthStats.unpricedCutDays > 0
                  ? `Attendance cuts · ${monthStats.unpricedCutDays} cut ${monthStats.unpricedCutDays === 1 ? 'day' : 'days'} not priced for you`
                  : 'Attendance cuts'}
              </Text>
            </View>
          </View>
          <Pressable onPress={onExportPayroll} style={[styles.exportButton, { borderColor: theme.onHero.divider }]}>
            <Text style={[styles.exportLabel, { color: theme.onHero.text }]}>Export roll call (CSV)</Text>
          </Pressable>
        </View>
      </View>
    </RiseIn>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  editToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 13, borderWidth: 1 },
  editToggleLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  rowsWrap: { gap: 9 },
  monthCard: { borderRadius: 20, padding: 18, gap: 14 },
  monthTitle: { fontFamily: fontFamily.semibold, fontSize: 15 },
  monthGrid: { flexDirection: 'row', gap: 14 },
  gap4: { gap: 4, flex: 1 },
  monthValue: { fontSize: 24, fontWeight: '600', letterSpacing: -0.02 * 24 },
  monthPending: { fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 24 },
  monthCaption: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  exportButton: { height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  exportLabel: { fontFamily: fontFamily.semibold, fontSize: 14 },
});
