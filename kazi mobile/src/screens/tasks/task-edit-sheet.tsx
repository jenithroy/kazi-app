import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { ChoiceChips, Field } from '@/components/ui/editor-kit';
import { TextField } from '@/components/ui/text-field';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import { PRIORITY_LABEL, PRIORITY_ORDER, TASK_CATEGORIES } from '@/data/tasks/mock';
import type { Task, TaskPriority } from '@/data/tasks/types';

import { AssigneePicker } from './assignee-picker';
import { CustomerPicker } from './customer-picker';
import { DueDateField } from './due-date-field';
import { StatusOptions } from './status-options';

export interface TaskEditSheetProps {
  visible: boolean;
  draft: Task | null;
  isNew: boolean;
  onClose: () => void;
  onChange: (patch: Partial<Task>) => void;
  onSave: () => void;
  onDelete: () => void;
}

/** The full editor — admins only (`can('tasks')`). */
export function TaskEditSheet({ visible, draft, isNew, onClose, onChange, onSave, onDelete }: TaskEditSheetProps) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} title={isNew ? 'New task' : 'Edit task'}>
      {draft ? (
        <>
          <View style={styles.group}>
            <TextField label="Task" value={draft.title} onChangeText={(v) => onChange({ title: v })} placeholder="What needs doing?" />
          </View>

          <View style={styles.group}>
            <Field
              label="Description"
              value={draft.description}
              onChange={(v) => onChange({ description: v })}
              placeholder="What this involves, in a bit more detail"
              multiline
              lines={3}
            />
          </View>

          <View style={styles.group}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Assign to</Text>
            <AssigneePicker value={draft.assignee} onChange={(name) => onChange({ assignee: name })} />
          </View>

          <View style={styles.group}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Customer</Text>
            <CustomerPicker value={draft.customer} onChange={(name) => onChange({ customer: name })} />
          </View>

          <DueDateField value={draft.dueDate} onChange={(v) => onChange({ dueDate: v })} />

          <View style={styles.group}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Priority</Text>
            <View style={styles.optionsRow}>
              {PRIORITY_ORDER.map((p) => {
                const on = draft.priority === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => onChange({ priority: p as TaskPriority })}
                    style={[
                      styles.optionButton,
                      { backgroundColor: on ? theme.accentWash : theme.surface, borderColor: on ? theme.accent : theme.border },
                    ]}
                  >
                    <Text style={[styles.optionLabel, { color: on ? theme.accentWashText : theme.textPrimary }]}>
                      {PRIORITY_LABEL[p]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.group}>
            <ChoiceChips
              label="Category"
              options={TASK_CATEGORIES}
              value={draft.category}
              onChange={(v) => onChange({ category: v })}
            />
          </View>

          <View style={styles.group}>
            <TextField
              label="Order ref"
              value={draft.orderRef}
              onChangeText={(v) => onChange({ orderRef: v })}
              placeholder="e.g. KZ-2418 (optional)"
            />
          </View>

          <View style={styles.group}>
            <Field
              label="Progress notes"
              value={draft.notes}
              onChange={(v) => onChange({ notes: v })}
              placeholder="Updates as work happens"
              multiline
              lines={3}
            />
          </View>

          <View style={styles.group}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Progress</Text>
            <StatusOptions value={draft.status} onChange={(status) => onChange({ status })} />
          </View>

          <View style={styles.actions}>
            <Button label={isNew ? 'Add task' : 'Save changes'} onPress={onSave} fullWidth />
            {!isNew ? <Button label="Delete task" variant="dangerOutline" onPress={onDelete} fullWidth /> : null}
          </View>
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 10,
  },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.14 * 10,
    textTransform: 'uppercase',
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 13.5,
  },
  actions: {
    gap: 10,
    paddingTop: 4,
  },
});
