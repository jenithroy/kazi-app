import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { MySummary } from '@/data/attendance/types';
import { npr } from '@/data/attendance/utils';

export interface MonthlySummaryProps {
  summary: MySummary;
  onRaiseCorrection: () => void;
}

export function MonthlySummary({ summary, onRaiseCorrection }: MonthlySummaryProps) {
  const theme = useTheme();
  // From December 2026 (`work-rules.ts`): lateness is counted in minutes and costs nothing, and every seven unapproved absences cost a
  // day of salary. Before it, the old allowance of late marks and the quarter-day cut.
  const memo = summary.rules === 'new';
  const perDay = summary.absencesPerDay ?? 7;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Monthly summary</Text>

      <View style={styles.statsGrid}>
        <View style={styles.gap4}>
          <Text style={[styles.statValue, tabularNums, { color: theme.textPrimary }]}>{summary.hoursWorked}</Text>
          <Text style={[styles.statCaption, { color: theme.textSecondary }]}>Hours worked</Text>
          {summary.openPunchDays > 0 ? (
            <Text style={[styles.statCaveat, { color: theme.warningWashText }]}>
              {summary.openPunchDays} {summary.openPunchDays === 1 ? 'day' : 'days'} never clocked out · not counted
            </Text>
          ) : null}
        </View>
        <View style={styles.gap4}>
          <Text style={[styles.statValue, tabularNums, { color: theme.accentDeep }]}>{summary.overtime}</Text>
          <Text style={[styles.statCaption, { color: theme.textSecondary }]}>Overtime</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.draftWash }]} />

      <View style={styles.rowsWrap}>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{memo ? 'Late' : 'Late marks'}</Text>
          <View style={styles.rowValueGroup}>
            <Text style={[styles.rowValue, tabularNums, { color: theme.textPrimary }]}>{summary.lateMarks}</Text>
            <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
              {memo ? `${summary.lateMinutes ?? 0} min in all` : `of ${summary.lateAllowed} allowed`}
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{memo ? `Absences · ${perDay} cost a day` : 'Absent · unpaid'}</Text>
          <Text style={[styles.rowValue, tabularNums, { color: theme.textPrimary }]}>
            {memo ? `${summary.absentDays} of ${perDay}` : `${summary.absentDays} day${summary.absentDays === 1 ? '' : 's'}`}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Paid leave taken</Text>
          <Text style={[styles.rowValue, tabularNums, { color: theme.textPrimary }]}>{summary.leaveTaken} of {summary.leaveAllowed}</Text>
        </View>
      </View>

      {/* Shown only when a cut was actually applied (late days flagged under the old rule, or a day of salary the absences have cost).
          One with no basic salary on file still shows — with the days, not a fabricated amount. */}
      {summary.deductionDays > 0 ? (
        <View style={[styles.deductionCard, { backgroundColor: theme.dangerWash }]}>
          <View style={styles.gap3}>
            <Text style={[styles.deductionLabel, { color: theme.dangerWashText }]}>Salary deduction</Text>
            {summary.deductionNote ? (
              <Text style={[styles.deductionNote, { color: theme.dangerWashText }]}>{summary.deductionNote}</Text>
            ) : null}
          </View>
          {summary.deduction > 0 ? (
            <Text style={[styles.deductionValue, tabularNums, { color: theme.dangerWashText }]}>
              − {npr(summary.deduction)}
            </Text>
          ) : (
            <Text style={[styles.deductionPending, { color: theme.dangerWashText }]}>Amount pending</Text>
          )}
        </View>
      ) : null}

      <Pressable onPress={onRaiseCorrection} style={[styles.correctionButton, { borderColor: theme.border }]}>
        <Text style={[styles.correctionLabel, { color: theme.textPrimary }]}>Raise a correction request</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, gap: 14 },
  title: { fontFamily: fontFamily.semibold, fontSize: 15 },
  statsGrid: { flexDirection: 'row', gap: 12 },
  gap4: { gap: 4, flex: 1 },
  gap3: { gap: 3 },
  statValue: { fontSize: 24, fontWeight: '600', letterSpacing: -0.02 * 24 },
  statCaption: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  statCaveat: { fontFamily: fontFamily.mono, fontSize: 10, lineHeight: 10 * 1.4 },
  divider: { height: 1 },
  rowsWrap: { gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 14 },
  rowValueGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 14, fontWeight: '600' },
  rowMeta: { fontFamily: fontFamily.mono, fontSize: 11 },
  deductionCard: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  deductionLabel: { fontSize: 13.5, fontWeight: '600' },
  deductionNote: { fontSize: 11.5, opacity: 0.85 },
  deductionValue: { fontSize: 18, fontWeight: '600' },
  deductionPending: { fontFamily: fontFamily.mono, fontSize: 10.5, textAlign: 'right', lineHeight: 14 },
  correctionButton: { height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  correctionLabel: { fontFamily: fontFamily.semibold, fontSize: 14 },
});
