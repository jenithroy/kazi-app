import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Money } from '@/components/ui/money';
import { moneyDigits, useMoneySignature } from '@/lib/money';
import { SegmentedProportionBar } from '@/components/ui/segmented-proportion-bar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { costTotal } from '@/data/inventory/utils';
import type { ItemCost, StockItem } from '@/data/inventory/types';

export interface CostRow {
  cost: ItemCost;
  /** The stock item this code belongs to, when one matches. */
  item: StockItem | null;
}

export interface ItemCostsViewProps {
  rows: CostRow[];
  query: string;
}

/** The five cost components, in the order the reference sheet lists them. */
const PARTS = [
  { key: 'fabric', label: 'Fabric' },
  { key: 'labour', label: 'Labour' },
  { key: 'rib', label: 'Rib' },
  { key: 'trims', label: 'Trims' },
  { key: 'others', label: 'Others' },
] as const;

export function ItemCostsView({ rows, query }: ItemCostsViewProps) {
  const theme = useTheme();
  // The breakdown figures come from a plain formatter, so subscribe to the currency.
  useMoneySignature();

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="search"
        title={query ? 'Nothing matches' : 'No costed items yet'}
        message={
          query
            ? 'Try a shorter search.'
            : 'Item costs are entered on the web app — the breakdown for each product code shows up here.'
        }
      />
    );
  }

  const palette = [theme.accent, theme.warning, theme.danger, theme.draftDot, theme.textSecondary];

  return (
    <View style={styles.wrap}>
      {rows.map(({ cost, item }, index) => {
        const total = costTotal(cost);
        const parts = PARTS.map((p, i) => ({ ...p, value: cost[p.key], color: palette[i] })).filter((p) => p.value > 0);
        const stockValue = item ? item.qty * total : 0;

        return (
          <Animated.View key={cost.code} entering={FadeInUp.delay(Math.min(index, 8) * 25).duration(200)}>
            <Card>
              <View style={styles.body}>
                <View style={styles.head}>
                  <View style={styles.headText}>
                    <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={2}>
                      {cost.name || item?.name || cost.code}
                    </Text>
                    <Text style={[styles.code, tabularNums, { color: theme.textSecondary }]}>{cost.code}</Text>
                  </View>
                  <View style={styles.totalWrap}>
                    <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Cost / unit</Text>
                    <Money npr={total} size={17} />
                  </View>
                </View>

                {parts.length > 0 ? (
                  <SegmentedProportionBar segments={parts.map((p) => ({ weight: p.value, color: p.color }))} height={9} />
                ) : null}

                <View style={styles.parts}>
                  {parts.map((p) => (
                    <View key={p.key} style={styles.part}>
                      <View style={[styles.dot, { backgroundColor: p.color }]} />
                      <Text style={[styles.partLabel, { color: theme.textSecondary }]}>{p.label}</Text>
                      <Text style={[styles.partValue, tabularNums, { color: theme.textPrimary }]}>
                        {moneyDigits(p.value)}
                      </Text>
                    </View>
                  ))}
                </View>

                {item ? (
                  <View style={[styles.stockLine, { borderTopColor: theme.border }]}>
                    <Text style={[styles.stockLabel, { color: theme.textSecondary }]}>
                      {item.qty.toLocaleString()} {item.unit} on hand
                    </Text>
                    <Money npr={stockValue} compact size={13.5} primaryStyle={{ color: theme.textPrimary }} />
                  </View>
                ) : (
                  <View style={[styles.stockLine, { borderTopColor: theme.border }]}>
                    <Text style={[styles.stockLabel, { color: theme.textSecondary }]}>Not linked to a stock item</Text>
                  </View>
                )}
              </View>
            </Card>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  body: { padding: 15, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headText: { flex: 1, gap: 3, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 15.5, letterSpacing: -0.01 * 15.5 },
  code: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  totalWrap: { alignItems: 'flex-end', gap: 3 },
  totalLabel: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.1 * 9, textTransform: 'uppercase' },
  parts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  part: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 99 },
  partLabel: { fontSize: 12 },
  partValue: { fontFamily: fontFamily.mono, fontSize: 12 },
  stockLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  stockLabel: { fontSize: 12.5 },
});
