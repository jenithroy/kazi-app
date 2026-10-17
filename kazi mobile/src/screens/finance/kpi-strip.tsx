import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Money } from '@/components/ui/money';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';

export interface KpiStripProps {
  payrollMTD: number;
  totalExpenses: number;
  totalPurchases: number;
  netProfit: number;
  onPressPayroll: () => void;
  onPressPurchases: () => void;
}

export function KpiStrip({ payrollMTD, totalExpenses, totalPurchases, netProfit, onPressPayroll, onPressPurchases }: KpiStripProps) {
  const theme = useTheme();

  const cards: { label: string; value: number; onPress?: () => void; tone?: 'profit' }[] = [
    { label: 'Payroll MTD', value: payrollMTD, onPress: onPressPayroll },
    { label: 'Total expenses', value: totalExpenses },
    { label: 'Total purchases', value: totalPurchases, onPress: onPressPurchases },
    { label: 'Net profit / loss', value: netProfit, tone: 'profit' },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {cards.map((c) => {
        const profitColor = c.tone === 'profit' ? (c.value >= 0 ? theme.accentWashText : theme.dangerWashText) : theme.textPrimary;
        const Wrapper: typeof Pressable | typeof View = c.onPress ? Pressable : View;
        return (
          <Wrapper
            key={c.label}
            onPress={c.onPress}
            style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderColor: theme.border }]}
          >
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              {c.label}
              {c.onPress ? '  ↗' : ''}
            </Text>
            <Money npr={c.value} compact size={18} primaryStyle={{ color: profitColor }} />
          </Wrapper>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingHorizontal: 20, paddingBottom: 4 },
  card: { minWidth: 148, borderRadius: 16, borderWidth: 1, padding: 13, gap: 7 },
  label: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.11 * 9.5, textTransform: 'uppercase' },
});
