import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenGate } from '@/components/ui/screen-gate';
import { useMarketingDashboard } from '@/data/dashboard/hooks';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';

import { DashboardClockInCard } from '../clock-in-card';
import { DashboardCard, DashboardScroll } from '../dashboard-card';
import { KpiRow } from '../kpi-tile';
import { MyTasksCard } from '../my-tasks-card';
import { QuickLinks } from '../quick-links';

/** "Today" / "Tomorrow" / "In 4 days" — the calendar is the job, so relative reads better than a date. */
function whenLabel(inDays: number): string {
  if (inDays === 0) return 'Today';
  if (inDays === 1) return 'Tomorrow';
  return `In ${inDays} days`;
}

/**
 * `marketing-coordinator` (Monika) and `content-coordinator` (Sarbagya, Sugam).
 *
 * Both live in the content calendar, so what is scheduled next leads. The
 * co-ordinator's bar carries Production alongside Marketing; the content
 * coordinators run a four-button bar where Marketing is the only module — for
 * them these quick links are the whole rest of the app.
 */
export function MarketingDashboard() {
  const theme = useTheme();
  const { canView } = useAuth();
  const { data, isLoading, isRefetching, refetch, isError, queries } = useMarketingDashboard();
  if (isError) return <ScreenGate queries={queries} />;

  const nothingYet = data.myOpenCount === 0 && data.upcoming.length === 0;

  return (
    <DashboardScroll isRefetching={isRefetching} onRefresh={refetch} loading={isLoading && nothingYet}>
      <DashboardClockInCard />

      <KpiRow kpis={data.kpis} canView={canView} />

      {canView('marketing') ? (
        <DashboardCard
          title="Coming up"
          meta={`${data.thisMonthCount} this month`}
          onPress={() => router.push('/marketing')}
        >
          {data.upcoming.length === 0 ? (
            <EmptyState icon="calendar" title="Nothing scheduled" message="No campaigns or posts booked ahead." />
          ) : (
            <View>
              {data.upcoming.map((entry, i) => (
                <View
                  key={entry.id}
                  style={[
                    styles.row,
                    i < data.upcoming.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.border,
                    },
                  ]}
                >
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                      {entry.title}
                    </Text>
                    <Text style={[styles.rowMeta, tabularNums, { color: theme.textSecondary }]}>
                      {whenLabel(entry.inDays)}
                      {entry.person ? ` · ${entry.person}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.rowKind, { color: theme.textSecondary }]}>{entry.kind}</Text>
                </View>
              ))}
            </View>
          )}
        </DashboardCard>
      ) : null}

      {canView('tasks') ? <MyTasksCard tasks={data.myTasks} openCount={data.myOpenCount} /> : null}

      <QuickLinks
        sections={['customers', 'inventory', 'order-management', 'attendance', 'tasks', 'marketing']}
      />
    </DashboardScroll>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
  },
  rowMeta: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
  },
  rowKind: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
  },
});
