import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Money } from '@/components/ui/money';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';

export interface AccountingKpisProps {
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  entryCount: number;
}

/**
 * The four summary stat cards from the reference `Accounting.jsx` — Total
 * Income / Total Expenses / Net Profit-Loss / Journal entry count. Sits above
 * the shared Finance tab strip when it renders in `variant="accounting"`.
 */
export function AccountingKpis({ totalIncome, totalExpenses, netProfit, entryCount }: AccountingKpisProps) {
  const theme = useTheme();
  const profitColor = netProfit >= 0 ? theme.accentWashText : theme.dangerWashText;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Total income</Text>
        <Money npr={totalIncome} compact size={18} />
      </View>
      <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Total expenses</Text>
        <Money npr={totalExpenses} compact size={18} />
      </View>
      <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Net {netProfit >= 0 ? 'profit' : 'loss'}</Text>
        <Money npr={Math.abs(netProfit)} compact size={18} primaryStyle={{ color: profitColor }} />
      </View>
      <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Journal entries</Text>
        <Text style={[styles.count, tabularNums, { color: theme.textPrimary }]}>{entryCount}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingHorizontal: 20, paddingBottom: 4 },
  card: { minWidth: 148, borderRadius: 16, borderWidth: 1, padding: 13, gap: 7 },
  label: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },
  count: { fontFamily: fontFamily.semibold, fontSize: 18 },
});
