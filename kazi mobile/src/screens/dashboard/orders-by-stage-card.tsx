import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { SegmentedProportionBar } from '@/components/ui/segmented-proportion-bar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { stageRampDark, stageRampLight } from '@/data/dashboard/stage-ramp';
import type { StageDatum } from '@/data/dashboard/types';

export interface OrdersByStageCardProps {
  stages: StageDatum[];
  total: number;
}

/** Proportions first, counts second — the stage list answers "how many" once the bar has answered "where is the work". */
export function OrdersByStageCard({ stages, total }: OrdersByStageCardProps) {
  const theme = useTheme();
  const ramp = theme.scheme === 'dark' ? stageRampDark : stageRampLight;

  return (
    <Card elevation="raised" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Active orders by stage</Text>
        <Text style={[styles.totalText, tabularNums, { color: theme.textSecondary }]}>{total} total</Text>
      </View>

      <SegmentedProportionBar segments={stages.map((s, i) => ({ weight: s.count, color: ramp[i % ramp.length] }))} />

      <View>
        {stages.map((stage, i) => (
          <View
            key={stage.id}
            style={[styles.row, i < stages.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
          >
            <View style={[styles.dot, { backgroundColor: ramp[i % ramp.length] }]} />
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{stage.label}</Text>
            {stage.blockedCount ? (
              <View style={[styles.blockedChip, { backgroundColor: theme.dangerWash }]}>
                <Text style={[styles.blockedText, { color: theme.dangerWashText }]}>{stage.blockedCount} blocked</Text>
              </View>
            ) : null}
            <Text style={[styles.rowCount, tabularNums, { color: theme.textPrimary }]}>{stage.count}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
  },
  totalText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
  },
  rowCount: {
    fontSize: 14,
    fontWeight: '600',
  },
  blockedChip: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
});
