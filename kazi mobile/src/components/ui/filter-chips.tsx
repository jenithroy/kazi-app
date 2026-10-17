import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';

export interface FilterChip<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export interface FilterChipsProps<T extends string> {
  chips: FilterChip<T>[];
  active: T;
  onChange: (id: T) => void;
}

/** A scrolling row of count-bearing filter chips, sitting under a search field. */
export function FilterChips<T extends string>({ chips, active, onChange }: FilterChipsProps<T>) {
  const theme = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.row}>
      {chips.map((c) => {
        const on = c.id === active;
        return (
          <Pressable
            key={c.id}
            onPress={() => onChange(c.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
          >
            <Text style={[styles.label, { color: on ? theme.selectedText : theme.textPrimary }]}>{c.label}</Text>
            {typeof c.count === 'number' ? (
              <Text style={[styles.count, tabularNums, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{c.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { flexGrow: 0, flexShrink: 0 },
  row: { gap: 7, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  label: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  count: { fontFamily: fontFamily.mono, fontSize: 10.5 },
});
