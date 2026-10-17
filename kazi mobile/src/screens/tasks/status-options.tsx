import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { STATUS_LABEL, STATUS_ORDER } from '@/data/tasks/mock';
import type { TaskStatus } from '@/data/tasks/types';

/** The four progress states, shared by the admin edit sheet and the progress sheet. */
export function StatusOptions({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  return (
    <View style={styles.grid}>
      {STATUS_ORDER.map((s) => (
        <StatusOption key={s} status={s} selected={value === s} onPress={() => onChange(s)} />
      ))}
    </View>
  );
}

function StatusOption({ status, selected, onPress }: { status: TaskStatus; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const dotColor: Record<TaskStatus, string> = {
    blocked: theme.danger,
    progress: theme.accent,
    inactive: theme.draftDot,
    done: theme.onDark.accent,
  };
  const washBg: Record<TaskStatus, string> = {
    blocked: theme.dangerWash,
    progress: theme.accentWash,
    inactive: theme.draftWash,
    // Light keeps the design's ink block; dark has no ink to invert to, so
    // `done` reads as a solid accent - the softer wash is already `progress`.
    done: theme.scheme === 'dark' ? theme.accent : theme.surfaceInverted,
  };
  const washFg: Record<TaskStatus, string> = {
    blocked: theme.dangerWashText,
    progress: theme.accentWashText,
    inactive: theme.draftWashText,
    done: theme.scheme === 'dark' ? theme.accentText : theme.onDark.avatarText,
  };

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.option,
        { backgroundColor: selected ? washBg[status] : theme.surface, borderColor: selected ? dotColor[status] : theme.border },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: dotColor[status] }]} />
      <Text style={[styles.label, { color: selected ? washFg[status] : theme.textPrimary }]}>{STATUS_LABEL[status]}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    width: '47.5%',
    flexGrow: 1,
    height: 46,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dot: { width: 7, height: 7, borderRadius: 99 },
  label: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
});
