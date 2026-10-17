import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { AVATAR_TINTS } from '@/data/sales/mock';
import type { Order } from '@/data/sales/types';
import { initials, lakh } from '@/data/sales/utils';

export interface TopCustomersProps {
  orders: Order[];
}

interface CustomerRoll {
  customer: string;
  units: number;
  orders: number;
  value: number;
}

/** Top customers by booked order value across the whole pipeline. */
export function TopCustomers({ orders }: TopCustomersProps) {
  const theme = useTheme();

  const byCustomer = new Map<string, CustomerRoll>();
  for (const o of orders) {
    const roll = byCustomer.get(o.customer) ?? { customer: o.customer, units: 0, orders: 0, value: 0 };
    roll.orders += 1;
    roll.units += o.qty;
    roll.value += o.value;
    byCustomer.set(o.customer, roll);
  }
  const ranked = [...byCustomer.values()].sort((a, b) => b.value - a.value).slice(0, 5);
  const top = ranked[0]?.value ?? 1;

  return (
    <Card elevation="raised" style={styles.card}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Top customers</Text>
      <View>
        {ranked.map((r, i) => (
          <View
            key={r.customer}
            style={[styles.row, i < ranked.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
          >
            <Avatar initials={initials(r.customer)} tint={AVATAR_TINTS[i % AVATAR_TINTS.length]} size="md" />
            <View style={styles.textWrap}>
              <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                {r.customer}
              </Text>
              <Text style={[styles.sub, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                {r.orders} {r.orders === 1 ? 'order' : 'orders'} · {r.units.toLocaleString('en-US')} pcs
              </Text>
              <View style={[styles.track, { backgroundColor: theme.draftWash }]}>
                <View style={[styles.fill, { width: `${Math.round((r.value / top) * 100)}%`, backgroundColor: theme.accentWash }]} />
              </View>
            </View>
            <Text style={[styles.value, tabularNums, { color: theme.textPrimary }]}>{lakh(r.value)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 12 },
  title: { fontFamily: fontFamily.semibold, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10 },
  textWrap: { flex: 1, gap: 4, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 14.5, letterSpacing: -0.01 * 14.5 },
  sub: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  track: { height: 5, borderRadius: 99, overflow: 'hidden', marginTop: 1 },
  fill: { height: '100%', borderRadius: 99 },
  value: { fontSize: 13.5, fontWeight: '600', flexShrink: 0 },
});
