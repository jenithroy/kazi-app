import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { SEVERITY_META, SEVERITY_ORDER, STATUS_META, STATUS_ORDER } from '@/data/bug-reports/mock';
import type { BugReport, SeverityFilter, StatusFilter } from '@/data/bug-reports/types';

export interface FilterBarProps {
  reports: BugReport[];
  status: StatusFilter;
  severity: SeverityFilter;
  onStatusChange: (s: StatusFilter) => void;
  onSeverityChange: (s: SeverityFilter) => void;
}

export function FilterBar({ reports, status, severity, onStatusChange, onSeverityChange }: FilterBarProps) {
  const theme = useTheme();

  const statusChips: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: reports.length },
    ...STATUS_ORDER.map((s) => ({ id: s as StatusFilter, label: STATUS_META[s].label, count: reports.filter((r) => r.status === s).length })),
  ];

  const sevPills: { id: SeverityFilter; label: string; dot?: string }[] = [
    { id: 'all', label: 'Any severity' },
    ...SEVERITY_ORDER.map((s) => ({ id: s as SeverityFilter, label: SEVERITY_META[s].label, dot: SEVERITY_META[s].dot })),
  ];

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {statusChips.map((c) => {
          const on = status === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => onStatusChange(c.id)}
              style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
            >
              <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{c.label}</Text>
              <Text style={[styles.chipCount, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{c.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {sevPills.map((p) => {
          const on = severity === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => onSeverityChange(p.id)}
              style={[styles.pill, { backgroundColor: on ? theme.accentWash : theme.surface, borderColor: on ? theme.accentWash : theme.border }]}
            >
              {p.dot ? <View style={[styles.pillDot, { backgroundColor: p.dot }]} /> : null}
              <Text style={[styles.pillLabel, { color: on ? theme.accentWashText : theme.textSecondary }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { gap: 7, paddingTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  chipCount: { fontFamily: fontFamily.mono, fontSize: 10.5, opacity: 0.85 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  pillDot: { width: 6, height: 6, borderRadius: 99 },
  pillLabel: { fontFamily: fontFamily.medium, fontSize: 12 },
});
