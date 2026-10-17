import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { ScreenGate } from '@/components/ui/screen-gate';
import { useDirectorDashboard } from '@/data/dashboard/hooks';

import { AttendanceCard } from '../attendance-card';
import { DashboardScroll } from '../dashboard-card';
import { InvoicesCard } from '../invoices-card';
import { KpiRow } from '../kpi-tile';
import { OrdersByStageCard } from '../orders-by-stage-card';
import { QuickLinks } from '../quick-links';

/**
 * The owners and the admins (`director`, `developer`, `system-admin`) — money
 * and the big picture.
 *
 * Their bar is Dashboard / Orders / Chat / Finance, so Production has no button
 * of its own: the orders-by-stage card below is how they watch the floor, and
 * the quick links reach everything else.
 */
export function OwnerDashboard() {
  const { canView } = useAuth();
  const { data, isLoading, isRefetching, refetch, isError, queries } = useDirectorDashboard();
  if (isError) return <ScreenGate queries={queries} />;

  const c = data.invoiceCounts;
  const invoiceTotal = c.paid + c.partial + c.overdue + c.draft;
  const nothingYet = invoiceTotal === 0 && data.activeOrdersTotal === 0 && data.attendanceOnRoll === 0;

  return (
    <DashboardScroll isRefetching={isRefetching} onRefresh={refetch} loading={isLoading && nothingYet}>
      <KpiRow kpis={data.kpis} canView={canView} />

      {canView('billing') ? <InvoicesCard counts={c} /> : null}

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

      <QuickLinks
        sections={[
          'order-management',
          'employees-hr',
          'sales',
          'customers',
          'attendance',
          'budget-requirements',
          'tasks',
          'inventory',
          'marketing',
        ]}
      />
    </DashboardScroll>
  );
}

const pressStyle = ({ pressed }: { pressed: boolean }) => (pressed ? styles.pressed : null);

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.92,
  },
});
