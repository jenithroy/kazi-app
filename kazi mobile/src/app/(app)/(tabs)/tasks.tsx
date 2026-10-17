import { useLocalSearchParams } from 'expo-router';

import { Tasks } from '@/screens/tasks/tasks';

export default function TasksRoute() {
  // Deep link: /tasks?focus=<id> — from a task push notification.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  return <Tasks taskId={focus} />;
}
