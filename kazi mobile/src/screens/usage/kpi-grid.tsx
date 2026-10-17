import { StyleSheet, View } from 'react-native';

import { KpiCard } from '@/components/ui/kpi-card';
import { humanDuration } from '@/data/usage/format';
import type { ShareRow, UsageTotals } from '@/data/usage/types';

export interface UsageKpiGridProps {
  totals: UsageTotals;
  /** How many people have ever shown up in this range, unscoped — the "of N" context for the headline count. */
  everActive: number;
  bySection: ShareRow[];
}

export function UsageKpiGrid({ totals, everActive, bySection }: UsageKpiGridProps) {
  const busiest = bySection[0];

  return (
    <View style={styles.grid}>
      <View style={styles.cell}>
        <KpiCard
          label="Actions logged"
          value={totals.events.toLocaleString()}
          context={`${totals.views.toLocaleString()} opens · ${totals.writes.toLocaleString()} changes`}
          inverted
        />
      </View>
      <View style={styles.cell}>
        <KpiCard
          label="People active"
          value={String(totals.people)}
          context={`of ${everActive} who have used it`}
        />
      </View>
      <View style={styles.cell}>
        <KpiCard
          label="Time in the ERP"
          value={humanDuration(totals.activeMs)}
          context="hands-on, idle time excluded"
        />
      </View>
      <View style={styles.cell}>
        <KpiCard
          label="Busiest page"
          value={busiest?.name ?? '—'}
          context={busiest ? `${busiest.value.toLocaleString()} actions` : 'Nothing yet'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '47%', flexGrow: 1 },
});
