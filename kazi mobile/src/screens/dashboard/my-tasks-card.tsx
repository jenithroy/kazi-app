import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { STATUS_LABEL } from '@/data/tasks/mock';
import type { MyDayTask } from '@/data/dashboard/types';
import { useDateText } from '@/lib/date-display';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily, tabularNums } from '@/theme';

import { DashboardCard } from './dashboard-card';

export interface MyTasksCardProps {
  tasks: MyDayTask[];
  openCount: number;
}

/** The five nearest open tasks assigned to you — every non-owner variant leads with this. */
export function MyTasksCard({ tasks, openCount }: MyTasksCardProps) {
  const theme = useTheme();
  const dateText = useDateText();
  const shown = tasks.slice(0, 5);

  return (
    <DashboardCard title="Your tasks" meta={`${openCount} open`} onPress={() => router.push('/tasks')}>
      {shown.length === 0 ? (
        <EmptyState icon="check" title="All caught up" message="Nothing assigned to you right now." />
      ) : (
        <View>
          {shown.map((t, i) => (
            <View
              key={t.id}
              style={[
                styles.taskRow,
                i < shown.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border,
                },
              ]}
            >
              <View style={styles.taskText}>
                <Text style={[styles.taskTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={[styles.taskRef, tabularNums, { color: theme.textSecondary }]} numberOfLines={1}>
                  {t.dueDate ? dateText(t.dueDate) : ''}
                </Text>
              </View>
              <Text style={[styles.taskStatus, { color: theme.textSecondary }]}>{STATUS_LABEL[t.status]}</Text>
            </View>
          ))}
        </View>
      )}
    </DashboardCard>
  );
}

const styles = StyleSheet.create({
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  taskText: {
    flex: 1,
    gap: 2,
  },
  taskTitle: {
    fontSize: 14,
  },
  taskRef: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
  },
  taskStatus: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.12 * 10,
    textTransform: 'uppercase',
  },
});
