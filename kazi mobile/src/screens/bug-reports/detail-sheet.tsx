import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { StatusPill } from '@/components/ui/status-pill';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { NEXT_STATUS, SEVERITY_META, STATUS_META } from '@/data/bug-reports/mock';
import type { BugReport } from '@/data/bug-reports/types';

export interface DetailSheetProps {
  report: BugReport | null;
  canEdit: boolean;
  onClose: () => void;
  onAdvance: () => void;
  onReopen: () => void;
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function DetailSheet({ report, canEdit, onClose, onAdvance, onReopen }: DetailSheetProps) {
  const theme = useTheme();
  if (!report) return null;

  const sev = SEVERITY_META[report.severity];
  const status = STATUS_META[report.status];
  const next = NEXT_STATUS[report.status];

  const facts = [
    { label: 'Reference', value: report.ref },
    { label: 'Area', value: report.area },
    { label: 'Severity', value: sev.label },
    { label: 'Reported by', value: report.reportedBy },
    { label: 'Logged', value: fullDate(report.createdAt) },
    { label: 'Screenshot', value: report.screenshot ? 'Attached' : 'None' },
  ];

  return (
    <BottomSheet visible={!!report} onClose={onClose} title={report.ref}>
      <View style={styles.headRow}>
        <View style={[styles.sevDot, { backgroundColor: sev.dot }]} />
        <Text style={[styles.title, { color: theme.textPrimary }]}>{report.title}</Text>
      </View>
      <StatusPill status={status.pill} label={status.label} />

      <View style={styles.factsGrid}>
        {facts.map((f) => (
          <View key={f.label} style={[styles.factCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.factLabel, { color: theme.textSecondary }]}>{f.label}</Text>
            <Text style={[styles.factValue, tabularNums, { color: theme.textPrimary }]}>{f.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.group}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Steps to reproduce</Text>
        <Text style={[styles.steps, { color: theme.textPrimary }]}>{report.steps || '—'}</Text>
      </View>

      {canEdit ? (
        <View style={styles.footer}>
          {next ? (
            <Button label={`Mark ${STATUS_META[next].label.toLowerCase()}`} onPress={onAdvance} fullWidth style={styles.action} />
          ) : (
            <View style={[styles.closedNote, { backgroundColor: theme.draftWash }]}>
              <Icon name="check-circle" size={14} color={theme.textSecondary} />
              <Text style={[styles.closedText, { color: theme.textSecondary }]}>This report is closed.</Text>
            </View>
          )}
          {report.status !== 'open' ? <Button label="Reopen" variant="secondary" onPress={onReopen} fullWidth /> : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sevDot: { width: 10, height: 10, borderRadius: 99, marginTop: 5, flexShrink: 0 },
  title: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 16 * 1.35 },
  factsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  factCard: { width: '47%', flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: 12, gap: 5 },
  factLabel: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.11 * 9, textTransform: 'uppercase' },
  factValue: { fontSize: 13.5, fontWeight: '600' },
  group: { gap: 8 },
  sectionLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.14 * 10, textTransform: 'uppercase' },
  steps: { fontSize: 14, lineHeight: 14 * 1.5 },
  footer: { gap: 10, paddingTop: 4 },
  action: { height: 52 },
  closedNote: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  closedText: { fontFamily: fontFamily.medium, fontSize: 12.5 },
});
