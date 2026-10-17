import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { SegmentedProportionBar } from '@/components/ui/segmented-proportion-bar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { AttendanceBreakdown } from '@/data/dashboard/types';

export interface AttendanceCardProps {
  breakdown: AttendanceBreakdown;
  onRoll: number;
}

export function AttendanceCard({ breakdown, onRoll }: AttendanceCardProps) {
  const theme = useTheme();

  const segments = [
    { key: 'present', label: 'Present', value: breakdown.present, color: theme.accent },
    { key: 'late', label: 'Late', value: breakdown.late, color: theme.warningWashText },
    { key: 'absent', label: 'Absent', value: breakdown.absent, color: theme.danger },
    { key: 'leave', label: 'Leave', value: breakdown.leave, color: theme.draftDot },
  ];

  return (
    <Card elevation="raised" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Attendance today</Text>
        <Text style={[styles.totalText, tabularNums, { color: theme.textSecondary }]}>{onRoll} on roll</Text>
      </View>

      <SegmentedProportionBar segments={segments.map((s) => ({ weight: s.value, color: s.color }))} height={8} />

      <View style={styles.grid}>
        {segments.map((s) => (
          <View key={s.key} style={styles.cell}>
            <Text style={[styles.value, tabularNums, { color: theme.textPrimary }]}>{s.value}</Text>
            <View style={styles.labelRow}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text style={[styles.label, { color: theme.textSecondary }]}>{s.label}</Text>
            </View>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cell: {
    flexBasis: '22%',
    flexGrow: 1,
    gap: 5,
  },
  value: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.02 * 22,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 99,
  },
  label: {
    fontSize: 11.5,
  },
});
