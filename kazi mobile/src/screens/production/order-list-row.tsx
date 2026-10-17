import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { SegmentedProportionBar } from '@/components/ui/segmented-proportion-bar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { AVATAR_TINTS, STAGES, stageById, stageIndex } from '@/data/sales/mock';
import type { Order } from '@/data/sales/types';
import { initials, lakh, priorityOf } from '@/data/sales/utils';

export interface OrderListRowProps {
  order: Order;
  index: number;
  onPress: () => void;
}

const STATUS_LABEL: Record<Order['status'], string> = {
  active: 'Active',
  'on-hold': 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function OrderListRow({ order, index, onPress }: OrderListRowProps) {
  const theme = useTheme();
  const idx = stageIndex(order.stage);
  const stage = stageById(order.stage);
  const tint = AVATAR_TINTS[index % AVATAR_TINTS.length];
  const dimmed = order.status === 'cancelled' || order.status === 'completed';
  const priority = priorityOf(order);
  const segments = STAGES.map((_, i) => ({ weight: 1, color: i <= idx ? stage.bar : theme.draftWash }));

  const prioPalette =
    priority === 'urgent'
      ? { bg: theme.dangerWash, fg: theme.dangerWashText }
      : { bg: theme.warningWash, fg: theme.warningWashText };

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(220)}>
      <Pressable
        onPress={onPress}
        style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, opacity: dimmed ? 0.6 : 1 }]}
      >
        <View style={styles.topRow}>
          <Avatar initials={initials(order.customer)} tint={tint} size="md" />
          <View style={styles.textWrap}>
            <Text style={[styles.customer, { color: theme.textPrimary }]} numberOfLines={1}>
              {order.customer}
            </Text>
            <Text style={[styles.sub, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
              {order.ref} · {order.product}
            </Text>
          </View>
          <View style={styles.qtyCol}>
            <Text style={[styles.qty, tabularNums, { color: theme.textPrimary }]}>{order.qty.toLocaleString('en-US')} pcs</Text>
            <Text style={[styles.value, tabularNums, { color: theme.textSecondary }]}>{lakh(order.value)}</Text>
          </View>
        </View>

        <SegmentedProportionBar segments={segments} height={5} />

        <View style={styles.bottomRow}>
          <View style={[styles.pill, { backgroundColor: stage.bg }]}>
            <View style={[styles.pillDot, { backgroundColor: stage.dot }]} />
            <Text style={[styles.pillLabel, { color: stage.fg }]}>{stage.short}</Text>
          </View>
          {order.status !== 'active' ? (
            <View style={[styles.tag, { backgroundColor: theme.draftWash }]}>
              <Text style={[styles.tagText, { color: theme.draftWashText }]}>{STATUS_LABEL[order.status]}</Text>
            </View>
          ) : null}
          {priority !== 'normal' && order.status === 'active' ? (
            <View style={[styles.tag, { backgroundColor: prioPalette.bg }]}>
              <Text style={[styles.tagText, { color: prioPalette.fg }]}>{priority}</Text>
            </View>
          ) : null}
          <View style={styles.flex1} />
          <Text style={[styles.assignee, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
            {order.ship ? `due ${order.ship}` : order.assignedTo || '—'}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 15, gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  textWrap: { flex: 1, gap: 3, minWidth: 0 },
  customer: { fontFamily: fontFamily.semibold, fontSize: 15.5, letterSpacing: -0.01 * 15.5 },
  sub: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  qtyCol: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  qty: { fontSize: 14.5, fontWeight: '600' },
  value: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 999 },
  pillDot: { width: 6, height: 6, borderRadius: 99 },
  pillLabel: { fontSize: 12, fontWeight: '600' },
  tag: { height: 22, paddingHorizontal: 8, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  tagText: { fontFamily: fontFamily.mono, fontSize: 9, letterSpacing: 0.08 * 9, textTransform: 'uppercase' },
  flex1: { flex: 1 },
  assignee: { fontFamily: fontFamily.mono, fontSize: 10 },
});
