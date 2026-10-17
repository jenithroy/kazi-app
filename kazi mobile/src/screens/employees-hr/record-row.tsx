import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import type { AvatarTint } from '@/components/ui/avatar';

export interface RecordRowModel {
  id: number;
  name: string;
  initials: string;
  tint: AvatarTint;
  paidDays: string;
  dedLabel: string;
  hasDeduction: boolean;
  net: string;
  state: string;
  isPaid: boolean;
}

export interface RecordRowProps {
  record: RecordRowModel;
  index: number;
  onOpenSlip: () => void;
}

export function RecordRow({ record, index, onOpenSlip }: RecordRowProps) {
  const theme = useTheme();

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(220)}>
      <View style={[styles.row, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
        <Avatar initials={record.initials} tint={record.tint} size="lg" />
        <View style={styles.textWrap}>
          <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
            {record.name}
          </Text>
          <View style={styles.subRow}>
            <Text style={[styles.meta, tabularNums, { color: theme.textSecondary }]}>{record.paidDays}</Text>
            <Text style={[styles.dot, { color: theme.textSecondary }]}>·</Text>
            <Text style={[styles.meta, tabularNums, { color: record.hasDeduction ? theme.dangerWashText : theme.textSecondary }]}>{record.dedLabel}</Text>
          </View>
        </View>
        <View style={styles.rightCol}>
          <Text style={[styles.net, tabularNums, { color: theme.textPrimary }]}>{record.net}</Text>
          <Text style={[styles.state, { color: record.isPaid ? theme.accentWashText : theme.warningWashText }]}>{record.state}</Text>
        </View>
        <Pressable onPress={onOpenSlip} style={[styles.slipButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="file-text" size={16} color={theme.accentDeep} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14 },
  textWrap: { flex: 1, gap: 4, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 15 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  meta: { fontFamily: fontFamily.mono, fontSize: 11 },
  dot: { fontFamily: fontFamily.mono, fontSize: 11, opacity: 0.6 },
  rightCol: { alignItems: 'flex-end', gap: 5, flexShrink: 0 },
  net: { fontSize: 15, fontWeight: '600' },
  state: { fontFamily: fontFamily.mono, fontSize: 10, letterSpacing: 0.1 * 10, textTransform: 'uppercase' },
  slipButton: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
