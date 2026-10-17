import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { Money } from '@/components/ui/money';
import { StatusPill, type StatusKind } from '@/components/ui/status-pill';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { STATUS } from '@/data/purchases/mock';
import type { PurchaseEntry, PurchaseStatus } from '@/data/purchases/types';

const PILL_KIND: Record<PurchaseStatus, StatusKind> = {
  paid: 'on-track',
  partial: 'at-risk',
  unpaid: 'blocked',
};

export interface EntryGroupProps {
  title: string;
  total: number;
  hasUnpaid: boolean;
  entries: PurchaseEntry[];
  onOpen: (id: string) => void;
}

export function EntryGroup({ title, total, hasUnpaid, entries, onOpen }: EntryGroupProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.textSecondary }]} numberOfLines={1}>
            {title}
          </Text>
          {hasUnpaid ? <View style={[styles.dot, { backgroundColor: theme.danger }]} /> : null}
        </View>
        <Money npr={total} compact inline size={11} secondary={false} />
      </View>

      {entries.map((e, i) => {
        const status = STATUS[e.status];
        const isCash = e.paymentType === 'Cash';
        // A null method was never recorded — it must not read as a bank payment.
        const noMethod = e.paymentType == null;
        const methodIcon = noMethod ? 'help-circle' : e.paymentType === 'Cash' ? 'credit-card' : e.paymentType === 'Credit' ? 'clock' : 'home';
        const lead = e.items[0]?.particulars ?? e.category;
        const more = e.items.length > 1 ? ` +${e.items.length - 1}` : '';
        return (
          <Animated.View key={e.id} entering={FadeInUp.delay(Math.min(i, 6) * 30).duration(220)}>
            <Pressable
              onPress={() => onOpen(e.id)}
              style={[styles.row, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderLeftColor: status.dot }]}
            >
              <View style={[styles.methodIcon, { backgroundColor: isCash || noMethod ? theme.draftWash : theme.accentWash }]}>
                <Icon name={methodIcon} size={17} color={isCash || noMethod ? theme.textSecondary : theme.accentDeep} />
              </View>
              <View style={styles.textWrap}>
                <View style={styles.topLine}>
                  <View style={styles.itemTextWrap}>
                    <Text style={[styles.itemName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {e.party}
                    </Text>
                    <Text style={[styles.itemSub, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                      {lead}
                      {more} · {e.category}
                    </Text>
                  </View>
                  <Money npr={e.amountNPR} size={15} align="right" style={styles.amount} />
                </View>
                <View style={styles.bottomLine}>
                  <StatusPill status={PILL_KIND[e.status]} label={status.label} />
                  <View style={[styles.methodChip, { backgroundColor: theme.draftWash, borderColor: theme.border }]}>
                    <Text style={[styles.methodText, { color: theme.textPrimary }]}>
                      {e.paymentType ?? 'Method not recorded'}
                      {e.bankName ? ` · ${e.bankName}` : ''}
                    </Text>
                  </View>
                  <View style={styles.flex1} />
                  <Text style={[styles.tail, tabularNums, { color: theme.textSecondary }]}>{e.expenseId}</Text>
                </View>
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 9 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingHorizontal: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, minWidth: 0 },
  title: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.12 * 10.5, textTransform: 'uppercase' },
  dot: { width: 6, height: 6, borderRadius: 99 },
  row: { flexDirection: 'row', gap: 12, borderRadius: 18, padding: 14, borderLeftWidth: 4, marginTop: 9 },
  methodIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textWrap: { flex: 1, gap: 6, minWidth: 0 },
  topLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemTextWrap: { flex: 1, gap: 3, minWidth: 0 },
  itemName: { fontFamily: fontFamily.semibold, fontSize: 15, letterSpacing: -0.01 * 15 },
  itemSub: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  amount: { flexShrink: 0 },
  bottomLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  methodChip: { height: 24, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  methodText: { fontSize: 11 },
  flex1: { flex: 1 },
  tail: { fontFamily: fontFamily.mono, fontSize: 10.5 },
});
