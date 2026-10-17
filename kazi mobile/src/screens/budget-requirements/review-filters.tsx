import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { Priority } from '@/data/budget-requirements/types';

export interface ReviewFiltersProps {
  status: string;
  urgency: string;
  statusOptions: { id: string; label: string; count: number }[];
  onStatus: (id: string) => void;
  onUrgency: (id: string) => void;
}

const URGENCY: { id: 'all' | Priority; label: string }[] = [
  { id: 'all', label: 'Any urgency' },
  { id: 'High', label: 'High' },
  { id: 'Medium', label: 'Medium' },
  { id: 'Low', label: 'Low' },
];

/** Shared status + urgency chip rows for both Budget tabs (item 17). */
export function ReviewFilters({ status, urgency, statusOptions, onStatus, onUrgency }: ReviewFiltersProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {statusOptions.map((o) => {
          const on = status === o.id;
          return (
            <Pressable
              key={o.id}
              onPress={() => onStatus(o.id)}
              style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
            >
              <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{o.label}</Text>
              <Text style={[styles.chipCount, tabularNums, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{o.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {URGENCY.map((o) => {
          const on = urgency === o.id;
          return (
            <Pressable
              key={o.id}
              onPress={() => onUrgency(o.id)}
              style={[styles.pill, { borderColor: on ? theme.accent : theme.border, backgroundColor: on ? theme.accentWash : 'transparent' }]}
            >
              <Text style={[styles.pillLabel, { color: on ? theme.accentWashText : theme.textSecondary }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  chipCount: { fontFamily: fontFamily.mono, fontSize: 10.5, opacity: 0.85 },
  pill: { height: 28, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillLabel: { fontFamily: fontFamily.mono, fontSize: 11 },
});
