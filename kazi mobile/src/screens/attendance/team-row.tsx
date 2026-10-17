import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';
import { STATUS_LABELS, STATUS_RAMP } from '@/data/attendance/mock';
import type { AttendanceStatus, TeamMember } from '@/data/attendance/types';

const STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'half', 'leave'];

export interface TeamRowProps {
  member: TeamMember;
  index: number;
  /** Admin roll-call edit mode (item 27). */
  editable?: boolean;
  onSetStatus?: (status: AttendanceStatus) => void;
  onOpenReport?: () => void;
}

export function TeamRow({ member, index, editable = false, onSetStatus, onOpenReport }: TeamRowProps) {
  const theme = useTheme();
  const ramp = STATUS_RAMP[theme.scheme];
  const tone = ramp[member.status];

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(200)}>
      <Pressable
        disabled={!onOpenReport}
        onPress={onOpenReport}
        style={[styles.row, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}
      >
        <View style={styles.topRow}>
          <Avatar initials={member.initials} tint={member.avatarTint} size="lg" />
          <View style={styles.textWrap}>
            <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
              {member.name}
            </Text>
            <View style={styles.subRow}>
              <Text style={[styles.meta, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                {member.times}
              </Text>
              <Text style={[styles.dot, { color: theme.textSecondary }]}>·</Text>
              <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                {member.role}
              </Text>
            </View>
          </View>
          {!editable ? (
            <View style={styles.rightCol}>
              <View style={[styles.pill, { backgroundColor: tone.chipBg }]}>
                <View style={[styles.pillDot, { backgroundColor: tone.dot }]} />
                <Text style={[styles.pillLabel, { color: tone.chipFg }]}>{STATUS_LABELS[member.status]}</Text>
              </View>
              <Text style={[styles.hours, tabularNums, { color: theme.textPrimary }]}>{member.hours}</Text>
            </View>
          ) : null}
        </View>

        {editable ? (
          <View style={styles.statusRow}>
            {STATUSES.map((s) => {
              const on = member.status === s;
              const st = ramp[s];
              return (
                <Pressable
                  key={s}
                  onPress={() => onSetStatus?.(s)}
                  style={[styles.statusChip, { backgroundColor: on ? st.chipBg : 'transparent', borderColor: on ? st.dot : theme.border }]}
                >
                  <Text style={[styles.statusChipLabel, { color: on ? st.chipFg : theme.textSecondary }]}>{STATUS_LABELS[s]}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: 18, padding: 14, gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textWrap: { flex: 1, gap: 4, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 15 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  meta: { fontFamily: fontFamily.mono, fontSize: 11, flexShrink: 1 },
  dot: { fontFamily: fontFamily.mono, fontSize: 11, opacity: 0.6 },
  rightCol: { alignItems: 'flex-end', gap: 5, flexShrink: 0 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 999 },
  pillDot: { width: 6, height: 6, borderRadius: 99 },
  pillLabel: { fontSize: 12, fontWeight: '600' },
  hours: { fontSize: 12, fontWeight: '600' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip: { height: 30, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statusChipLabel: { fontFamily: fontFamily.semibold, fontSize: 11.5 },
});
