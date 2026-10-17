import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenGate } from '@/components/ui/screen-gate';
import { useOpsDashboard } from '@/data/dashboard/hooks';
import { STATUS_LABEL } from '@/data/tasks/mock';
import type { TaskStatus } from '@/data/tasks/types';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';

import { DashboardClockInCard } from '../clock-in-card';
import { QuickLinks } from '../quick-links';
import { DashboardCard, DashboardScroll } from '../dashboard-card';
import { KpiRow } from '../kpi-tile';
import { OrdersByStageCard } from '../orders-by-stage-card';
import { AttendanceCard } from '../attendance-card';

const TASK_COLS: TaskStatus[] = ['blocked', 'progress', 'inactive', 'done'];

/**
 * `operations-head` / `operations-intern` ("Operations Manager") — the
 * factory-floor view. They work a shift like everyone else on the floor, so the
 * clock-in card sits above the numbers.
 */
export function OpsDashboard() {
  const theme = useTheme();
  const { canView } = useAuth();
  const { data, isLoading, isRefetching, refetch, isError, queries } = useOpsDashboard();
  if (isError) return <ScreenGate queries={queries} />;

  const nothingYet = data.attendanceOnRoll === 0 && data.activeOrdersTotal === 0 && data.openTasksTotal === 0;

  return (
    <DashboardScroll isRefetching={isRefetching} onRefresh={refetch} loading={isLoading && nothingYet}>
      <DashboardClockInCard />

      <KpiRow kpis={data.kpis} canView={canView} />

      {canView('order-management') ? (
        <Pressable onPress={() => router.push('/production')} style={pressStyle}>
          <OrdersByStageCard stages={data.stages} total={data.activeOrdersTotal} />
        </Pressable>
      ) : null}

      {canView('attendance') ? (
        <Pressable onPress={() => router.push('/attendance')} style={pressStyle}>
          <AttendanceCard breakdown={data.attendance} onRoll={data.attendanceOnRoll} />
        </Pressable>
      ) : null}

      {canView('tasks') ? (
        <DashboardCard
          title="Task board"
          meta={`${data.openTasksTotal + data.taskBoard.done} tasks`}
          onPress={() => router.push('/tasks')}
        >
          <View style={styles.statGrid}>
            {TASK_COLS.map((col) => (
              <View key={col} style={styles.statCell}>
                <Text style={[styles.statValue, tabularNums, { color: theme.textPrimary }]}>
                  {data.taskBoard[col]}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{STATUS_LABEL[col]}</Text>
              </View>
            ))}
          </View>
        </DashboardCard>
      ) : null}

      {canView('inventory') ? (
        <DashboardCard
          title="Inventory alerts"
          meta={`${data.lowStock.length} below reorder`}
          onPress={() => router.push('/inventory')}
        >
          {data.lowStock.length === 0 ? (
            <EmptyState icon="check" title="All stocked" message="Nothing below its reorder level." />
          ) : (
            <View style={styles.rows}>
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

      <QuickLinks
        sections={['order-management', 'finance', 'budget-requirements', 'attendance', 'tasks', 'employees-hr', 'customers', 'billing', 'marketing', 'sales']}
      />
    </DashboardScroll>
  );
}

const pressStyle = ({ pressed }: { pressed: boolean }) => (pressed ? styles.pressed : null);

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.92,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCell: {
    flexBasis: '22%',
    flexGrow: 1,
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.02 * 22,
  },
  statLabel: {
    fontSize: 11.5,
  },
  rows: {
    gap: 0,
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
