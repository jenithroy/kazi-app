import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/ui/icon';
import { Money } from '@/components/ui/money';
import { StatusPill, type StatusKind } from '@/components/ui/status-pill';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { CATEGORY, STATUS } from '@/data/budget-requirements/mock';
import { priorityBarColors } from '@/data/budget-requirements/utils';
import type { Category, Requirement, RequestStatus } from '@/data/budget-requirements/types';

const PILL_KIND: Record<RequestStatus, StatusKind> = {
  pending: 'at-risk',
  approved: 'on-track',
  declined: 'blocked',
};

const CATEGORY_ICON: Record<Category, IconName> = {
  'Raw Materials': 'package',
  Tools: 'tool',
  Machinery: 'settings',
  Equipment: 'tool',
  'Office Supplies': 'file-text',
  'Safety Equipment': 'shield',
  Other: 'grid',
};

export interface RequirementGroupProps {
  title: string;
  total: string;
  rows: Requirement[];
  isAdmin: boolean;
  onOpen: (id: string) => void;
}

export function RequirementGroup({ title, total, rows, isAdmin, onOpen }: RequirementGroupProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textSecondary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.total, tabularNums, { color: theme.textPrimary }]}>{total}</Text>
      </View>

      {rows.map((r, i) => {
        const status = STATUS[r.status];
        const cat = CATEGORY[r.cat];
        const bars = priorityBarColors(r.priority, theme.border);
        const tail = r.status === 'pending' && isAdmin ? 'Decide' : r.date;
        return (
          <Animated.View key={r.id} entering={FadeInUp.delay(Math.min(i, 6) * 30).duration(220)}>
            <Pressable
              onPress={() => onOpen(r.id)}
              style={[styles.row, { backgroundColor: theme.surface, boxShadow: theme.shadows.card, borderLeftColor: status.accent }]}
            >
              <View style={[styles.iconChip, { backgroundColor: cat.bg }]}>
                <Icon name={CATEGORY_ICON[r.cat]} size={17} color={cat.fg} />
              </View>
              <View style={styles.textWrap}>
                <View style={styles.topLine}>
                  <View style={styles.itemTextWrap}>
                    <Text style={[styles.itemName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {r.item}
                    </Text>
                    <Text style={[styles.itemSub, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                      {r.cat} · {r.quantity} · {r.who}
                    </Text>
                  </View>
                  <Money npr={r.amount} align="right" size={15} />
                </View>
                <View style={styles.bottomLine}>
                  <StatusPill status={PILL_KIND[r.status]} label={status.label} />
                  <View style={[styles.priorityChip, { backgroundColor: theme.draftWash, borderColor: theme.border }]}>
                    <View style={styles.bars}>
                      <View style={[styles.bar, { height: 5, backgroundColor: bars[0] }]} />
                      <View style={[styles.bar, { height: 8, backgroundColor: bars[1] }]} />
                      <View style={[styles.bar, { height: 11, backgroundColor: bars[2] }]} />
                    </View>
                    <Text style={[styles.priorityText, { color: theme.textPrimary }]}>{r.priority}</Text>
                  </View>
                  <View style={styles.flex1} />
                  <Text style={[styles.tail, tabularNums, { color: theme.textSecondary }]}>{tail}</Text>
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
  title: { fontFamily: fontFamily.mono, fontSize: 10.5, letterSpacing: 0.12 * 10.5, textTransform: 'uppercase' },
  total: { fontFamily: fontFamily.mono, fontSize: 11 },
  row: { flexDirection: 'row', gap: 12, borderRadius: 18, padding: 14, borderLeftWidth: 4, marginTop: 9 },
  iconChip: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textWrap: { flex: 1, gap: 6, minWidth: 0 },
  topLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemTextWrap: { flex: 1, gap: 3, minWidth: 0 },
  itemName: { fontFamily: fontFamily.semibold, fontSize: 15, letterSpacing: -0.01 * 15 },
  itemSub: { fontFamily: fontFamily.mono, fontSize: 10.5 },
  amount: { fontSize: 16, fontWeight: '600', flexShrink: 0 },
  bottomLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  priorityChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 1.5 },
  bar: { width: 2.5, borderRadius: 1 },
  priorityText: { fontSize: 11.5 },
  flex1: { flex: 1 },
  tail: { fontFamily: fontFamily.mono, fontSize: 10.5 },
});
