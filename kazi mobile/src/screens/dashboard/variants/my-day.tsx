import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { ScreenGate } from '@/components/ui/screen-gate';
import { useMyDayDashboard } from '@/data/dashboard/hooks';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { moneyCompact } from '@/lib/money';

import { DashboardClockInCard } from '../clock-in-card';
import { DashboardCard, DashboardScroll } from '../dashboard-card';
import { MyTasksCard } from '../my-tasks-card';
import { QuickLinks } from '../quick-links';

/** Compact money in the display currency — `useMoneySignature()` in the dashboard hooks re-renders it. */
const compactNpr = moneyCompact;

/** `employee` / `nepal_staff` — just their own day. */
export function MyDayDashboard() {
  const theme = useTheme();
  const { canView } = useAuth();
  const { data, isLoading, isRefetching, refetch, isError, queries } = useMyDayDashboard();
  if (isError) return <ScreenGate queries={queries} />;

  const att = data.attendanceMonth;
  const attCells = [
    { key: 'present', label: 'Present', value: att.present, color: theme.textPrimary },
    { key: 'late', label: 'Late', value: att.late, color: theme.warningWashText },
    { key: 'leave', label: 'Leave', value: att.leave, color: theme.draftWashText },
    { key: 'absent', label: 'Absent', value: att.absent, color: theme.dangerWashText },
  ];

  const nothingYet =
    data.myOpenCount === 0 &&
    data.tasksDone === 0 &&
    att.present + att.late + att.leave + att.absent === 0;

  return (
    <DashboardScroll isRefetching={isRefetching} onRefresh={refetch} loading={isLoading && nothingYet}>
      <DashboardClockInCard />

      {canView('tasks') ? <MyTasksCard tasks={data.myTasks} openCount={data.myOpenCount} /> : null}

      {canView('attendance') ? (
        <DashboardCard title="Your attendance" meta="This month" onPress={() => router.push('/attendance')}>
          <View style={styles.statGrid}>
            {attCells.map((cell) => (
              <View key={cell.key} style={styles.statCell}>
                <Text style={[styles.statValue, tabularNums, { color: cell.color }]}>{cell.value}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{cell.label}</Text>
              </View>
            ))}
          </View>
        </DashboardCard>
      ) : null}

      {canView('finance') ? (
        <DashboardCard title="Spend · this month" onPress={() => router.push('/finance')}>
          <Text style={[styles.financeValue, tabularNums, { color: theme.textPrimary }]}>
            {compactNpr(data.financeMTD)}
          </Text>
        </DashboardCard>
      ) : null}

      <QuickLinks sections={['tasks', 'attendance', 'inventory', 'budget-requirements', 'customers', 'marketing', 'order-management']} />
    </DashboardScroll>
  );
}

const styles = StyleSheet.create({
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
  financeValue: {
    fontFamily: fontFamily.semibold,
    fontSize: 30,
    letterSpacing: -0.02 * 30,
  },
});
