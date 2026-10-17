import { StyleSheet, View } from 'react-native';

import { KpiCard } from '@/components/ui/kpi-card';
import type { Order } from '@/data/sales/types';
import { isOpen, priorityOf } from '@/data/sales/utils';

export interface PipelineSummaryProps {
  orders: Order[];
}

/**
 * `shipDays` is 0 both for "due today" and for an order with no delivery date
 * at all, so the empty `ship` label is what actually separates them. Live data
 * leaves `delivery_date` null on most rows, hence the "n of m dated" context
 * under the two date-driven cards — a 0 there means "nothing dated is due",
 * not "nothing is due".
 */
function isDated(order: Order): boolean {
  return order.ship !== '' && order.ship !== '—';
}

export function PipelineSummary({ orders }: PipelineSummaryProps) {
  const open = orders.filter(isOpen);
  const dated = open.filter(isDated);

  const units = open.reduce((sum, o) => sum + o.qty, 0);
  const dueThisWeek = dated.filter((o) => o.shipDays >= 0 && o.shipDays <= 7).length;
  const overdue = dated.filter((o) => o.shipDays < 0).length;
  const urgent = open.filter((o) => priorityOf(o) === 'urgent').length;

  const datedContext = `${dated.length} of ${open.length} dated`;

  return (
    <View style={styles.grid}>
      <View style={styles.cell}>
        {/* "Live", not "Active": this counts everything still in the pipeline,
            On Hold included, so it is deliberately not the dashboard's
            "Active orders" figure. */}
        <KpiCard
          label="Live orders"
          value={`${open.length}`}
          delta={urgent ? { tone: 'warning', text: `${urgent} urgent` } : undefined}
        />
      </View>
      <View style={styles.cell}>
        <KpiCard label="Units in pipeline" value={units.toLocaleString('en-US')} context="pieces across all stages" />
      </View>
      <View style={styles.cell}>
        <KpiCard label="Due this week" value={`${dueThisWeek}`} context={datedContext} />
      </View>
      <View style={styles.cell}>
        <KpiCard
          label="Overdue"
          value={`${overdue}`}
          delta={overdue ? { tone: 'bad', text: 'past delivery date' } : { tone: 'good', text: 'none late' }}
          context={datedContext}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cell: {
    width: '47%',
    flexGrow: 1,
  },
});
