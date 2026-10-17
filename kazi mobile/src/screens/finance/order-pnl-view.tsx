import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Money } from '@/components/ui/money';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { OrderPnlRow, OrderPnlSummary } from '@/data/finance/order-pnl';
import { money, useMoneySignature } from '@/lib/money';

export type OrderPnlFilter = 'all' | 'active' | 'delivered';

export interface OrderPnlViewProps {
  rows: OrderPnlRow[];
  summary: OrderPnlSummary;
  labourRate: number | null;
  filter: OrderPnlFilter;
  filterCounts: Record<OrderPnlFilter, number>;
  onFilterChange: (f: OrderPnlFilter) => void;
  canEdit: boolean;
  onOpenCosts: (row: OrderPnlRow) => void;
}

const npr0 = (n: number) => money(n, { grouping: 'en-IN' });

export function OrderPnlView({ rows, summary, labourRate, filter, filterCounts, onFilterChange, canEdit, onOpenCosts }: OrderPnlViewProps) {
  const theme = useTheme();
  // Figures come from a plain formatter, so subscribe to the currency.
  useMoneySignature();

  const kpis: { label: string; value: number; margin?: boolean }[] = [
    { label: 'Total revenue', value: summary.revenue },
    { label: 'Total costs', value: summary.cost },
    { label: 'Total profit', value: summary.profit },
    { label: 'Avg margin', value: summary.avgMargin ?? 0, margin: true },
  ];

  const filters: { id: OrderPnlFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'delivered', label: 'Delivered' },
  ];

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiRow}>
        {kpis.map((k) => {
          const isProfit = k.label === 'Total profit' || k.margin;
          const color = isProfit ? (k.value >= 0 ? theme.accentWashText : theme.dangerWashText) : theme.textPrimary;
          return (
            <View key={k.label} style={[styles.kpiCard, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderColor: theme.border }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>{k.label}</Text>
              {k.margin ? (
                <Text style={[styles.kpiMargin, tabularNums, { color }]}>{summary.avgMargin != null ? `${summary.avgMargin.toFixed(1)}%` : '—'}</Text>
              ) : (
                <Money npr={k.value} compact size={17} primaryStyle={{ color }} />
              )}
              {k.margin ? (
                <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>{summary.withCostCount} with cost data</Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {labourRate ? (
        <Card elevation="flat" style={[styles.banner, { backgroundColor: theme.accentWash, borderColor: 'transparent' }]}>
          <Text style={[styles.bannerText, { color: theme.accentWashText }]}>
            ⚡ Auto labour rate {npr0(labourRate)}/unit
          </Text>
          <Text style={[styles.bannerSub, { color: theme.accentWashText }]}>
            last month’s production payroll ÷ units passed — override per order with a manual labour cost
          </Text>
        </Card>
      ) : null}

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
              <Text style={[styles.chipCount, tabularNums, { color: on ? theme.selectedTextMuted : theme.textSecondary }]}>{filterCounts[f.id]}</Text>
            </Pressable>
          );
        })}
      </View>

      {rows.length === 0 ? (
        <EmptyState icon="bar-chart-2" title="No orders" message="Orders from Sales appear here once created." />
      ) : (
        rows.map((r, i) => {
          const delivered = r.order.stage === 'delivered';
          return (
            <Animated.View key={r.order.id} entering={FadeInUp.delay(Math.min(i, 6) * 25).duration(200)}>
              <Pressable
                onPress={canEdit ? () => onOpenCosts(r) : undefined}
                style={[styles.row, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}
              >
                <View style={styles.rowHead}>
                  <View style={styles.rowHeadText}>
                    <Text style={[styles.ref, tabularNums, { color: theme.textSecondary }]}>{r.order.ref}</Text>
                    <Text style={[styles.customer, { color: theme.textPrimary }]} numberOfLines={1}>
                      {r.order.customer}
                    </Text>
                  </View>
                  <View style={[styles.stagePill, { backgroundColor: delivered ? theme.accentWash : theme.draftWash }]}>
                    <Text style={[styles.stagePillText, { color: delivered ? theme.accentWashText : theme.draftWashText }]}>
                      {delivered ? 'Delivered' : 'Active'}
                    </Text>
                  </View>
                </View>

                <View style={styles.metricRow}>
                  <Metric label={`Revenue · ${r.order.qty.toLocaleString('en-IN')} pcs`} theme={theme}>
                    <Money npr={r.revenue} size={13} secondary={false} />
                  </Metric>
                  <Metric label="Total cost" theme={theme}>
                    <Text style={[styles.metricVal, tabularNums, { color: r.hasCosts ? theme.textPrimary : theme.textSecondary }]}>
                      {r.hasCosts ? npr0(r.totalCost) : '—'}
                      {r.labourIsAuto ? <Text style={{ color: theme.accentWashText }}> ⚡</Text> : null}
                    </Text>
                  </Metric>
                </View>

                <View style={[styles.footer, { borderTopColor: theme.border }]}>
                  {r.hasCosts ? (
                    <>
                      <Text style={[styles.profit, tabularNums, { color: r.profit >= 0 ? theme.accentWashText : theme.dangerWashText }]}>
                        {r.profit >= 0 ? '+' : '−'}
                        {npr0(Math.abs(r.profit))}
                      </Text>
                      <MarginPill margin={r.margin} theme={theme} />
                    </>
                  ) : (
                    <Text style={[styles.noCosts, { color: theme.textSecondary }]}>No costs entered</Text>
                  )}
                  <Text style={[styles.cta, { color: theme.accentWashText }]}>
                    {canEdit ? (r.hasCosts ? 'Edit costs →' : 'Add costs →') : ''}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          );
        })
      )}

      {canEdit && rows.length > 0 ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>Tap an order to enter its cost breakdown</Text>
      ) : null}
    </View>
  );
}

function Metric({ label, theme, children }: { label: string; theme: ReturnType<typeof useTheme>; children: React.ReactNode }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: theme.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function MarginPill({ margin, theme }: { margin: number | null; theme: ReturnType<typeof useTheme> }) {
  if (margin == null) {
    return (
      <View style={[styles.marginPill, { backgroundColor: theme.draftWash }]}>
        <Text style={[styles.marginPillText, { color: theme.draftWashText }]}>—</Text>
      </View>
    );
  }
  const good = margin >= 20;
  const ok = margin >= 0;
  const bg = good ? theme.accentWash : ok ? theme.draftWash : theme.dangerWash;
  const fg = good ? theme.accentWashText : ok ? theme.draftWashText : theme.dangerWashText;
  return (
    <View style={[styles.marginPill, { backgroundColor: bg }]}>
      <Text style={[styles.marginPillText, tabularNums, { color: fg }]}>{margin.toFixed(1)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  kpiRow: { gap: 10, paddingBottom: 2 },
  kpiCard: { minWidth: 140, borderRadius: 16, borderWidth: 1, padding: 12, gap: 6 },
  kpiLabel: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.11 * 9, textTransform: 'uppercase' },
  kpiMargin: { fontFamily: fontFamily.semibold, fontSize: 17 },
  kpiSub: { fontSize: 10 },
  banner: { padding: 12, gap: 3 },
  bannerText: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  bannerSub: { fontSize: 10.5, opacity: 0.85 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  chipCount: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  row: { borderRadius: 16, padding: 13, gap: 10 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowHeadText: { flex: 1, minWidth: 0, gap: 2 },
  ref: { fontFamily: fontFamily.mono, fontSize: 10 },
  customer: { fontSize: 14, fontWeight: '600' },
  stagePill: { height: 21, paddingHorizontal: 9, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  stagePillText: { fontSize: 10.5, fontWeight: '600' },
  metricRow: { flexDirection: 'row', gap: 14 },
  metric: { flex: 1, gap: 2, minWidth: 0 },
  metricLabel: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.08 * 9, textTransform: 'uppercase' },
  metricVal: { fontSize: 13, fontFamily: fontFamily.mono, fontWeight: '600' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 9 },
  profit: { fontSize: 13, fontFamily: fontFamily.mono, fontWeight: '700' },
  noCosts: { flex: 1, fontSize: 11.5 },
  marginPill: { height: 20, paddingHorizontal: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  marginPillText: { fontSize: 10.5, fontWeight: '700' },
  cta: { marginLeft: 'auto', fontSize: 11, fontWeight: '600' },
  hint: { fontSize: 11, textAlign: 'center', paddingTop: 2 },
});
