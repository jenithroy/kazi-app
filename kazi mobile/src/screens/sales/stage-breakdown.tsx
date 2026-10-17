import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { SegmentedProportionBar } from '@/components/ui/segmented-proportion-bar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { STAGES } from '@/data/sales/mock';
import type { Order } from '@/data/sales/types';

export interface StageBreakdownProps {
  orders: Order[];
}

/** Where the pipeline sits right now — proportions first (bar), counts second (rows), off the stage chain. */
export function StageBreakdown({ orders }: StageBreakdownProps) {
  const theme = useTheme();

  const rows = STAGES.map((s) => {
    const inStage = orders.filter((o) => o.stage === s.id);
    return {
      stage: s,
      count: inStage.length,
      pcs: inStage.reduce((n, o) => n + o.qty, 0),
    };
  });

  return (
    <Card elevation="raised" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Orders by stage</Text>
        <Text style={[styles.total, tabularNums, { color: theme.textSecondary }]}>{orders.length} total</Text>
      </View>

      <SegmentedProportionBar
        segments={rows.map((r) => ({ weight: Math.max(r.count, 0.08), color: r.count ? r.stage.bar : theme.draftWash }))}
      />

      <View>
        {rows.map((r, i) => (
          <View
            key={r.stage.id}
            style={[styles.row, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
          >
            <View style={[styles.dot, { backgroundColor: r.stage.dot }]} />
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{r.stage.label}</Text>
            <Text style={[styles.rowPcs, tabularNums, { color: theme.textSecondary }]}>
              {r.pcs ? `${r.pcs.toLocaleString()} ${r.pcs === 1 ? 'pc' : 'pcs'}` : '—'}
            </Text>
            <Text style={[styles.rowCount, tabularNums, { color: theme.textPrimary }]}>{r.count}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontFamily: fontFamily.semibold, fontSize: 15 },
  total: { fontFamily: fontFamily.mono, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  dot: { width: 9, height: 9, borderRadius: 3, flexShrink: 0 },
  rowLabel: { flex: 1, fontSize: 14 },
  rowPcs: { fontFamily: fontFamily.mono, fontSize: 10.5, flexShrink: 0 },
  rowCount: { width: 28, textAlign: 'right', fontSize: 14, fontWeight: '600', flexShrink: 0 },
});
