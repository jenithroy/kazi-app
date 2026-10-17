import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { STATUS_LABEL, STATUS_ORDER } from '@/data/tasks/mock';
import type { TaskStatus } from '@/data/tasks/types';

export type TaskFilter = TaskStatus | 'all';

export interface FilterChipsProps {
  active: TaskFilter;
  onChange: (filter: TaskFilter) => void;
  countFor: (filter: TaskFilter) => number;
}

export function FilterChips({ active, onChange, countFor }: FilterChipsProps) {
  const theme = useTheme();
  const filters: TaskFilter[] = ['all', ...STATUS_ORDER];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {filters.map((f) => {
        const on = active === f;
        const label = f === 'all' ? 'All' : STATUS_LABEL[f];
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            style={[
              styles.chip,
              {
                backgroundColor: on ? theme.selectedSurface : theme.surface,
                borderColor: on ? theme.selectedBorder : theme.border,
              },
            ]}
          >
            <Text style={[styles.label, { color: on ? theme.selectedText : theme.textPrimary }]}>{label}</Text>
            <Text style={[styles.count, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{countFor(f)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
  },
  count: {
    fontVariant: ['tabular-nums'],
    fontSize: 13,
  },
});
