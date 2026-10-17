import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SegmentedProportionBar } from '@/components/ui/segmented-proportion-bar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { STATUS_LABELS, STATUS_RAMP } from '@/data/attendance/mock';
import { todayLabel } from '@/data/attendance/utils';
import type { AttendanceStatus, TeamFilter } from '@/data/attendance/types';

const STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'half', 'leave'];

export interface RollCallProps {
  filter: TeamFilter;
  onFilterChange: (f: TeamFilter) => void;
  counts: Record<TeamFilter, number>;
}

export function RollCall({ filter, onFilterChange, counts }: RollCallProps) {
  const theme = useTheme();
  const ramp = STATUS_RAMP[theme.scheme];

  // "Off" only earns a chip on a day somebody is actually off — on an ordinary
  // working day it would just be a permanent zero.
  const statuses: AttendanceStatus[] = counts.off > 0 || filter === 'off' ? [...STATUSES, 'off'] : STATUSES;
  const filters: { id: TeamFilter; label: string }[] = [{ id: 'all', label: 'All' }, ...statuses.map((s) => ({ id: s, label: STATUS_LABELS[s] }))];

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Roll call · {todayLabel()}</Text>
        <Text style={[styles.onRoll, tabularNums, { color: theme.textSecondary }]}>{counts.all} on roll</Text>
      </View>

      <SegmentedProportionBar
        height={8}
        segments={statuses.map((s) => ({ weight: counts[s], color: ramp[s].dot }))}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {filters.map((f) => {
          const on = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => onFilterChange(f.id)}
              style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
            >
              <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{f.label}</Text>
              <Text style={[styles.chipCount, tabularNums, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{counts[f.id]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontFamily: fontFamily.semibold, fontSize: 15 },
  onRoll: { fontFamily: fontFamily.mono, fontSize: 11 },
  chipsRow: { gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 32, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  chipCount: { fontFamily: fontFamily.mono, fontSize: 10.5, opacity: 0.7 },
});
