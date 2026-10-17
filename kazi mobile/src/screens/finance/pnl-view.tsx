import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { SegmentedProportionBar } from '@/components/ui/segmented-proportion-bar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { PurchaseEntry } from '@/data/purchases/types';
import type { ProfitAndLoss } from '@/data/finance/pnl';
import { money, moneyDigits, useMoneySignature } from '@/lib/money';

export interface PnlViewProps {
  pnl: ProfitAndLoss;
  purchases: PurchaseEntry[];
}

const npr = (n: number) => money(n, { grouping: 'en-IN' });

/** Category rows print bare digits under a heading that already names the currency. */
const num = (n: number) => moneyDigits(n, 'en-IN');

export function PnlView({ pnl, purchases }: PnlViewProps) {
  const theme = useTheme();
  // These figures come from plain formatters, so the view subscribes to the currency itself.
  useMoneySignature();

  const incomeRows = [
    { label: 'Sales revenue', value: pnl.salesRevenue, note: 'collected invoices' },
    { label: 'Other income', value: pnl.otherIncome, note: 'journal' },
  ];
  const expenseRows = [
    { label: 'Operating expenses', value: pnl.operatingExpenses },
    { label: 'Purchases', value: pnl.purchases },
    { label: 'Payroll', value: pnl.payroll },
    { label: 'Journal expenses', value: pnl.journalExpenses },
  ];

  const outgoings = [
    { label: 'Purchases', value: pnl.purchases, color: theme.accent },
    { label: 'Expenses', value: pnl.operatingExpenses + pnl.journalExpenses, color: theme.scheme === 'light' ? '#C9A227' : '#D9B45C' },
    { label: 'Payroll', value: pnl.payroll, color: theme.scheme === 'light' ? '#5B6C64' : '#8FA69B' },
  ].filter((s) => s.value > 0);
  const outgoingsTotal = outgoings.reduce((n, s) => n + s.value, 0) || 1;

  const byCategory = new Map<string, number>();
  purchases.forEach((p) => byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + p.amountNPR));
  const catRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const catMax = catRows[0]?.[1] ?? 1;

  const incomeVsExpense = [
    { weight: pnl.totalIncome, color: theme.onHero.accent },
    { weight: pnl.totalExpenses, color: theme.onHero.danger },
  ];

  return (
    <View style={styles.wrap}>
      <Card elevation="hero" style={styles.netCard}>
        <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Net profit / loss</Text>
        <Money npr={pnl.netProfit} size={30} hero primaryStyle={styles.netValue} />
        <View style={styles.ivBar}>
          <SegmentedProportionBar segments={incomeVsExpense} height={10} />
        </View>
        <View style={styles.ivLabels}>
          <Text style={[styles.ivLabel, { color: theme.onHero.textMuted }]}>Income {npr(pnl.totalIncome)}</Text>
          <Text style={[styles.ivLabel, { color: theme.onHero.textMuted }]}>Expenses {npr(pnl.totalExpenses)}</Text>
        </View>
      </Card>

      <Card elevation="raised" style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Income</Text>
        {incomeRows.map((r) => (
          <StatementRow key={r.label} label={r.label} note={r.note} value={r.value} theme={theme} />
        ))}
        <TotalLine label="Total income" value={pnl.totalIncome} theme={theme} />

        <View style={styles.gap} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Expenses</Text>
        {expenseRows.map((r) => (
          <StatementRow key={r.label} label={r.label} value={r.value} theme={theme} />
        ))}
        <TotalLine label="Total expenses" value={pnl.totalExpenses} theme={theme} />

        <View style={[styles.netRow, { borderTopColor: theme.border }]}>
          <Text style={[styles.netRowLabel, { color: theme.textPrimary }]}>Net profit / loss</Text>
          <Money npr={pnl.netProfit} size={16} align="right" />
        </View>
      </Card>

      <Card elevation="raised" style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Outgoings split</Text>
        <SegmentedProportionBar segments={outgoings.map((s) => ({ weight: s.value, color: s.color }))} height={14} />
        <View style={styles.legend}>
          {outgoings.map((s) => (
            <View key={s.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={[styles.legendText, { color: theme.textSecondary }]}>
                {s.label} · {Math.round((s.value / outgoingsTotal) * 100)}%
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {catRows.length > 0 ? (
        <Card elevation="raised" style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Purchases by category</Text>
          {catRows.map(([cat, val]) => (
            <View key={cat} style={styles.catRow}>
              <Text style={[styles.catName, { color: theme.textPrimary }]} numberOfLines={1}>
                {cat}
              </Text>
              <View style={[styles.catTrack, { backgroundColor: theme.draftWash }]}>
                <View style={[styles.catFill, { width: `${Math.max(4, (val / catMax) * 100)}%`, backgroundColor: theme.accent }]} />
              </View>
              <Text style={[styles.catVal, tabularNums, { color: theme.textSecondary }]}>{num(val)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

function StatementRow({ label, note, value, theme }: { label: string; note?: string; value: number; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.stRow}>
      <View style={styles.stLabelWrap}>
        <Text style={[styles.stLabel, { color: theme.textPrimary }]}>{label}</Text>
        {note ? <Text style={[styles.stNote, { color: theme.textSecondary }]}>{note}</Text> : null}
      </View>
      <Text style={[styles.stValue, tabularNums, { color: theme.textPrimary }]}>{npr(value)}</Text>
    </View>
  );
}

function TotalLine({ label, value, theme }: { label: string; value: number; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={[styles.totalLine, { borderTopColor: theme.border }]}>
      <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.totalValue, tabularNums, { color: theme.textPrimary }]}>{npr(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  netCard: { padding: 17, gap: 10 },
  eyebrow: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  netValue: { fontFamily: fontFamily.semibold, fontSize: 30, letterSpacing: -0.03 * 30 },
  ivBar: { marginTop: 4 },
  ivLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  ivLabel: { fontFamily: fontFamily.mono, fontSize: 9.5 },
  section: { padding: 16, gap: 9 },
  sectionTitle: { fontFamily: fontFamily.semibold, fontSize: 15 },
  gap: { height: 4 },
  stRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  stLabelWrap: { flex: 1, minWidth: 0 },
  stLabel: { fontSize: 13.5 },
  stNote: { fontFamily: fontFamily.mono, fontSize: 9.5, marginTop: 1 },
  stValue: { fontSize: 13, fontFamily: fontFamily.mono, flexShrink: 0 },
  totalLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 7, marginTop: 3 },
  totalLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.08 * 10, textTransform: 'uppercase' },
  totalValue: { fontSize: 13.5, fontWeight: '700', fontFamily: fontFamily.mono },
  netRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1.5, paddingTop: 11, marginTop: 5 },
  netRowLabel: { fontFamily: fontFamily.semibold, fontSize: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 999 },
  legendText: { fontSize: 11 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catName: { width: 92, fontSize: 12 },
  catTrack: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' },
  catFill: { height: '100%', borderRadius: 999 },
  catVal: { width: 58, textAlign: 'right', fontFamily: fontFamily.mono, fontSize: 10 },
});
