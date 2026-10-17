import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';

import { Avatar, tintFromSeed } from '@/components/ui/avatar';
import { StatusPill, type StatusKind } from '@/components/ui/status-pill';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { isoDay, useDateText } from '@/lib/date-display';
import { STATUS_LABEL, initialsOf } from '@/data/tasks/mock';
import type { Task, TaskStatus } from '@/data/tasks/types';

const PILL_KIND: Record<TaskStatus, StatusKind> = {
  blocked: 'blocked',
  progress: 'on-track',
  inactive: 'draft',
  done: 'shipped',
};

export interface TaskRowProps {
  task: Task;
  index: number;
  onPress: () => void;
}

export function TaskRow({ task, index, onPress }: TaskRowProps) {
  const theme = useTheme();
  const dateText = useDateText();
  const isDone = task.status === 'done';
  const isDueToday = !!task.dueDate && task.dueDate === isoDay(new Date()) && !isDone;
  const dueLabel = task.dueDate ? dateText(task.dueDate) : 'No due date';

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 30).duration(200)}
      exiting={FadeOutUp.duration(180)}
      layout={LinearTransition.duration(200)}
    >
      <Pressable
        onPress={onPress}
        style={[styles.row, { backgroundColor: theme.surface, boxShadow: theme.shadows.card }]}
      >
        <Avatar
          initials={task.assignee ? initialsOf(task.assignee) : '—'}
          tint={task.assignee ? tintFromSeed(task.assignee) : 'draft'}
          size="md"
        />
        <View style={styles.textWrap}>
          <Text
            style={[
              styles.title,
              { color: isDone ? theme.textSecondary : theme.textPrimary, textDecorationLine: isDone ? 'line-through' : 'none' },
            ]}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.assignee, { color: theme.textSecondary }]} numberOfLines={1}>
              {task.assignee || 'Unassigned'}
            </Text>
            <View
              style={[
                styles.dueChip,
                { backgroundColor: isDueToday ? theme.warningWash : theme.draftWash },
              ]}
            >
              <Text style={[styles.dueText, { color: isDueToday ? theme.warningWashText : theme.textSecondary }]} numberOfLines={1}>
                {isDone ? 'Closed' : dueLabel}
              </Text>
            </View>
          </View>
        </View>
        <StatusPill status={PILL_KIND[task.status]} label={STATUS_LABEL[task.status]} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    padding: 14,
  },
  textWrap: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    lineHeight: 15 * 1.25,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assignee: {
    fontSize: 11.5,
    flexShrink: 1,
  },
  dueChip: {
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 7,
    justifyContent: 'center',
  },
  dueText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
