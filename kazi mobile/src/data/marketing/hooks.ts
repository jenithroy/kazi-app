import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notify } from '@/data/notifications/notify';

import { marketingKeys } from './keys';
import * as api from './api';
import type { CalendarEntry } from './types';

export function useEntries() {
  return useQuery({ queryKey: marketingKeys.list(), queryFn: api.fetchEntries });
}

export function useAddEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: CalendarEntry) => api.addEntry(entry),
    onMutate: async (entry) => {
      await queryClient.cancelQueries({ queryKey: marketingKeys.list() });
      queryClient.setQueryData<CalendarEntry[]>(marketingKeys.list(), (old) => [...(old ?? []), entry]);
    },
    onSuccess: (_data, entry) => {
      notify({
        eventType: 'marketing.entry_created',
        section: 'marketing',
        targetRef: entry.id,
        payload: { createdBy: entry.person, label: entry.title },
      });
    },
    // The optimistic row carries a stand-in id; nothing can be edited or
    // deleted until the server's own uuid has replaced it.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: marketingKeys.list() });
    },
  });
}

interface UpdateContext {
  previous?: CalendarEntry[];
}

export function useUpdateEntry() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; updates: Partial<CalendarEntry> }, UpdateContext>({
    mutationFn: ({ id, updates }) => api.updateEntry(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: marketingKeys.list() });
      const previous = queryClient.getQueryData<CalendarEntry[]>(marketingKeys.list());
      queryClient.setQueryData<CalendarEntry[]>(marketingKeys.list(), (old) => (old ?? []).map((e) => (e.id === id ? { ...e, ...updates } : e)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(marketingKeys.list(), context.previous);
    },
    onSuccess: (_data, { id }, context) => {
      const entry = context?.previous?.find((e) => e.id === id);
      notify({
        eventType: 'marketing.entry_updated',
        section: 'marketing',
        targetRef: id,
        payload: { createdBy: entry?.person, label: entry?.title },
      });
    },
  });
}

export function useRemoveEntry() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string, UpdateContext>({
    mutationFn: (id) => api.removeEntry(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: marketingKeys.list() });
      const previous = queryClient.getQueryData<CalendarEntry[]>(marketingKeys.list());
      queryClient.setQueryData<CalendarEntry[]>(marketingKeys.list(), (old) => (old ?? []).filter((e) => e.id !== id));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(marketingKeys.list(), context.previous);
    },
    onSuccess: (_data, id, context) => {
      const entry = context?.previous?.find((e) => e.id === id);
      notify({
        eventType: 'marketing.entry_deleted',
        section: 'marketing',
        targetRef: id,
        payload: { createdBy: entry?.person, label: entry?.title },
      });
    },
  });
}

/** Undo just re-appends the removed entry — the prototype's own `undo()` doesn't track position either, since render order comes from date sorting, not array order. */
export function useRestoreEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: CalendarEntry) => api.restoreEntry(entry),
    onMutate: async (entry) => {
      await queryClient.cancelQueries({ queryKey: marketingKeys.list() });
      queryClient.setQueryData<CalendarEntry[]>(marketingKeys.list(), (old) => [...(old ?? []), entry]);
    },
    // Re-creating the row mints a fresh uuid — the restored entry is otherwise
    // left holding the id of the one that was deleted.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: marketingKeys.list() });
    },
  });
}
