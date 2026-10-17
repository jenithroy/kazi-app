import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { StatusPill } from '@/components/ui/status-pill';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import type { AvatarTint } from '@/components/ui/avatar';

export interface PersonRowModel {
  id: number;
  name: string;
  role: string;
  code: string;
  initials: string;
  tint: AvatarTint;
  active: boolean;
}

export interface PersonRowProps {
  person: PersonRowModel;
  index: number;
  onPress: () => void;
}

export function PersonRow({ person, index, onPress }: PersonRowProps) {
  const theme = useTheme();

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(220)}>
      <Pressable onPress={onPress} style={[styles.row, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}>
        <View style={person.active ? undefined : styles.dimmed}>
          <Avatar initials={person.initials} tint={person.tint} size="lg" />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
            {person.name}
          </Text>
          <View style={styles.subRow}>
            <Text style={[styles.role, { color: theme.textSecondary }]} numberOfLines={1}>
              {person.role}
            </Text>
            <Text style={[styles.code, { color: theme.textSecondary }]}>{person.code}</Text>
          </View>
        </View>
        <StatusPill status={person.active ? 'on-track' : 'draft'} label={person.active ? 'Active' : 'Inactive'} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14 },
  dimmed: { opacity: 0.55 },
  textWrap: { flex: 1, gap: 4, minWidth: 0 },
  name: { fontFamily: fontFamily.semibold, fontSize: 15 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
  role: { fontSize: 12.5, flexShrink: 1 },
  code: { fontFamily: fontFamily.mono, fontSize: 11, flexShrink: 0, opacity: 0.75 },
});
