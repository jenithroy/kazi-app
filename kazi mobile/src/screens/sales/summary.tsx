import { StyleSheet, View } from 'react-native';

import { KpiCard } from '@/components/ui/kpi-card';
import type { Order } from '@/data/sales/types';
import { isOpen, lakh } from '@/data/sales/utils';

export interface SummaryProps {
  orders: Order[];
}

const NOW = new Date();
/** Current calendar month, short label — used for the "delivered this month" KPI. */
const THIS_MONTH = NOW.toLocaleDateString('en-US', { month: 'short' });
/** The same month as `YYYY-MM`, so next year's September is not this one. */
const THIS_MONTH_KEY = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`;

/** Read-only KPI row for the Sales overview: pipeline value, active vs completed, delivered this month. */
export function Summary({ orders }: SummaryProps) {
  // `isOpen` drops cancelled orders too — a cancelled order's value is not
  // pipeline, and counting it inflated the tile by its whole contract.
  const active = orders.filter(isOpen);
  const delivered = orders.filter((o) => o.stage === 'delivered');

  const pipelineValue = active.reduce((n, o) => n + o.value, 0);
  const activePcs = active.reduce((n, o) => n + o.qty, 0);
  const stagesWithWork = new Set(active.map((o) => o.stage)).size;
  const deliveredThisMonth = delivered.filter((o) => o.deliveryDate.slice(0, 7) === THIS_MONTH_KEY).length;

  return (
    <View style={styles.grid}>
      <View style={styles.cell}>
        <KpiCard
          label="Pipeline value"
          value={lakh(pipelineValue)}
          context={`${activePcs.toLocaleString()} pcs in production`}
          inverted
        />
      </View>
      <View style={styles.cell}>
        <KpiCard
          label="Live orders"
          value={String(active.length)}
          context={`across ${stagesWithWork} ${stagesWithWork === 1 ? 'stage' : 'stages'}`}
        />
      </View>
      <View style={styles.cell}>
        <KpiCard label="Completed" value={String(delivered.length)} context="delivered to date" />
      </View>
      <View style={styles.cell}>
        <KpiCard
          label={`Delivered · ${THIS_MONTH}`}
          value={String(deliveredThisMonth)}
          context="this month"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '47%', flexGrow: 1 },
});
