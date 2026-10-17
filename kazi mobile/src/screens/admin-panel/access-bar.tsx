import { StyleSheet, Text, View } from 'react-native';

import { SegmentedProportionBar } from '@/components/ui/segmented-proportion-bar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums, type Theme } from '@/theme';
import type { AccessCounts } from '@/data/admin-panel/types';

/** One palette for the meter, the legend and the role cards, so the same colour always means the same level. */
export function barColors(theme: Theme, hero = false) {
  return {
    edit: hero ? theme.onHero.accent : theme.accent,
    view: hero ? theme.onHero.textMuted : theme.draftDot,
    none: hero ? theme.onHero.track : theme.border,
  };
}

export interface AccessBarProps {
  counts: AccessCounts;
  height?: number;
  hero?: boolean;
}

export function AccessBar({ counts, height = 5, hero = false }: AccessBarProps) {
  const theme = useTheme();
  const c = barColors(theme, hero);
  return (
    <SegmentedProportionBar
      height={height}
      gap={2}
      segments={[
        { weight: counts.edit, color: c.edit },
        { weight: counts.view, color: c.view },
        { weight: counts.none, color: c.none },
      ]}
    />
  );
}

export interface AccessLegendProps {
  counts: AccessCounts;
  hero?: boolean;
}

export function AccessLegend({ counts, hero = false }: AccessLegendProps) {
  const theme = useTheme();
  const c = barColors(theme, hero);
  const fg = hero ? theme.onHero.textMuted : theme.textSecondary;

  return (
    <View style={styles.legend}>
      {(
        [
          ['edit', counts.edit, c.edit],
          ['view', counts.view, c.view],
          ['hidden', counts.none, c.none],
        ] as const
      ).map(([label, value, color]) => (
        <View key={label} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: color }]} />
          <Text style={[styles.legendText, tabularNums, { color: fg }]}>
            {value} {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    gap: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 99,
  },
  legendText: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
  },
});
