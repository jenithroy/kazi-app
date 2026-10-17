import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { dayLabel } from '@/data/usage/format';
import type { DayCount } from '@/data/usage/types';

export interface DayActivityChartProps {
  days: DayCount[];
}

const BAR_WIDTH = 12;
const BAR_GAP = 5;
const CHART_HEIGHT = 110;

/** Activity by day, one bar per Kathmandu day — scrolls, rather than cramming a 90-day range into the screen width. */
export function DayActivityChart({ days }: DayActivityChartProps) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const max = Math.max(1, ...days.map((d) => d.events));
  const busiest = days.reduce<DayCount | null>((best, d) => (d.events > (best?.events ?? 0) ? d : best), null);

  useEffect(() => {
    // Most recent day is always the interesting one to land on.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, [days.length]);

  return (
    <Card elevation="raised" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Activity by day</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
          {busiest?.events ? `Busiest: ${dayLabel(busiest.day)}, ${busiest.events.toLocaleString()}` : 'Day by day'}
        </Text>
      </View>

      {days.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>No activity in this period.</Text>
      ) : (
        <>
          <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barsWrap}>
            <View style={styles.bars}>
              {days.map((d) => (
                <View key={d.day} style={[styles.col, { width: BAR_WIDTH, marginRight: BAR_GAP }]}>
                  <View style={[styles.track, { backgroundColor: theme.draftWash }]}>
                    <View
                      style={[
                        styles.fill,
                        { height: `${Math.max(3, Math.round((d.events / max) * 100))}%`, backgroundColor: theme.accent },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={styles.rangeRow}>
            <Text style={[styles.rangeLabel, tabularNums, { color: theme.textSecondary }]}>{dayLabel(days[0].day)}</Text>
            <Text style={[styles.rangeLabel, tabularNums, { color: theme.textSecondary }]}>{dayLabel(days[days.length - 1].day)}</Text>
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  title: { fontFamily: fontFamily.semibold, fontSize: 15 },
  subtitle: { fontFamily: fontFamily.mono, fontSize: 10.5, flexShrink: 1, textAlign: 'right' },
  empty: { fontSize: 13 },
  barsWrap: { paddingVertical: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_HEIGHT },
  col: { height: '100%' },
  track: { flex: 1, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  fill: { width: '100%', borderRadius: 4 },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rangeLabel: { fontFamily: fontFamily.mono, fontSize: 10 },
});
