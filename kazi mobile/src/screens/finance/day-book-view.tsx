import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { DayBookDay } from '@/data/finance/day-book';
import { moneyDigits, useMoneySignature } from '@/lib/money';
import { useCalendarPreference } from '@/lib/calendar-preference';
import { dateText } from '@/lib/date-display';

export interface DayBookViewProps {
  days: DayBookDay[];
}

/** Columns print the amount bare — the currency is named once, on the totals row. */
const num = (n: number) => moneyDigits(n, 'en-IN');

export function DayBookView({ days }: DayBookViewProps) {
  const theme = useTheme();
  // Both helpers below are plain functions, so the view subscribes itself.
  useMoneySignature();
  useCalendarPreference();

  const rowCount = days.reduce((n, d) => n + d.rows.length, 0);
  const totalDr = days.reduce((n, d) => n + d.dr, 0);
  const totalCr = days.reduce((n, d) => n + d.cr, 0);

  if (days.length === 0) {
    return <EmptyState icon="book" title="Nothing recorded yet" message="Purchases, settled sales, bank movements and journal entries land here as they happen." />;
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.grand, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.grandLabel, { color: theme.textSecondary }]}>
          {rowCount} {rowCount === 1 ? 'entry' : 'entries'} · {days.length} {days.length === 1 ? 'day' : 'days'}
        </Text>
        <View style={styles.grandFigs}>
          <Text style={[styles.grandFig, tabularNums, { color: theme.accentWashText }]}>Dr {num(totalDr)}</Text>
          <Text style={[styles.grandFig, tabularNums, { color: theme.dangerWashText }]}>Cr {num(totalCr)}</Text>
        </View>
      </View>

      {days.map((d) => (
        <View key={d.date} style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, tabularNums, { color: theme.textPrimary }]}>{dateText(d.date, { bsStyle: 'long' })}</Text>
            <Text style={[styles.dayTotals, tabularNums, { color: theme.textSecondary }]}>
              Dr {num(d.dr)} · Cr {num(d.cr)}
            </Text>
          </View>

          <View style={[styles.tableHead, { borderBottomColor: theme.border }]}>
            <Text style={[styles.thParticulars, { color: theme.textSecondary }]}>Account · particulars</Text>
            <Text style={[styles.thNum, { color: theme.textSecondary }]}>Dr</Text>
            <Text style={[styles.thNum, { color: theme.textSecondary }]}>Cr</Text>
          </View>

          {d.rows.map((r) => (
            <View key={r.key} style={[styles.tr, { borderBottomColor: theme.background }]}>
              <View style={styles.tdParticulars}>
                <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                  {r.particulars}
                </Text>
                <Text style={[styles.rowRef, { color: theme.textSecondary }]} numberOfLines={1}>
                  {r.account}
                </Text>
              </View>
              <Text style={[styles.tdNum, tabularNums, { color: r.dr ? theme.accentWashText : theme.textSecondary }]}>
                {r.dr ? num(r.dr) : '—'}
              </Text>
              <Text style={[styles.tdNum, tabularNums, { color: r.cr ? theme.dangerWashText : theme.textSecondary }]}>
                {r.cr ? num(r.cr) : '—'}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  grand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  grandLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.1 * 9.5, textTransform: 'uppercase' },
  grandFigs: { alignItems: 'flex-end', gap: 2 },
  grandFig: { fontFamily: fontFamily.mono, fontSize: 11 },
  card: { borderRadius: 18, padding: 15, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  cardTitle: { fontFamily: fontFamily.semibold, fontSize: 14 },
  dayTotals: { fontFamily: fontFamily.mono, fontSize: 9.5, flexShrink: 0 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 6 },
  thParticulars: { flex: 1, fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.1 * 9, textTransform: 'uppercase' },
  thNum: { width: 70, textAlign: 'right', fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.1 * 9, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
  tdParticulars: { flex: 1, gap: 2, minWidth: 0, paddingRight: 6 },
  rowTitle: { fontSize: 12.5, fontWeight: '600' },
  rowRef: { fontFamily: fontFamily.mono, fontSize: 9.5 },
  tdNum: { width: 70, textAlign: 'right', fontSize: 11, fontFamily: fontFamily.mono },
});
