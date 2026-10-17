import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { PurchaseFilter } from '@/data/purchases/types';

export interface ListSummaryProps {
  /** NPR. */
  monthTotal: number;
  /** NPR. */
  unpaidTotal: number;
  cashShare: string;
  filters: { id: PurchaseFilter; label: string; count: number }[];
  activeFilter: PurchaseFilter;
  onFilterChange: (f: PurchaseFilter) => void;
  search: string;
  onSearchChange: (v: string) => void;
  /** Hide the "spend this month" hero card (Finance's Purchases tab has its own KPIs). */
  showSummary?: boolean;
  /** `false` when the parent already pads the sides — see `PurchasesPane`. */
  inset?: boolean;
}

export function ListSummary({
  monthTotal,
  unpaidTotal,
  cashShare,
  filters,
  activeFilter,
  onFilterChange,
  search,
  onSearchChange,
  showSummary = true,
  inset = true,
}: ListSummaryProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, inset && styles.wrapInset]}>
      {showSummary ? (
        <Card elevation="hero" style={styles.summaryCard}>
          <View style={styles.gap5}>
            <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Spend this month</Text>
            <Money npr={monthTotal} compact hero size={28} primaryStyle={styles.monthValue} />
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Money npr={unpaidTotal} compact hero size={16} align="right" primaryStyle={{ color: theme.onHero.dangerWashText }} />
              <Text style={[styles.statLabel, { color: theme.onHero.textMuted }]}>Unpaid</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, tabularNums, { color: theme.onHero.accent }]}>{cashShare}</Text>
              <Text style={[styles.statLabel, { color: theme.onHero.textMuted }]}>Cash</Text>
            </View>
          </View>
        </Card>
      ) : null}

      <TextField value={search} onChangeText={onSearchChange} placeholder="Search party, category or EXP id" />

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
              <Text style={[styles.chipCount, tabularNums, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{f.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    paddingBottom: 12,
  },
  wrapInset: { paddingHorizontal: 20 },
  summaryCard: { padding: 17, gap: 14, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  gap5: { gap: 5 },
  eyebrow: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  monthValue: { fontFamily: fontFamily.semibold, fontSize: 28, letterSpacing: -0.025 * 28, lineHeight: 28 },
  statsRow: { flexDirection: 'row', gap: 16 },
  statCell: { alignItems: 'flex-end', gap: 3 },
  statValue: { fontSize: 16, fontWeight: '600', lineHeight: 16 },
  statLabel: { fontFamily: fontFamily.mono, fontSize: 9.5, letterSpacing: 0.1 * 9.5, textTransform: 'uppercase' },
  chipsRow: { gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  chipCount: { fontFamily: fontFamily.mono, fontSize: 10.5, opacity: 0.85 },
});
