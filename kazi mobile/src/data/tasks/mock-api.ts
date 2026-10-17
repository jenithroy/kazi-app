import { simulateLatency } from '../mock/delay';
import { MOCK_ASSIGNEES, seedTasks } from './mock';
import type { Assignee, Task } from './types';

let db: Task[] = [...seedTasks];

export async function fetchTasks(): Promise<Task[]> {
  await simulateLatency();
  return [...db];
}

export async function fetchAssignees(): Promise<Assignee[]> {
  await simulateLatency();
  return [...MOCK_ASSIGNEES];
}

export async function saveTask(task: Task): Promise<void> {
  await simulateLatency(300);
  const exists = db.some((t) => t.id === task.id);
  db = exists ? db.map((t) => (t.id === task.id ? task : t)) : [task, ...db];
}

export async function deleteTask(id: string): Promise<void> {
  await simulateLatency(300);
  db = db.filter((t) => t.id !== id);
}

export async function restoreTask(task: Task, index: number): Promise<void> {
  await simulateLatency(150);
  const next = db.slice();
  next.splice(Math.min(index, next.length), 0, task);
  db = next;
}
