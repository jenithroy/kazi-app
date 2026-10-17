import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { SectionId } from '@/auth/permissions';
import { KpiCard } from '@/components/ui/kpi-card';
import type { DashKpi } from '@/data/dashboard/types';

export interface KpiRowProps {
  kpis: DashKpi[];
  /** Section-visibility gate — a tile whose section isn't viewable is dropped. */
  canView: (section: SectionId) => boolean;
  /** Index of the one tile rendered as the inverted "highlight" card, if any. */
  invertedIndex?: number;
}

/** Wrapping KPI grid; each tile deep-links to its module when `route` is set. */
export function KpiRow({ kpis, canView, invertedIndex }: KpiRowProps) {
  const visible = kpis.filter((k) => !k.section || canView(k.section));

  return (
    <View style={styles.grid}>
      {visible.map((kpi, i) => {
        const go = kpi.route ? () => router.push(kpi.route as never) : undefined;
        return (
          <Pressable
            key={kpi.id}
            onPress={go}
            disabled={!go}
            style={({ pressed }) => [styles.cell, pressed && go ? styles.pressed : null]}
          >
            <KpiCard
              label={kpi.label}
              value={kpi.value}
              delta={kpi.delta}
              context={kpi.context}
              sparkline={kpi.sparkline}
              inverted={i === invertedIndex}
            />
          </Pressable>
        );
      })}
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
  pressed: {
    opacity: 0.92,
  },
});
