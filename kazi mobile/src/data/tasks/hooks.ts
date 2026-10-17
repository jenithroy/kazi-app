import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { tasksKeys } from './keys';
import * as api from './api';
import type { Task } from './types';

export function useTasks() {
  return useQuery({ queryKey: tasksKeys.list(), queryFn: api.fetchTasks });
}

/**
 * Who a task can be assigned to — the live Employee Directory. Rarely changes,
 * so it's fine to serve from cache across the session.
 */
export function useAssignees() {
  return useQuery({ queryKey: tasksKeys.assignees(), queryFn: api.fetchAssignees, staleTime: 5 * 60_000 });
}

export function useSaveTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: Task) => api.saveTask(task),
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.list() });
      const previous = queryClient.getQueryData<Task[]>(tasksKeys.list());
      queryClient.setQueryData<Task[]>(tasksKeys.list(), (old) => {
        const list = old ?? [];
        const exists = list.some((t) => t.id === task.id);
        return exists ? list.map((t) => (t.id === task.id ? task : t)) : [task, ...list];
      });
      return { previous };
    },
    onError: (_err, _task, context) => {
      if (context?.previous) queryClient.setQueryData(tasksKeys.list(), context.previous);
    },
    // The board column is resolved server-side from `task_columns`, so the row
    // has to come back from the view rather than be assumed from the draft.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tasksKeys.list() });
    },
    // task.assigned / reassigned / status_changed / note_added are all
    // server-side now (tasks_notify_trg, 0117) — it has to be, so a save
    // made from the ERP web app notifies the assignee too. Calling notify()
    // here as well would double it up for every kazi-mobile-originated save.
  });
}

interface DeleteContext {
  previous?: Task[];
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, Task, DeleteContext>({
    mutationFn: (task) => api.deleteTask(task.id),
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.list() });
      const previous = queryClient.getQueryData<Task[]>(tasksKeys.list());
      queryClient.setQueryData<Task[]>(tasksKeys.list(), (old) => (old ?? []).filter((t) => t.id !== task.id));
      return { previous };
    },
    onError: (_err, _task, context) => {
      if (context?.previous) queryClient.setQueryData(tasksKeys.list(), context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tasksKeys.list() });
    },
  });
}

export function useUndoDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, index }: { task: Task; index: number }) => api.restoreTask(task, index),
    onMutate: async ({ task, index }) => {
      await queryClient.cancelQueries({ queryKey: tasksKeys.list() });
      queryClient.setQueryData<Task[]>(tasksKeys.list(), (old) => {
        const next = (old ?? []).slice();
        next.splice(Math.min(index, next.length), 0, task);
        return next;
      });
    },
    // The restore is a fresh row with a new id, so the list must come back from
    // the view or the undone task keeps the id it no longer has.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tasksKeys.list() });
    },
  });
}
