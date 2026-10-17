import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, tintFromSeed } from '@/components/ui/avatar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { useDateText } from '@/lib/date-display';
import { initialsOf } from '@/data/tasks/mock';
import type { Task, TaskStatus } from '@/data/tasks/types';

import { StatusOptions } from './status-options';

export interface TaskProgressSheetProps {
  visible: boolean;
  task: Task | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (status: TaskStatus) => void;
}

/**
 * What a non-admin gets when they tap a task: read the details, move the
 * progress, save. Nothing else on the task is editable from here — the title,
 * assignee and due date stay with whoever owns the board.
 */
export function TaskProgressSheet({ visible, task, saving = false, onClose, onSave }: TaskProgressSheetProps) {
  const theme = useTheme();
  const dateText = useDateText();
  const [status, setStatus] = useState<TaskStatus>('progress');

  // Reopening on another task (or after someone else moved this one) starts
  // from what the server currently says — re-seeded during render so the first
  // paint already shows the right step.
  const serverStatus = `${task?.id}|${task?.status}`;
  const [seededFrom, setSeededFrom] = useState(serverStatus);
  if (seededFrom !== serverStatus) {
    setSeededFrom(serverStatus);
    if (task) setStatus(task.status);
  }

  const dueText = task?.dueDate ? `Due ${dateText(task.dueDate)}` : 'No due date';
  const dirty = !!task && status !== task.status;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Update progress" maxHeight={520}>
      {task ? (
        <>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{task.title}</Text>
            <View style={styles.metaRow}>
              <Avatar
                initials={task.assignee ? initialsOf(task.assignee) : '—'}
                tint={task.assignee ? tintFromSeed(task.assignee) : 'draft'}
                size="sm"
              />
              <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                {task.assignee || 'Unassigned'}
              </Text>
              <Text style={[styles.dot, { color: theme.textSecondary }]}>·</Text>
              <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>{dueText}</Text>
            </View>
          </View>

          <View style={styles.group}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Progress</Text>
            <StatusOptions value={status} onChange={setStatus} />
          </View>

          <Button
            label={saving ? 'Saving…' : 'Save progress'}
            onPress={() => onSave(status)}
            disabled={!dirty || saving}
            fullWidth
            style={styles.action}
          />
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  title: { fontFamily: fontFamily.semibold, fontSize: 15.5, lineHeight: 15.5 * 1.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  meta: { fontSize: 12, flexShrink: 1 },
  dot: { fontSize: 12, opacity: 0.6 },
  group: { gap: 10 },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.14 * 10,
    textTransform: 'uppercase',
  },
  action: { marginTop: 4 },
});
