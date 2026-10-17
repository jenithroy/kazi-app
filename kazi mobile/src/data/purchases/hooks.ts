import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notify } from '@/data/notifications/notify';

import { purchasesKeys } from './keys';
import * as api from './api';
import type { PurchaseEntry } from './types';

const LARGE_AMOUNT_NPR = 100_000;

export function useEntries() {
  return useQuery({ queryKey: purchasesKeys.list(), queryFn: api.fetchEntries });
}

interface EntryContext {
  previous?: PurchaseEntry[];
}

export function useAddEntry() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, PurchaseEntry, EntryContext>({
    mutationFn: (entry: PurchaseEntry) => api.addEntry(entry),
    onMutate: async (entry) => {
      await queryClient.cancelQueries({ queryKey: purchasesKeys.list() });
      const previous = queryClient.getQueryData<PurchaseEntry[]>(purchasesKeys.list());
      queryClient.setQueryData<PurchaseEntry[]>(purchasesKeys.list(), (old) => [entry, ...(old ?? [])]);
      return { previous };
    },
    onError: (_err, _entry, context) => {
      if (context?.previous) queryClient.setQueryData(purchasesKeys.list(), context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: purchasesKeys.list() });
    },
    onSuccess: (_data, entry) => {
      notify({
        eventType: 'purchase.logged',
        section: 'purchases',
        targetRef: entry.expenseId,
        payload: { loggedBy: entry.loggedBy, amountNPR: entry.amountNPR, label: entry.party },
      });
      if (entry.amountNPR >= LARGE_AMOUNT_NPR) {
        notify({
          eventType: 'finance.large_amount',
          section: 'finance',
          targetRef: entry.expenseId,
          payload: { loggedBy: entry.loggedBy, amountNPR: entry.amountNPR, label: `Purchase — ${entry.party}` },
        });
      }
    },
  });
}

export function useUpdateEntry() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; updates: Partial<PurchaseEntry> }, EntryContext>({
    mutationFn: ({ id, updates }) => api.updateEntry(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: purchasesKeys.list() });
      const previous = queryClient.getQueryData<PurchaseEntry[]>(purchasesKeys.list());
      queryClient.setQueryData<PurchaseEntry[]>(purchasesKeys.list(), (old) => (old ?? []).map((e) => (e.id === id ? { ...e, ...updates } : e)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(purchasesKeys.list(), context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: purchasesKeys.list() });
    },
  });
}

export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string, EntryContext>({
    mutationFn: (id: string) => api.deleteEntry(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: purchasesKeys.list() });
      const previous = queryClient.getQueryData<PurchaseEntry[]>(purchasesKeys.list());
      queryClient.setQueryData<PurchaseEntry[]>(purchasesKeys.list(), (old) => (old ?? []).filter((e) => e.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(purchasesKeys.list(), context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: purchasesKeys.list() });
    },
  });
}

/** Undo restores the pre-mutation snapshot the screen captured — mirrors the prototype's own snapshot-based undo. */
export function useRestoreEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: PurchaseEntry[]) => api.restoreEntries(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: purchasesKeys.list() });
      queryClient.setQueryData<PurchaseEntry[]>(purchasesKeys.list(), previous);
    },
  });
}
