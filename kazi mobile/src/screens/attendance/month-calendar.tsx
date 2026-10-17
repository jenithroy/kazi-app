import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { BS_MONTHS_EN, bsFromAD } from '@/lib/nepaliDate';
import { STATUS_LABELS, STATUS_RAMP, WEEKDAYS } from '@/data/attendance/mock';
import type { AttendanceStatus, DayCell } from '@/data/attendance/types';

const LEGEND_STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'half', 'leave'];

export interface MonthCalendarProps {
  monthLabel: string;
  monthISOStart: string;
  monthISOEnd: string;
  workingDays: number;
  days: DayCell[];
  /** Tapping a day opens its punch detail; omitted makes the grid read-only. */
  onSelectDay?: (dateISO: string) => void;
}

/** BS span covering the displayed AD month, e.g. "Shrawan–Bhadra 2083 BS". */
function bsSpanLabel(startISO: string, endISO: string): string {
  const a = bsFromAD(startISO);
  const b = bsFromAD(endISO);
  const from = BS_MONTHS_EN[a.month - 1];
  const to = BS_MONTHS_EN[b.month - 1];
  if (a.year === b.year && a.month === b.month) return `${from} ${a.year} BS`;
  return `${from} ${a.date}–${to} ${b.date}, ${b.year} BS`;
}

/**
 * Split the flat cell list into fixed 7-column rows, padding the last row out to
 * seven. Without the padding a short final row's cells stretch (they're `flex: 1`)
 * and, being square, blow the card's height out — the "giant 30 / 31" bug.
 */
function toWeekRows(days: DayCell[]): (DayCell | null)[][] {
  const rows: (DayCell | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    const row: (DayCell | null)[] = days.slice(i, i + 7);
    while (row.length < 7) row.push(null);
    rows.push(row);
  }
  return rows;
}

export function MonthCalendar({ monthLabel, monthISOStart, monthISOEnd, workingDays, days, onSelectDay }: MonthCalendarProps) {
  const theme = useTheme();
  const ramp = STATUS_RAMP[theme.scheme];
  const rows = toWeekRows(days);
  const bsSpan = bsSpanLabel(monthISOStart, monthISOEnd);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{monthLabel}</Text>
          <Text style={[styles.bsLabel, { color: theme.textSecondary }]}>{bsSpan}</Text>
        </View>
        <Text style={[styles.workingDays, tabularNums, { color: theme.textSecondary }]}>{workingDays} working days</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.week}>
          {WEEKDAYS.map((w) => (
            <View key={w} style={styles.weekdayCell}>
              <Text style={[styles.weekdayLabel, { color: theme.textSecondary }]}>{w}</Text>
            </View>
          ))}
        </View>

        {rows.map((row, r) => (
          <View key={r} style={styles.week}>
            {row.map((d, i) => {
              if (!d) return <View key={i} style={styles.dayCell} />;
              let bg = 'transparent';
              let fg = theme.textSecondary;
              if (d.status === 'off') {
                bg = theme.draftWash;
                fg = theme.textSecondary;
              } else if (d.status === 'future') {
                bg = theme.surfaceRaised;
                fg = theme.textSecondary;
              } else if (d.status) {
                bg = ramp[d.status].cellBg;
                fg = ramp[d.status].cellFg;
              }
              const dateISO = d.dateISO;
              return (
                <Pressable
                  key={i}
                  disabled={!onSelectDay || !dateISO}
                  onPress={() => dateISO && onSelectDay?.(dateISO)}
                  style={({ pressed }) => [
                    styles.dayCell,
                    {
                      backgroundColor: bg,
                      borderWidth: d.isToday ? 2 : 0,
                      borderColor: theme.selectedBorder,
                      opacity: pressed ? 0.55 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.dayLabel, tabularNums, { color: fg, fontWeight: d.isToday ? '700' : '500' }]}>
                    {d.day ?? ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <Text style={[styles.hint, { color: theme.textSecondary }]}>Tap a day for its clock-in and clock-out</Text>

      <View style={styles.legendRow}>
        {LEGEND_STATUSES.map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: ramp[s].cellBg }]} />
            <Text style={[styles.legendLabel, { color: theme.textPrimary }]}>{STATUS_LABELS[s]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  titleWrap: { gap: 2, flexShrink: 1 },
  title: { fontFamily: fontFamily.semibold, fontSize: 15 },
  bsLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.08 * 10 },
  workingDays: { fontFamily: fontFamily.mono, fontSize: 11, flexShrink: 0 },
  grid: { gap: 5 },
  week: { flexDirection: 'row', gap: 5 },
  weekdayCell: { flex: 1, alignItems: 'center', paddingBottom: 2 },
  weekdayLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.1 * 9.5, textTransform: 'uppercase' },
  dayCell: { flex: 1, aspectRatio: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontSize: 12.5 },
  hint: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.08 * 9.5, marginTop: -4 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 9, height: 9, borderRadius: 3 },
  legendLabel: { fontSize: 11.5 },
});
