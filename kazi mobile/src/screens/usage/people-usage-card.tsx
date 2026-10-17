import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, tintFromSeed } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { SegmentedProportionBar } from '@/components/ui/segmented-proportion-bar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { humanDuration, initialsOf, relativeTime } from '@/data/usage/format';
import { usageRampDark, usageRampLight } from '@/data/usage/ramp';
import type { ShareRow } from '@/data/usage/types';

export interface PeopleUsageCardProps {
  rows: ShareRow[];
  total: number;
  /** Currently-scoped person key, or `'all'`. */
  selected: string;
  /** Tapping the selected row clears the scope; tapping another sets it. */
  onSelect: (key: string) => void;
}

const MAX_ROWS = 10;

/** "People" — who is using it, what they do most, and when they were last seen. Tap a row to scope the screen to that person. */
export function PeopleUsageCard({ rows, total, selected, onSelect }: PeopleUsageCardProps) {
  const theme = useTheme();
  const ramp = theme.scheme === 'dark' ? usageRampDark : usageRampLight;
  const top = rows.slice(0, MAX_ROWS);

  return (
    <Card elevation="raised" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>People</Text>
        <Text style={[styles.subtitle, tabularNums, { color: theme.textSecondary }]}>{total.toLocaleString()} actions</Text>
      </View>

      {top.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>Nobody was active in this period.</Text>
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
                  <Avatar initials={initialsOf(r.name)} tint={tintFromSeed(r.name)} size="sm" />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, { color: theme.textPrimary }]} numberOfLines={1}>{r.name}</Text>
                    <Text style={[styles.rowMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                      {r.writes} changes · {humanDuration(r.activeMs)} · mostly {r.topSection}
                    </Text>
                  </View>
                  <View style={styles.rowEnd}>
                    <Text style={[styles.rowValue, tabularNums, { color: theme.textPrimary }]}>{r.value.toLocaleString()}</Text>
                    <Text style={[styles.rowLast, { color: theme.textSecondary }]}>{relativeTime(r.lastAt) || '—'}</Text>
                  </View>
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
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { fontSize: 14 },
  rowMeta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  rowEnd: { alignItems: 'flex-end', gap: 2 },
  rowValue: { fontSize: 14, fontWeight: '600' },
  rowLast: { fontFamily: fontFamily.mono, fontSize: 9.5 },
});
