import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Each option takes an equal share of the row instead of hugging its label. */
  fill?: boolean;
}

/**
 * The design's pill-track segmented control: a recessed `draftWash` track with
 * the active option lifted onto a `surface` card. Extracted from the currency
 * toggle once Settings needed the same shape three times over.
 */
export function Segmented<T extends string>({ options, value, onChange, fill = false }: SegmentedProps<T>) {
  const theme = useTheme();

  return (
    <View style={[styles.track, fill && styles.trackFill, { backgroundColor: theme.draftWash }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.item,
              fill && styles.itemFill,
              active && { backgroundColor: theme.surface, boxShadow: theme.shadows.card },
            ]}
          >
            <Text style={[styles.text, { color: active ? theme.textPrimary : theme.textSecondary }]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3 },
  trackFill: { alignSelf: 'stretch' },
  item: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  itemFill: { flex: 1, minWidth: 0 },
  text: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
});
