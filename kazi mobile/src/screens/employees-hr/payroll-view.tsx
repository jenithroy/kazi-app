import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { StatusPill, type StatusKind } from '@/components/ui/status-pill';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { MonthKey } from '@/data/employees-hr/types';

import { RecordRow, type RecordRowModel } from './record-row';

export interface MonthChipModel {
  key: MonthKey;
  label: string;
  state: string;
}

export type RunPillState = 'draft' | 'approved' | 'paid';

const RUN_PILL_KIND: Record<RunPillState, StatusKind> = { draft: 'at-risk', approved: 'on-track', paid: 'on-track' };
const RUN_PILL_LABEL: Record<RunPillState, string> = { draft: 'Draft', approved: 'Approved', paid: 'Paid' };

export interface PayrollViewProps {
  months: MonthChipModel[];
  activeMonth: MonthKey;
  onMonthChange: (key: MonthKey) => void;
  runTitle: string;
  runPillState: RunPillState;
  runGross: string;
  runDeductions: string;
  runNet: string;
  runMeta: string;
  runOpen: boolean;
  approveLabel: string;
  onApprove: () => void;
  onExportBankFile: () => void;
  recordCount: string;
  records: RecordRowModel[];
  onOpenSlip: (id: number) => void;
  employerNote: string;
}

export function PayrollView({
  months,
  activeMonth,
  onMonthChange,
  runTitle,
  runPillState,
  runGross,
  runDeductions,
  runNet,
  runMeta,
  runOpen,
  approveLabel,
  onApprove,
  onExportBankFile,
  recordCount,
  records,
  onOpenSlip,
  employerNote,
}: PayrollViewProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthRow}>
        {months.map((m) => {
          const on = m.key === activeMonth;
          return (
            <Pressable
              key={m.key}
              onPress={() => onMonthChange(m.key)}
              style={[styles.monthChip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
            >
              <Text style={[styles.monthLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{m.label}</Text>
              <Text style={[styles.monthState, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{m.state}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.runCard, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
        <View style={styles.runHeader}>
          <Text style={[styles.runTitle, { color: theme.textPrimary }]}>{runTitle}</Text>
          <StatusPill status={RUN_PILL_KIND[runPillState]} label={RUN_PILL_LABEL[runPillState]} />
        </View>

        <View style={styles.runFigures}>
          <View style={styles.runRow}>
            <Text style={[styles.runLabel, { color: theme.textPrimary }]}>Gross earnings</Text>
            <Text style={[styles.runValue, tabularNums, { color: theme.textPrimary }]}>{runGross}</Text>
          </View>
          <View style={styles.runRow}>
            <Text style={[styles.runLabel, { color: theme.textPrimary }]}>Deductions · SSF, advance, attendance</Text>
            <Text style={[styles.runValue, tabularNums, { color: theme.dangerWashText }]}>{runDeductions}</Text>
          </View>
          <View style={[styles.netRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.netLabel, { color: theme.textPrimary }]}>Net payable</Text>
            <Text style={[styles.netValue, tabularNums, { color: theme.textPrimary }]}>{runNet}</Text>
          </View>
        </View>

        <Text style={[styles.runMeta, tabularNums, { color: theme.textSecondary }]}>{runMeta}</Text>

        {runOpen ? (
          <Pressable onPress={onApprove} style={[styles.approveButton, { backgroundColor: theme.accent }]}>
            <Text style={[styles.approveLabel, { color: theme.accentText }]}>{approveLabel}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onExportBankFile} style={[styles.exportButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.exportLabel, { color: theme.textPrimary }]}>Export bank transfer file</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.recordsHeader}>
        <Text style={[styles.recordsLabel, { color: theme.textSecondary }]}>Records · {recordCount}</Text>
        <Text style={[styles.recordsLabel, { color: theme.textSecondary, opacity: 0.75 }]}>Net pay</Text>
      </View>

      <View style={styles.recordsGroup}>
        {records.map((r, i) => (
          <RecordRow key={r.id} record={r} index={i} onOpenSlip={() => onOpenSlip(r.id)} />
        ))}
      </View>

      <View style={[styles.ssfNote, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
        <Text style={[styles.ssfTitle, { color: theme.textPrimary }]}>Employer SSF contribution</Text>
        <Text style={[styles.ssfBody, tabularNums, { color: theme.textSecondary }]}>{employerNote}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  monthRow: { gap: 7 },
  monthChip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  monthLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  monthState: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.1 * 9.5, textTransform: 'uppercase', opacity: 0.9 },

  runCard: { borderRadius: 20, padding: 18, gap: 14 },
  runHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  runTitle: { fontSize: 15, fontWeight: '600' },
  runFigures: { gap: 9 },
  runRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  runLabel: { flex: 1, fontSize: 13.5 },
  runValue: { fontFamily: fontFamily.mono, fontSize: 13 },
  netRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  netLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  netValue: { fontSize: 17, fontWeight: '600', letterSpacing: -0.02 * 17 },
  runMeta: { fontFamily: fontFamily.mono, fontSize: 10.5, lineHeight: 10.5 * 1.4 },
  approveButton: { height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  approveLabel: { fontSize: 15, fontWeight: '600' },
  exportButton: { height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  exportLabel: { fontSize: 14, fontWeight: '600' },

  recordsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 4 },
  recordsLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  recordsGroup: { gap: 8 },

  ssfNote: { borderRadius: 16, borderWidth: 1, padding: 15, gap: 6 },
  ssfTitle: { fontSize: 13, fontWeight: '600' },
  ssfBody: { fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 11 * 1.6 },
});
