import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { expenseCategory } from '@/data/finance/mock';
import { lakh, rupees } from '@/data/finance/utils';
import type { Expense } from '@/data/finance/types';

export interface OverviewTotals {
  receivable: { total: number; overdue: number; invoices: number; customers: number };
  payable: { total: number; bills: number };
  fiscalYears: number;
}

export interface OverviewProps {
  expenses: Expense[];
  totals: OverviewTotals;
  onBrowseYears: () => void;
}

export function Overview({ expenses, totals, onBrowseYears }: OverviewProps) {
  const theme = useTheme();
  const expenseSum = expenses.reduce((n, e) => n + e.amountNPR, 0);
  const net = totals.receivable.total - totals.payable.total;

  return (
    <View style={styles.group}>
      <Card elevation="hero" style={styles.marginCard}>
        <View style={styles.marginTopRow}>
          <View style={styles.gap6}>
            <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Net position</Text>
            <Text style={[styles.marginValue, tabularNums, { color: theme.onHero.text }]}>
              {`${net < 0 ? '−' : '+'}${lakh(Math.abs(net))}`}
            </Text>
          </View>
          <View style={[styles.gap5, styles.alignEnd]}>
            <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Owed to you</Text>
            <Text style={[styles.netValue, tabularNums, { color: theme.onHero.text }]}>
              {lakh(totals.receivable.total)}
            </Text>
          </View>
        </View>
        <Text style={[styles.marginLabel, { color: theme.onHero.textMuted }]}>Receivable minus payable, across all recorded documents</Text>
      </Card>

      <View style={styles.pairRow}>
        <Card elevation="raised" style={[styles.pairCard, { borderLeftColor: theme.danger }]}>
          <Text style={[styles.pairLabel, { color: theme.textSecondary }]}>Payable</Text>
          <Text style={[styles.pairValue, tabularNums, { color: theme.textPrimary }]}>{lakh(totals.payable.total)}</Text>
          <Text style={[styles.pairMeta, tabularNums, { color: theme.textSecondary }]}>
            {totals.payable.total > 0
              ? `${totals.payable.bills} unpaid bill${totals.payable.bills === 1 ? '' : 's'}`
              : 'nothing recorded as unpaid'}
          </Text>
        </Card>
        <Card elevation="raised" style={[styles.pairCard, { borderLeftColor: theme.accent }]}>
          <Text style={[styles.pairLabel, { color: theme.textSecondary }]}>Receivable</Text>
          <Text style={[styles.pairValue, tabularNums, { color: theme.textPrimary }]}>{lakh(totals.receivable.total)}</Text>
          {totals.receivable.overdue > 0 ? (
            <View style={[styles.pairPill, { backgroundColor: theme.dangerWash }]}>
              <View style={[styles.pairDot, { backgroundColor: theme.danger }]} />
              <Text style={[styles.pairPillText, { color: theme.dangerWashText }]}>{`${lakh(totals.receivable.overdue)} overdue`}</Text>
            </View>
          ) : null}
          <Text style={[styles.pairMeta, tabularNums, { color: theme.textSecondary }]}>
            {`${totals.receivable.invoices} invoice${totals.receivable.invoices === 1 ? '' : 's'} · ${totals.receivable.customers} customer${totals.receivable.customers === 1 ? '' : 's'}`}
          </Text>
        </Card>
      </View>

      <Pressable onPress={onBrowseYears} style={[styles.browseCard, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
        <View style={[styles.browseIcon, { backgroundColor: theme.draftWash }]}>
          <Icon name="calendar" size={20} color={theme.textSecondary} />
        </View>
        <View style={styles.browseTextWrap}>
          <Text style={[styles.browseTitle, { color: theme.textPrimary }]}>Browse by fiscal year</Text>
          <Text style={[styles.browseMeta, tabularNums, { color: theme.textSecondary }]}>
            {`Bank · journal · expenses · ${totals.fiscalYears} year${totals.fiscalYears === 1 ? '' : 's'}`}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} color={theme.textSecondary} />
      </Pressable>

      <View style={styles.expensesHeader}>
        <Text style={[styles.expensesTitle, { color: theme.textSecondary }]}>Expenses · this month</Text>
        <Text style={[styles.expensesTotal, tabularNums, { color: theme.textPrimary }]}>{lakh(expenseSum)}</Text>
      </View>

      {expenses.map((e) => {
        const cat = expenseCategory(e.category);
        return (
          <View key={e.id} style={[styles.expenseRow, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
            <View style={[styles.expenseTag, { backgroundColor: cat.bg }]}>
              <Text style={[styles.expenseTagText, { color: cat.fg }]}>{cat.tag}</Text>
            </View>
            <View style={styles.expenseTextWrap}>
              <Text style={[styles.expenseName, { color: theme.textPrimary }]} numberOfLines={1}>
                {e.name}
              </Text>
              <Text style={[styles.expenseMeta, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                {e.note}
              </Text>
            </View>
            <View style={styles.expenseRight}>
              <Text style={[styles.expenseAmount, tabularNums, { color: theme.textPrimary }]}>{rupees(e.amountNPR)}</Text>
              <View style={[styles.statusPill, { backgroundColor: e.status === 'Paid' ? theme.accentWash : theme.dangerWash }]}>
                <Text style={[styles.statusPillText, { color: e.status === 'Paid' ? theme.accentWashText : theme.dangerWashText }]}>
                  {e.status}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  marginCard: { padding: 17, gap: 14 },
  marginTopRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 },
  gap6: { gap: 6 },
  gap5: { gap: 5 },
  alignEnd: { alignItems: 'flex-end' },
  eyebrow: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  baselineRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  marginValue: { fontFamily: fontFamily.semibold, fontSize: 34, letterSpacing: -0.03 * 34 },
  marginDelta: { fontSize: 13, fontWeight: '600' },
  netValue: { fontSize: 17, fontWeight: '600' },
  marginChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 44 },
  marginBarWrap: { flex: 1, justifyContent: 'flex-end', height: '100%' },
  marginBar: { borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  marginLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  marginLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.08 * 9.5, textTransform: 'uppercase' },
  pairRow: { flexDirection: 'row', gap: 10 },
  pairCard: { flex: 1, padding: 15, gap: 9, borderLeftWidth: 4 },
  pairLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },
  pairValue: { fontFamily: fontFamily.semibold, fontSize: 26, letterSpacing: -0.03 * 26 },
  pairPill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 22, paddingHorizontal: 8, borderRadius: 999, alignSelf: 'flex-start' },
  pairDot: { width: 5, height: 5, borderRadius: 99 },
  pairPillText: { fontSize: 11, fontWeight: '600' },
  pairMeta: { fontFamily: fontFamily.mono, fontSize: 10 },
  browseCard: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 18, padding: 15 },
  browseIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  browseTextWrap: { flex: 1, gap: 3, minWidth: 0 },
  browseTitle: { fontSize: 15, fontWeight: '600' },
  browseMeta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  expensesHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 6 },
  expensesTitle: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.12 * 10.5, textTransform: 'uppercase' },
  expensesTotal: { fontFamily: fontFamily.mono, fontSize: 11 },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14 },
  expenseTag: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  expenseTagText: { fontFamily: fontFamily.mono, fontSize: 11, letterSpacing: 0.04 * 11 },
  expenseTextWrap: { flex: 1, gap: 4, minWidth: 0 },
  expenseName: { fontSize: 14.5, fontWeight: '600' },
  expenseMeta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  expenseRight: { alignItems: 'flex-end', gap: 4 },
  expenseAmount: { fontSize: 15, fontWeight: '600' },
  statusPill: { height: 22, paddingHorizontal: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  statusPillText: { fontSize: 11, fontWeight: '600' },
});
