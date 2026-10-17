import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { FilterChipData, FilterKey } from '@/data/changelog/types';

export interface FilterChipsBarProps {
  filters: FilterChipData[];
  active: FilterKey;
  onPick: (key: FilterKey) => void;
}

export function FilterChipsBar({ filters, active, onPick }: FilterChipsBarProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={[styles.wrap, { borderBottomColor: theme.border, backgroundColor: theme.background }]}
    >
      {filters.map((f) => {
        const on = f.key === active;
        return (
          <Pressable
            key={f.key}
            onPress={() => onPick(f.key)}
            style={[
              styles.chip,
              { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border },
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
  wrap: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
  },
  count: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
  },
});
