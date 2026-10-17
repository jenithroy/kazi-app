import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { DualDate } from '@/components/ui/dual-date';
import { EmptyState } from '@/components/ui/empty-state';
import { Money } from '@/components/ui/money';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { expenseCategory } from '@/data/finance/mock';
import type { Expense } from '@/data/finance/types';

export type ExpensesFilter = 'all' | 'unpaid' | 'has-vat' | 'no-vat';

export interface ExpensesViewProps {
  expenses: Expense[];
  filter: ExpensesFilter;
  onFilterChange: (f: ExpensesFilter) => void;
  canEdit: boolean;
  onTogglePaid: (e: Expense) => void;
  onDelete: (e: Expense) => void;
  /** VAT bill exists → jump to the VAT Bills tab focused on this expense. */
  onViewBill: (e: Expense) => void;
  /** No VAT bill yet → open the upload sheet for this expense. */
  onAttachBill: (e: Expense) => void;
}

export function ExpensesView({
  expenses,
  filter,
  onFilterChange,
  canEdit,
  onTogglePaid,
  onDelete,
  onViewBill,
  onAttachBill,
}: ExpensesViewProps) {
  const theme = useTheme();

  const rows = expenses.filter((e) => {
    if (filter === 'unpaid') return e.status === 'Unpaid';
    if (filter === 'has-vat') return e.vatBill;
    if (filter === 'no-vat') return !e.vatBill;
    return true;
  });

  const total = rows.reduce((n, e) => n + e.amountNPR, 0);
  const unpaid = expenses.filter((e) => e.status === 'Unpaid').length;

  const filters: { id: ExpensesFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: expenses.length },
    { id: 'unpaid', label: 'Unpaid', count: unpaid },
    { id: 'has-vat', label: 'VAT bill', count: expenses.filter((e) => e.vatBill).length },
    { id: 'no-vat', label: 'No bill', count: expenses.filter((e) => !e.vatBill).length },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.chipsRow}>
        {filters.map((f) => {
          const on = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => onFilterChange(f.id)}
              style={[styles.chip, { backgroundColor: on ? theme.selectedSurface : theme.surface, borderColor: on ? theme.selectedBorder : theme.border }]}
            >
              <Text style={[styles.chipLabel, { color: on ? theme.selectedText : theme.textPrimary }]}>{f.label}</Text>
              <Text style={[styles.chipCount, tabularNums, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{f.count}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.totalRow}>
        <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
          {rows.length} {rows.length === 1 ? 'expense' : 'expenses'}
        </Text>
        <Money npr={total} compact inline size={12} />
      </View>

      {rows.length === 0 ? (
        <EmptyState icon="shopping-bag" title="Nothing here" message="Clear the filter to see every expense this month." />
      ) : (
        rows.map((e, i) => {
          const cat = expenseCategory(e.category);
          const paid = e.status === 'Paid';
          return (
            <Animated.View key={e.id} entering={FadeInUp.delay(Math.min(i, 6) * 25).duration(200)}>
              <Pressable
                onLongPress={canEdit ? () => onDelete(e) : undefined}
                style={[styles.row, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}
              >
                <View style={[styles.tag, { backgroundColor: cat.bg }]}>
                  <Text style={[styles.tagText, { color: cat.fg }]}>{cat.tag}</Text>
                </View>

                <View style={styles.textWrap}>
                  <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <DualDate iso={e.date} inline size={10} bsStyle="numeric" />
                  <View style={styles.metaRow}>
                    <Pressable
                      onPress={() => (e.vatBill ? onViewBill(e) : canEdit ? onAttachBill(e) : undefined)}
                      style={[styles.vatChip, { backgroundColor: e.vatBill ? theme.accentWash : theme.draftWash, borderColor: e.vatBill ? 'transparent' : theme.border }]}
                    >
                      <Text style={[styles.vatChipText, { color: e.vatBill ? theme.accentWashText : theme.textSecondary }]}>
                        {e.vatBill ? 'VAT bill ↗' : canEdit ? '+ VAT bill' : 'No VAT bill'}
                      </Text>
                    </Pressable>
                    <Text style={[styles.loggedBy, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                      {e.loggedBy}
                    </Text>
                  </View>
                </View>

                <View style={styles.right}>
                  <Money npr={e.amountNPR} size={15} align="right" />
                  <Pressable
                    onPress={canEdit ? () => onTogglePaid(e) : undefined}
                    style={[styles.statusPill, { backgroundColor: paid ? theme.accentWash : theme.dangerWash }]}
                  >
                    <Text style={[styles.statusPillText, { color: paid ? theme.accentWashText : theme.dangerWashText }]}>{e.status}</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Animated.View>
          );
        })
      )}

      {canEdit && rows.length > 0 ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>Tap the status to mark paid · long-press a row to delete</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  chipCount: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 },
  totalLabel: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.12 * 10.5, textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 12, borderRadius: 16, padding: 13 },
  tag: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tagText: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.04 * 10.5 },
  textWrap: { flex: 1, gap: 4, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vatChip: { height: 21, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  vatChipText: { fontSize: 10.5, fontWeight: '600' },
  loggedBy: { fontFamily: fontFamily.mono, fontSize: 10, flexShrink: 1 },
  right: { alignItems: 'flex-end', gap: 5, flexShrink: 0 },
  statusPill: { height: 22, paddingHorizontal: 9, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  statusPillText: { fontSize: 11, fontWeight: '600' },
  hint: { fontSize: 11, textAlign: 'center', paddingTop: 2 },
});
