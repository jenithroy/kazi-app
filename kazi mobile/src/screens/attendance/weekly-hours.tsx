import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { WeekHours } from '@/data/attendance/types';

export interface WeeklyHoursProps {
  weeks: WeekHours[];
  /** Days with a clock-in but no clock-out — they measure 0h, so the bars read low. */
  openPunchDays?: number;
}

/** Weekly hours-worked bar chart for the "Mine" view — real clocked hours per calendar week. */
export function WeeklyHours({ weeks, openPunchDays = 0 }: WeeklyHoursProps) {
  const theme = useTheme();
  const max = Math.max(1, ...weeks.map((w) => w.hours));

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Weekly hours</Text>
        <Text style={[styles.meta, { color: openPunchDays > 0 ? theme.warningWashText : theme.textSecondary }]}>
          {openPunchDays > 0 ? `${openPunchDays} ${openPunchDays === 1 ? 'day' : 'days'} still open` : 'Clocked in → out'}
        </Text>
      </View>

      <View style={styles.bars}>
        {weeks.map((w) => {
          const fillPct = Math.round((w.hours / max) * 100);
          return (
            <View key={w.label} style={styles.col}>
              <View style={[styles.track, { backgroundColor: theme.draftWash }]}>
                <View style={[styles.fill, { height: `${fillPct}%`, backgroundColor: theme.accent }]} />
              </View>
              <Text style={[styles.value, tabularNums, { color: theme.textPrimary }]}>{w.hours}</Text>
              <Text style={[styles.label, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                {w.label.replace(/^[A-Za-z]{3}\s/, '')}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  title: { fontFamily: fontFamily.semibold, fontSize: 15 },
  meta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 128 },
  col: { flex: 1, alignItems: 'center', gap: 5 },
  track: { width: '100%', flex: 1, borderRadius: 8, overflow: 'hidden', justifyContent: 'flex-end' },
  fill: { width: '100%', borderRadius: 8 },
  value: { fontSize: 12, fontWeight: '600' },
  label: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.06 * 9 },
});
