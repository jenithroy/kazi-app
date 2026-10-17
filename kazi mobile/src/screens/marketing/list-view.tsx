import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { EmptyState } from '@/components/ui/empty-state';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { KINDS, KIND_ORDER, PEOPLE, WEEKDAYS } from '@/data/marketing/mock';
import type { CalendarEntry, KindFilter, MonthCursor } from '@/data/marketing/types';

export interface ListViewProps {
  entries: CalendarEntry[];
  cursor: MonthCursor;
  kindFilter: KindFilter;
  onFilterChange: (f: KindFilter) => void;
  onOpen: (entry: CalendarEntry) => void;
}

export function ListView({ entries, cursor, kindFilter, onFilterChange, onOpen }: ListViewProps) {
  const theme = useTheme();
  const monthEntries = entries.filter((e) => e.y === cursor.y && e.m === cursor.m).sort((a, b) => a.d - b.d);
  const filtered = monthEntries.filter((e) => kindFilter === 'all' || e.kind === kindFilter);

  const filters: { key: KindFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: monthEntries.length },
    ...KIND_ORDER.map((k) => ({ key: k as KindFilter, label: KINDS[k].label, count: monthEntries.filter((e) => e.kind === k).length })),
  ];

  const groups: { wk: number; entries: CalendarEntry[] }[] = [];
  filtered.forEach((e) => {
    const wk = Math.ceil((e.d + ((new Date(e.y, e.m, 1).getDay() + 6) % 7)) / 7);
    let g = groups.find((x) => x.wk === wk);
    if (!g) {
      g = { wk, entries: [] };
      groups.push(g);
    }
    g.entries.push(e);
  });

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {filters.map((f) => {
          const on = kindFilter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => onFilterChange(f.key)}
              style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
            >
              <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{f.label}</Text>
              <Text style={[styles.chipCount, tabularNums, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{f.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <EmptyState icon="calendar" title="No entries match" message="Clear the filter to see the whole month." />
      ) : (
        groups.map((g) => (
          <View key={g.wk} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={[styles.groupLabel, { color: theme.textPrimary }]}>Week {g.wk}</Text>
              <Text style={[styles.groupCount, tabularNums, { color: theme.textSecondary }]}>{g.entries.length}</Text>
              <View style={[styles.groupLine, { backgroundColor: theme.border }]} />
            </View>
            {g.entries.map((e, i) => {
              const k = KINDS[e.kind];
              const person = PEOPLE.find((p) => p.id === e.person) ?? PEOPLE[0];
              return (
                <Animated.View key={e.id} entering={FadeInUp.delay(Math.min(i, 6) * 30).duration(220)}>
                  <Pressable onPress={() => onOpen(e)} style={[styles.row, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
                    <View style={styles.dayCol}>
                      <Text style={[styles.rowWeekday, { color: theme.textSecondary }]}>{WEEKDAYS[new Date(e.y, e.m, e.d).getDay()]}</Text>
                      <Text style={[styles.rowDay, tabularNums, { color: theme.textPrimary }]}>{e.d}</Text>
                    </View>
                    <View style={[styles.rowAccent, { backgroundColor: k.color }]} />
                    <View style={styles.rowTextWrap}>
                      <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                        {e.title}
                      </Text>
                      <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
                        {k.label} · {person.name}
                      </Text>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 18 },
  chipsRow: { gap: 8, paddingBottom: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 13 },
  chipCount: { fontFamily: fontFamily.mono, fontSize: 11, opacity: 0.85 },
  group: { gap: 9 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  groupLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.14 * 10, textTransform: 'uppercase' },
  groupCount: { fontFamily: fontFamily.mono, fontSize: 10 },
  groupLine: { flex: 1, height: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 13 },
  dayCol: { width: 42, flexShrink: 0, alignItems: 'center', gap: 1 },
  rowWeekday: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.1 * 9.5, textTransform: 'uppercase' },
  rowDay: { fontSize: 17, fontWeight: '600', letterSpacing: -0.02 * 17 },
  rowAccent: { width: 4, alignSelf: 'stretch', minHeight: 34, borderRadius: 99, flexShrink: 0 },
  rowTextWrap: { flex: 1, gap: 4, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600', lineHeight: 15 * 1.3 },
  rowMeta: { fontSize: 12.5 },
});
