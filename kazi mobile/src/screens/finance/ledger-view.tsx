import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { Icon, type IconName } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums, type Theme } from '@/theme';
import type { LedgerRowType } from '@/data/finance/types';

export type LedgerFilter = 'all' | LedgerRowType;

export interface LedgerViewMonth {
  title: string;
  gregorian: string;
  net: string;
  netPositive: boolean;
  rows: {
    type: LedgerRowType;
    title: string;
    meta: string;
    amount: string;
    positive: boolean;
  }[];
}

/** One per-type breakdown card in the FY drill (item 18). */
export interface LedgerBreakdownRow {
  type: LedgerRowType;
  label: string;
  count: number;
  inSum: string;
  outSum: string;
}

export interface LedgerViewProps {
  filters: { id: LedgerFilter; label: string; count: number }[];
  activeFilter: LedgerFilter;
  onFilterChange: (f: LedgerFilter) => void;
  months: LedgerViewMonth[];
  totalEntries: number;
  /** Money-in / money-out / net strip for the current filter. */
  moneyIn: string;
  moneyOut: string;
  net: string;
  netPositive: boolean;
  breakdown: LedgerBreakdownRow[];
  /** Year nav. */
  yearLabel: string;
  onPrevYear: () => void;
  onNextYear: () => void;
  hasPrevYear: boolean;
  hasNextYear: boolean;
}

const TYPE_ICON: Record<LedgerRowType, IconName> = {
  bank: 'credit-card',
  journal: 'book',
  expense: 'shopping-bag',
  purchase: 'shopping-cart',
  payroll: 'users',
  sales: 'trending-up',
};

const TYPE_LABEL: Record<LedgerRowType, string> = {
  bank: 'Bank',
  journal: 'Journal',
  expense: 'Expense',
  purchase: 'Purchase',
  payroll: 'Payroll',
  sales: 'Sales',
};

export function LedgerView({
  filters,
  activeFilter,
  onFilterChange,
  months,
  totalEntries,
  moneyIn,
  moneyOut,
  net,
  netPositive,
  breakdown,
  yearLabel,
  onPrevYear,
  onNextYear,
  hasPrevYear,
  hasNextYear,
}: LedgerViewProps) {
  const theme = useTheme();

  return (
    <View style={styles.flex}>
      {/* Year nav */}
      <View style={styles.yearNav}>
        <Pressable
          onPress={onPrevYear}
          disabled={!hasPrevYear}
          style={[styles.navBtn, { borderColor: theme.border, opacity: hasPrevYear ? 1 : 0.35 }]}
        >
          <Icon name="chevron-left" size={16} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.yearLabel, { color: theme.textPrimary }]}>{yearLabel}</Text>
        <Pressable
          onPress={onNextYear}
          disabled={!hasNextYear}
          style={[styles.navBtn, { borderColor: theme.border, opacity: hasNextYear ? 1 : 0.35 }]}
        >
          <Icon name="chevron-right" size={16} color={theme.textPrimary} />
        </Pressable>
      </View>

      {/* Money in / out / net */}
      <View style={[styles.strip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.stripCell}>
          <Text style={[styles.stripLabel, { color: theme.textSecondary }]}>Money in</Text>
          <Text style={[styles.stripValue, tabularNums, { color: theme.accentWashText }]}>{moneyIn}</Text>
        </View>
        <View style={[styles.stripDivider, { backgroundColor: theme.border }]} />
        <View style={styles.stripCell}>
          <Text style={[styles.stripLabel, { color: theme.textSecondary }]}>Money out</Text>
          <Text style={[styles.stripValue, tabularNums, { color: theme.textPrimary }]}>{moneyOut}</Text>
        </View>
        <View style={[styles.stripDivider, { backgroundColor: theme.border }]} />
        <View style={styles.stripCell}>
          <Text style={[styles.stripLabel, { color: theme.textSecondary }]}>Net</Text>
          <Text style={[styles.stripValue, tabularNums, { color: netPositive ? theme.accentWashText : theme.dangerWashText }]}>{net}</Text>
        </View>
      </View>

      {/* Per-type breakdown */}
      <View style={styles.breakdownGrid}>
        {breakdown.map((b) => (
          <Pressable
            key={b.type}
            onPress={() => onFilterChange(activeFilter === b.type ? 'all' : b.type)}
            style={[
              styles.breakdownCard,
              { backgroundColor: theme.surface, borderColor: activeFilter === b.type ? theme.accent : theme.border },
            ]}
          >
            <View style={styles.breakdownHead}>
              <View style={[styles.breakdownIcon, { backgroundColor: rowIconBg(theme, b.type) }]}>
                <Icon name={TYPE_ICON[b.type]} size={13} color={rowIconFg(theme, b.type)} />
              </View>
              <Text style={[styles.breakdownLabel, { color: theme.textPrimary }]}>{b.label}</Text>
              <Text style={[styles.breakdownCount, tabularNums, { color: theme.textSecondary }]}>{b.count}</Text>
            </View>
            <Text style={[styles.breakdownFig, tabularNums, { color: theme.accentWashText }]}>+ {b.inSum}</Text>
            <Text style={[styles.breakdownFig, tabularNums, { color: theme.textSecondary }]}>− {b.outSum}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {filters.map((f) => {
          const on = activeFilter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => onFilterChange(f.id)}
              style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
            >
              <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{f.label}</Text>
              <Text style={[styles.chipCount, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{f.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.monthsGroup}>
        {months.length === 0 ? (
          <EmptyState icon="book" title="Nothing of that type" message={`This year holds ${totalEntries} entries in total — tap "All" to see them.`} />
        ) : (
          months.map((m) => (
            <View key={m.title} style={styles.month}>
              <View style={styles.monthHeader}>
                <View style={styles.monthTitleRow}>
                  <Text style={[styles.monthTitle, { color: theme.textSecondary }]}>{m.title}</Text>
                  <Text style={[styles.monthGregorian, { color: theme.textSecondary, opacity: 0.7 }]}>{m.gregorian}</Text>
                </View>
                <Text style={[styles.monthNet, { color: m.netPositive ? theme.accentWashText : theme.dangerWashText }]}>{m.net}</Text>
              </View>
              {m.rows.map((r, i) => (
                <View key={i} style={[styles.row, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
                  <View style={[styles.rowIcon, { backgroundColor: rowIconBg(theme, r.type) }]}>
                    <Icon name={TYPE_ICON[r.type]} size={15} color={rowIconFg(theme, r.type)} />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                      {r.title}
                    </Text>
                    <Text style={[styles.rowMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                      {TYPE_LABEL[r.type]} · {r.meta}
                    </Text>
                  </View>
                  <Text style={[styles.rowAmount, { color: r.positive ? theme.accentWashText : theme.textPrimary }]}>{r.amount}</Text>
                </View>
              ))}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function rowIconBg(theme: Theme, type: LedgerRowType) {
  if (type === 'bank' || type === 'sales') return theme.accentWash;
  if (type === 'expense' || type === 'purchase') return theme.warningWash;
  return theme.draftWash;
}
function rowIconFg(theme: Theme, type: LedgerRowType) {
  if (type === 'bank' || type === 'sales') return theme.accentWashText;
  if (type === 'expense' || type === 'purchase') return theme.warningWashText;
  return theme.textSecondary;
}

const styles = StyleSheet.create({
  flex: { gap: 16 },
  yearNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  navBtn: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  yearLabel: { fontFamily: fontFamily.semibold, fontSize: 15, minWidth: 118, textAlign: 'center' },
  strip: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingVertical: 14 },
  stripCell: { flex: 1, alignItems: 'center', gap: 4 },
  stripDivider: { width: 1, alignSelf: 'stretch', marginVertical: 4 },
  stripLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.1 * 9.5, textTransform: 'uppercase' },
  stripValue: { fontSize: 14.5, fontWeight: '700' },
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  breakdownCard: { width: '31%', flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: 10, gap: 4 },
  breakdownHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakdownIcon: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  breakdownLabel: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 11.5 },
  breakdownCount: { fontFamily: fontFamily.mono, fontSize: 10 },
  breakdownFig: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  chipsRow: { gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  chipCount: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  monthsGroup: { gap: 16 },
  month: { gap: 9 },
  monthHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingHorizontal: 2 },
  monthTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, minWidth: 0 },
  monthTitle: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.12 * 10.5, textTransform: 'uppercase' },
  monthGregorian: { fontFamily: fontFamily.mono, fontSize: 9.5 },
  monthNet: { fontFamily: fontFamily.mono, fontSize: 11, flexShrink: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 13 },
  rowIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTextWrap: { flex: 1, gap: 3, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowMeta: { fontFamily: fontFamily.mono, fontSize: 10 },
  rowAmount: { fontSize: 14, fontWeight: '600', flexShrink: 0 },
});
