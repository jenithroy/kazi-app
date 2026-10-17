import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { SegmentedProportionBar } from '@/components/ui/segmented-proportion-bar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { humanDuration } from '@/data/usage/format';
import { usageRampDark, usageRampLight } from '@/data/usage/ramp';
import type { ShareRow } from '@/data/usage/types';

export interface SectionUsageCardProps {
  rows: ShareRow[];
  total: number;
  /** Currently-scoped section key, or `'all'`. */
  selected: string;
  /** Tapping the selected row clears the scope; tapping another sets it. */
  onSelect: (key: string) => void;
}

const MAX_ROWS = 8;

/** "What's used" — pages ranked by everything done on them. Tap a row to scope the whole screen to that page. */
export function SectionUsageCard({ rows, total, selected, onSelect }: SectionUsageCardProps) {
  const theme = useTheme();
  const ramp = theme.scheme === 'dark' ? usageRampDark : usageRampLight;
  const top = rows.slice(0, MAX_ROWS);

  return (
    <Card elevation="raised" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>What&rsquo;s used</Text>
        <Text style={[styles.subtitle, tabularNums, { color: theme.textSecondary }]}>{total.toLocaleString()} actions</Text>
      </View>

      {top.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>No page activity in this period.</Text>
      ) : (
        <>
          <SegmentedProportionBar segments={top.map((r, i) => ({ weight: r.value, color: ramp[i % ramp.length] }))} />
          <View>
            {top.map((r, i) => {
              const on = r.key === selected;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => onSelect(on ? 'all' : r.key)}
                  style={[
                    styles.row,
                    i < top.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border } : null,
                    on ? { backgroundColor: theme.accentWash } : null,
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: ramp[i % ramp.length] }]} />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, { color: theme.textPrimary }]} numberOfLines={1}>{r.name}</Text>
                    <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                      {r.people} {r.people === 1 ? 'person' : 'people'} · {humanDuration(r.activeMs)}
                    </Text>
                  </View>
                  <Text style={[styles.rowValue, tabularNums, { color: theme.textPrimary }]}>{r.value.toLocaleString()}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  title: { fontFamily: fontFamily.semibold, fontSize: 15 },
  subtitle: { fontFamily: fontFamily.mono, fontSize: 11 },
  empty: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  dot: { width: 9, height: 9, borderRadius: 3 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { fontSize: 14 },
  rowMeta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  rowValue: { fontSize: 14, fontWeight: '600' },
});
