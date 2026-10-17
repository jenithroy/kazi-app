import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { ScreenGate } from '@/components/ui/screen-gate';
import { useAccountantDashboard } from '@/data/dashboard/hooks';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { moneyCompact } from '@/lib/money';

import { DashboardClockInCard } from '../clock-in-card';
import { DashboardCard, DashboardScroll } from '../dashboard-card';
import { InvoicesCard } from '../invoices-card';
import { KpiRow } from '../kpi-tile';
import { QuickLinks } from '../quick-links';

/** Compact money in the display currency — `useMoneySignature()` in the dashboard hooks re-renders it. */
const compactNpr = moneyCompact;

/**
 * `accountant` — Sunam Deepa. Bar is Dashboard / Finance / Chat / Billing, so
 * this fills in the rest of her ledger: what is owed, what went out this month,
 * and the budget requests waiting on a decision.
 */
export function AccountantDashboard() {
  const theme = useTheme();
  const { canView } = useAuth();
  const { data, isLoading, isRefetching, refetch, isError, queries } = useAccountantDashboard();
  if (isError) return <ScreenGate queries={queries} />;

  const c = data.invoiceCounts;
  const nothingYet = c.paid + c.partial + c.overdue + c.draft === 0 && data.financeMTD === 0;

  return (
    <DashboardScroll isRefetching={isRefetching} onRefresh={refetch} loading={isLoading && nothingYet}>
      <DashboardClockInCard />

      <KpiRow kpis={data.kpis} canView={canView} />

      {canView('billing') ? <InvoicesCard counts={c} /> : null}

      {canView('finance') ? (
        <DashboardCard title="Spend · this month" onPress={() => router.push('/finance')}>
          <Text style={[styles.figure, tabularNums, { color: theme.textPrimary }]}>
            {compactNpr(data.financeMTD)}
          </Text>
        </DashboardCard>
      ) : null}

      <QuickLinks
        sections={[
          'budget-requirements',
          'employees-hr',
          'sales',
          'customers',
          'order-management',
          'attendance',
          'tasks',
          'inventory',
        ]}
      />
    </DashboardScroll>
  );
}

const styles = StyleSheet.create({
  figure: {
    fontFamily: fontFamily.semibold,
    fontSize: 30,
    letterSpacing: -0.02 * 30,
  },
});
