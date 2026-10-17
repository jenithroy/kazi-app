import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { STAGE } from '@/data/customers/mock';
import type { Customer } from '@/data/customers/types';
import { gbp, hasOverdue, lifetime, owed } from '@/data/customers/utils';

export interface AccountHistoryProps {
  customer: Customer;
}

/**
 * What the ledger already knows about a customer, shown read-only beneath the
 * editable fields: the balance, the live orders and the invoices. The web app
 * has no equivalent — it lists customers and nothing else — so this is the one
 * part of the sheet that is mobile's own, and it is deliberately inert: the
 * only thing this sheet saves is the contact record.
 */
export function AccountHistory({ customer }: AccountHistoryProps) {
  const theme = useTheme();
  const balance = owed(customer);
  const overdue = hasOverdue(customer);
  const status = overdue ? 'Overdue' : balance ? 'Open balance' : 'Settled';
  const pillBg = overdue ? theme.onHero.dangerWash : balance ? theme.onHero.warningWash : theme.onHero.accentWash;
  const pillFg = overdue ? theme.onHero.dangerWashText : balance ? theme.onHero.warningWashText : theme.onHero.accentWashText;
  const balanceLine = balance
    ? `${gbp(balance)} outstanding across ${customer.invoices.filter((v) => v.status !== 'paid').length} invoice(s)`
    : 'Nothing outstanding';

  const reach = [
    customer.email ? { icon: 'mail' as const, label: 'Email', url: `mailto:${customer.email}` } : null,
    customer.phone ? { icon: 'phone' as const, label: 'Call', url: `tel:${customer.phone.replace(/\s+/g, '')}` } : null,
  ].filter((r): r is { icon: 'mail' | 'phone'; label: string; url: string } => r !== null);

  return (
    <View style={styles.wrap}>
      <Card elevation="hero" style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.gap5}>
            <Text style={[styles.eyebrow, { color: theme.onHero.textMuted }]}>Invoiced to date</Text>
            <Text style={[styles.summaryValue, tabularNums, { color: theme.onHero.text }]}>{gbp(lifetime(customer))}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: pillBg }]}>
            <View style={[styles.pillDot, { backgroundColor: pillFg }]} />
            <Text style={[styles.pillLabel, { color: pillFg }]}>{status}</Text>
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.onHero.divider }]} />
        <View style={styles.balanceRow}>
          <Text style={[styles.balanceLine, { color: theme.onHero.avatarText }]}>{balanceLine}</Text>
          <Text style={[styles.since, tabularNums, { color: theme.onHero.textMuted }]}>{customer.since}</Text>
        </View>
      </Card>

      {reach.length ? (
        <View style={styles.reachRow}>
          {reach.map((r) => (
            <Pressable
              key={r.label}
              onPress={() => Linking.openURL(r.url)}
              style={[styles.reachChip, { backgroundColor: theme.accentWash }]}
            >
              <Icon name={r.icon} size={13} color={theme.accentWashText} />
              <Text style={[styles.reachLabel, { color: theme.accentWashText }]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Card elevation="raised" style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Open orders</Text>
          <Text style={[styles.sectionMeta, tabularNums, { color: theme.textSecondary }]}>{customer.orders.length} live</Text>
        </View>
        {customer.orders.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Nothing in production for this account right now.</Text>
        ) : (
          customer.orders.map((o, i) => {
            const s = STAGE[o.stage];
            return (
              <View key={i} style={styles.orderRow}>
                <View style={styles.orderTextWrap}>
                  <Text style={[styles.orderProduct, { color: theme.textPrimary }]}>{o.product}</Text>
                  <Text style={[styles.orderMeta, tabularNums, { color: theme.textSecondary }]}>{o.meta}</Text>
                </View>
                <View style={[styles.pill, { backgroundColor: s.bg }]}>
                  <View style={[styles.pillDot, { backgroundColor: s.dot }]} />
                  <Text style={[styles.pillLabel, { color: s.fg }]}>{s.label}</Text>
                </View>
              </View>
            );
          })
        )}
      </Card>

      <Card elevation="raised" style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Invoices</Text>
          <Text style={[styles.sectionMeta, tabularNums, { color: theme.textSecondary }]}>
            {customer.invoices.length} total · {gbp(lifetime(customer))}
          </Text>
        </View>
        {customer.invoices.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Nothing invoiced to this account yet.</Text>
        ) : (
          customer.invoices.map((v) => {
            const fg = v.status === 'paid' ? theme.accentWashText : v.status === 'overdue' ? theme.dangerWashText : theme.warningWashText;
            const label = v.status === 'paid' ? 'Paid' : v.status === 'overdue' ? 'Overdue' : 'Open';
            return (
              <View key={v.ref} style={styles.invoiceRow}>
                <View style={styles.orderTextWrap}>
                  <Text style={[styles.invoiceRef, tabularNums, { color: theme.textPrimary }]}>{v.ref}</Text>
                  <Text style={[styles.orderMeta, tabularNums, { color: theme.textSecondary }]}>{v.due}</Text>
                </View>
                <Text style={[styles.invoiceAmount, tabularNums, { color: theme.textPrimary }]}>{gbp(v.amount)}</Text>
                <Text style={[styles.invoiceStatus, { color: fg }]}>{label}</Text>
              </View>
            );
          })
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  summaryCard: { padding: 18, gap: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 },
  gap5: { gap: 5 },
  eyebrow: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.12 * 10, textTransform: 'uppercase' },
  summaryValue: { fontFamily: fontFamily.semibold, fontSize: 30, letterSpacing: -0.03 * 30, lineHeight: 30 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 999 },
  pillDot: { width: 6, height: 6, borderRadius: 99 },
  pillLabel: { fontSize: 12.5, fontWeight: '600' },
  divider: { height: 1 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  balanceLine: { flex: 1, fontSize: 13, lineHeight: 13 * 1.4 },
  since: { fontFamily: fontFamily.mono, fontSize: 10.5, flexShrink: 0 },
  reachRow: { flexDirection: 'row', gap: 8 },
  reachChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 13, borderRadius: 11 },
  reachLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  section: { padding: 16, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { fontFamily: fontFamily.semibold, fontSize: 15 },
  sectionMeta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  emptyText: { fontSize: 13 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  orderTextWrap: { flex: 1, gap: 3, minWidth: 0 },
  orderProduct: { fontSize: 14.5, fontWeight: '600', lineHeight: 14.5 * 1.25 },
  orderMeta: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  invoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  invoiceRef: { fontFamily: fontFamily.mono, fontSize: 12.5 },
  invoiceAmount: { fontSize: 14.5, fontWeight: '600', flexShrink: 0 },
  invoiceStatus: { width: 74, textAlign: 'right', fontSize: 12, fontWeight: '600', flexShrink: 0 },
});
