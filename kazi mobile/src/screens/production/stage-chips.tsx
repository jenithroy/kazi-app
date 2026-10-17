import { ScrollView, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { OrdersFilter } from '@/data/sales/types';

export interface StageChipsProps {
  filters: { id: OrdersFilter; label: string; count: number }[];
  active: OrdersFilter;
  onChange: (f: OrdersFilter) => void;
}

/** Horizontal stage filter rail — the pipeline's primary navigation. */
export function StageChips({ filters, active, onChange }: StageChipsProps) {
  const theme = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {filters.map((f) => {
        const on = active === f.id;
        return (
          <Pressable
            key={f.id}
            onPress={() => onChange(f.id)}
            style={[
              styles.chip,
              {
                backgroundColor: on ? theme.selectedSurface : theme.surface,
                borderColor: on ? theme.selectedBorder : theme.border,
              },
            ]}
          >
            <Text style={[styles.label, { color: on ? theme.selectedText : theme.textPrimary }]}>{f.label}</Text>
            <Text style={[styles.count, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{f.count}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingBottom: 2,
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
    fontFamily: fontFamily.regular,
    fontSize: 13,
    opacity: 0.65,
  },
});
