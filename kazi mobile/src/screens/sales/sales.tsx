import { ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { HeaderAccount } from '@/components/ui/header-account';
import { isBlocked, ScreenGate } from '@/components/ui/screen-gate';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useTheme } from '@/theme/theme-provider';
import { useOrders } from '@/data/sales/hooks';
import { useScrollTop } from '@/lib/use-scroll-top';
import { useMoneySignature } from '@/lib/money';

import { StageBreakdown } from './stage-breakdown';
import { Summary } from './summary';
import { TopCustomers } from './top-customers';

/**
 * Sales is a read-only pipeline overview off the shared `orders` collection —
 * KPI row, stage breakdown, top customers. Order CRUD lives in Order Management.
 */
export function Sales() {
  const theme = useTheme();
  const scrollRef = useScrollTop();
  // Money is formatted by plain functions (`@/lib/money`), so this is what
  // re-renders the screen when the currency preference or the rate changes.
  useMoneySignature();
  const ordersQuery = useOrders();
  const { data: orders } = ordersQuery;

  if (isBlocked(ordersQuery) || !orders) return <ScreenGate queries={[ordersQuery]} header={<ScreenHeader title="Sales" rightSlot={<HeaderAccount />} />} />;

  const active = orders.filter((o) => o.stage !== 'delivered').length;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Sales"
        subtitle={`Pipeline overview · ${active} active`}
        rightSlot={<HeaderAccount />}
      />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {orders.length === 0 ? (
          <EmptyState icon="shopping-bag" title="No orders yet" message="Orders created in Order Management will appear here." />
        ) : (
          <>
            <Summary orders={orders} />
            <StageBreakdown orders={orders} />
            <TopCustomers orders={orders} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 4, paddingBottom: 32, gap: 12 },
});
