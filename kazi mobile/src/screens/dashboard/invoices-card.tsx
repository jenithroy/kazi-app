import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { SegmentedProportionBar } from '@/components/ui/segmented-proportion-bar';
import { useTheme } from '@/theme/theme-provider';
import { tabularNums } from '@/theme';

import { DashboardCard } from './dashboard-card';

export interface InvoicesCardProps {
  counts: { paid: number; partial: number; overdue: number; draft: number };
}

/** Invoices split by status — shared by the Owner and Accountant variants. */
export function InvoicesCard({ counts }: InvoicesCardProps) {
  const theme = useTheme();

  const rows = [
    { key: 'paid', label: 'Paid', value: counts.paid, color: theme.accent },
    { key: 'partial', label: 'Partial', value: counts.partial, color: theme.warningWashText },
    { key: 'overdue', label: 'Overdue', value: counts.overdue, color: theme.danger },
    { key: 'draft', label: 'Draft', value: counts.draft, color: theme.draftDot },
  ];
  const total = rows.reduce((n, r) => n + r.value, 0);

  return (
    <DashboardCard title="Invoices by status" meta={`${total} total`} onPress={() => router.push('/billing')}>
      <SegmentedProportionBar segments={rows.map((r) => ({ weight: r.value, color: r.color }))} height={8} />
      <View style={styles.legend}>
        {rows.map((r) => (
          <View key={r.key} style={styles.legendCell}>
            <Text style={[styles.legendValue, tabularNums, { color: theme.textPrimary }]}>{r.value}</Text>
            <View style={styles.legendLabelRow}>
              <View style={[styles.dot, { backgroundColor: r.color }]} />
              <Text style={[styles.legendLabel, { color: theme.textSecondary }]}>{r.label}</Text>
            </View>
          </View>
        ))}
      </View>
    </DashboardCard>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendCell: {
    flexBasis: '22%',
    flexGrow: 1,
    gap: 5,
  },
  legendValue: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.02 * 22,
  },
  legendLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 99,
  },
  legendLabel: {
    fontSize: 11.5,
  },
});
