import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { KINDS, MONTHS, TODAY } from '@/data/marketing/mock';
import type { CalendarEntry, MonthCursor, SelectedDay } from '@/data/marketing/types';

const GRID_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface MonthGridProps {
  entries: CalendarEntry[];
  cursor: MonthCursor;
  selected: SelectedDay;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDay: (day: number) => void;
}

export function MonthGrid({ entries, cursor, selected, onPrevMonth, onNextMonth, onSelectDay }: MonthGridProps) {
  const theme = useTheme();
  const monthEntries = entries.filter((e) => e.y === cursor.y && e.m === cursor.m);

  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();
  const lead = (firstWeekday + 6) % 7;
  const totalDays = new Date(cursor.y, cursor.m + 1, 0).getDate();

  const cells: { day: number | null; dayEntries: CalendarEntry[]; isSelected: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const day = i - lead + 1;
    if (day < 1 || day > totalDays) {
      cells.push({ day: null, dayEntries: [], isSelected: false, isToday: false });
      continue;
    }
    cells.push({
      day,
      dayEntries: monthEntries.filter((e) => e.d === day),
      isSelected: selected.y === cursor.y && selected.m === cursor.m && selected.d === day,
      isToday: cursor.y === TODAY.y && cursor.m === TODAY.m && day === TODAY.d,
    });
  }

  return (
    <Card elevation="raised" style={styles.card}>
      <View style={styles.navRow}>
        <Pressable onPress={onPrevMonth} style={[styles.navButton, { borderColor: theme.border }]}>
          <Icon name="chevron-left" size={15} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: theme.textPrimary }]}>
          {MONTHS[cursor.m]} {cursor.y}
        </Text>
        <Pressable onPress={onNextMonth} style={[styles.navButton, { borderColor: theme.border }]}>
          <Icon name="chevron-right" size={15} color={theme.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {GRID_WEEKDAYS.map((w) => (
          <Text key={w} style={[styles.weekday, { color: theme.textSecondary }]}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((c, i) => {
          const hasEntries = c.dayEntries.length > 0;
          return (
            <Pressable
              key={i}
              disabled={c.day === null}
              onPress={() => c.day !== null && onSelectDay(c.day)}
              style={[
                styles.cell,
                {
                  backgroundColor: c.isSelected ? theme.selectedSurface : hasEntries ? theme.draftWash : 'transparent',
                  borderWidth: c.isToday && !c.isSelected ? 1.5 : 0,
                  borderColor: theme.accent,
                },
              ]}
            >
              {c.day !== null ? (
                <>
                  <Text
                    style={[
                      styles.cellLabel,
                      tabularNums,
                      {
                        color: c.isSelected ? theme.selectedText : hasEntries ? theme.textPrimary : theme.textSecondary,
                        fontFamily: hasEntries || c.isToday ? fontFamily.semibold : fontFamily.regular,
                      },
                    ]}
                  >
                    {c.day}
                  </Text>
                  <View style={styles.dotsRow}>
                    {c.dayEntries.slice(0, 3).map((e, di) => (
                      <View key={di} style={[styles.dot, { backgroundColor: c.isSelected ? theme.onDark.accent : KINDS[e.kind].color }]} />
                    ))}
                  </View>
                </>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, paddingTop: 16, gap: 12 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  navButton: { width: 32, height: 32, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontFamily: fontFamily.semibold, fontSize: 16, letterSpacing: -0.01 * 16 },
  weekdayRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.1 * 9.5, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  cell: { width: '13.5%', flexGrow: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  cellLabel: { fontSize: 13.5, lineHeight: 13.5 },
  dotsRow: { flexDirection: 'row', gap: 3, height: 5, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 99 },
});
