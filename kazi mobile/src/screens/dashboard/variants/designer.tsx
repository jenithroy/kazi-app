import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenGate } from '@/components/ui/screen-gate';
import { useDesignerDashboard } from '@/data/dashboard/hooks';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';

import { DashboardClockInCard } from '../clock-in-card';
import { DashboardCard, DashboardScroll } from '../dashboard-card';
import { KpiRow } from '../kpi-tile';
import { MyTasksCard } from '../my-tasks-card';
import { OrdersByStageCard } from '../orders-by-stage-card';
import { QuickLinks } from '../quick-links';

/**
 * `fashion-designer` — Aakansha, Kristina. Bar is Dashboard / Production /
 * Chat / Inventory, matching where the work actually happens: they own the
 * material side, so low stock leads and the floor's stage split sits under it.
 */
export function DesignerDashboard() {
  const theme = useTheme();
  const { canView } = useAuth();
  const { data, isLoading, isRefetching, refetch, isError, queries } = useDesignerDashboard();
  if (isError) return <ScreenGate queries={queries} />;

  const nothingYet = data.myOpenCount === 0 && data.activeOrdersTotal === 0 && data.lowStock.length === 0;

  return (
    <DashboardScroll isRefetching={isRefetching} onRefresh={refetch} loading={isLoading && nothingYet}>
      <DashboardClockInCard />

      <KpiRow kpis={data.kpis} canView={canView} />

      {canView('tasks') ? <MyTasksCard tasks={data.myTasks} openCount={data.myOpenCount} /> : null}

      {canView('inventory') ? (
        <DashboardCard
          title="Inventory alerts"
          meta={`${data.lowStock.length} below reorder`}
          onPress={() => router.push('/inventory')}
        >
          {data.lowStock.length === 0 ? (
            <EmptyState icon="check" title="All stocked" message="Nothing below its reorder level." />
          ) : (
            <View>
              {data.lowStock.slice(0, 5).map((row) => (
                <View key={row.id} style={[styles.row, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.rowName, { color: theme.textPrimary }]} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={[styles.rowMeta, tabularNums, { color: theme.dangerWashText }]}>
                    {row.qty}/{row.threshold} {row.unit}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </DashboardCard>
      ) : null}

      {canView('order-management') ? (
        <Pressable onPress={() => router.push('/production')} style={pressStyle}>
          <OrdersByStageCard stages={data.stages} total={data.activeOrdersTotal} />
        </Pressable>
      ) : null}

      <QuickLinks
        sections={['customers', 'attendance', 'tasks', 'order-management', 'marketing']}
      />
    </DashboardScroll>
  );
}

const pressStyle = ({ pressed }: { pressed: boolean }) => (pressed ? styles.pressed : null);

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.92,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowName: {
    flex: 1,
    fontSize: 14,
  },
  rowMeta: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
  },
});
