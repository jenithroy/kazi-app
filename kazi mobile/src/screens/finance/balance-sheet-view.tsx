import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { BalanceSheet, BalanceSheetGroup } from '@/data/finance/pnl';
import { money, useMoneySignature } from '@/lib/money';

export interface BalanceSheetViewProps {
  sheet: BalanceSheet;
}

const npr = (n: number) => money(n, { grouping: 'en-IN' });

export function BalanceSheetView({ sheet }: BalanceSheetViewProps) {
  const theme = useTheme();
  // These figures come from plain formatters, so the view subscribes to the currency itself.
  useMoneySignature();
  const balanced = Math.abs(sheet.check) < 1;

  return (
    <View style={styles.wrap}>
      <Group title="Assets" group={sheet.assets} theme={theme} />
      <Group title="Liabilities" group={sheet.liabilities} theme={theme} />
      <Group title="Equity" group={sheet.equity} theme={theme} />

      <Card elevation="raised" style={styles.checkCard}>
        <View style={styles.checkRow}>
          <Text style={[styles.checkLabel, { color: theme.textSecondary }]}>Assets</Text>
          <Text style={[styles.checkValue, tabularNums, { color: theme.textPrimary }]}>{npr(sheet.assets.total)}</Text>
        </View>
        <View style={styles.checkRow}>
          <Text style={[styles.checkLabel, { color: theme.textSecondary }]}>Liabilities + Equity</Text>
          <Text style={[styles.checkValue, tabularNums, { color: theme.textPrimary }]}>{npr(sheet.liabPlusEquity)}</Text>
        </View>
        <View style={[styles.checkResult, { backgroundColor: balanced ? theme.accentWash : theme.warningWash }]}>
          <Text style={[styles.checkResultText, { color: balanced ? theme.accentWashText : theme.warningWashText }]}>
            {balanced ? 'Balanced' : `Out by ${npr(Math.abs(sheet.check))} · mock data not fully double-entered`}
          </Text>
        </View>
      </Card>
    </View>
  );
}

function Group({ title, group, theme }: { title: string; group: BalanceSheetGroup; theme: ReturnType<typeof useTheme> }) {
  return (
    <Card elevation="raised" style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{title}</Text>
      {group.lines.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>No balances</Text>
      ) : (
        group.lines.map((l) => (
          <View key={l.name} style={styles.row}>
            <Text style={[styles.rowName, { color: theme.textPrimary }]} numberOfLines={1}>
              {l.name}
            </Text>
            <Text style={[styles.rowValue, tabularNums, { color: l.balance < 0 ? theme.dangerWashText : theme.textPrimary }]}>
              {npr(l.balance)}
            </Text>
          </View>
        ))
      )}
      <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
        <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Total {title.toLowerCase()}</Text>
        <Text style={[styles.totalValue, tabularNums, { color: theme.textPrimary }]}>{npr(group.total)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  section: { padding: 16, gap: 8 },
  sectionTitle: { fontFamily: fontFamily.semibold, fontSize: 15 },
  empty: { fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  rowName: { flex: 1, fontSize: 13, minWidth: 0 },
  rowValue: { fontSize: 12.5, fontFamily: fontFamily.mono, flexShrink: 0 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderTopWidth: 1.5, paddingTop: 8, marginTop: 3 },
  totalLabel: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.08 * 10, textTransform: 'uppercase' },
  totalValue: { fontSize: 13.5, fontWeight: '700', fontFamily: fontFamily.mono },
  checkCard: { padding: 16, gap: 9 },
  checkRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  checkLabel: { fontSize: 13 },
  checkValue: { fontSize: 13, fontFamily: fontFamily.mono, fontWeight: '600' },
  checkResult: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 2 },
  checkResultText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
