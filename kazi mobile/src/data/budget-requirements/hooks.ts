import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notify } from '@/data/notifications/notify';

import { budgetRequirementsKeys } from './keys';
import * as api from './api';
import type { BudgetRequest, Requirement } from './types';

function decisionEvent(status?: string): 'budget_request.approved' | 'budget_request.rejected' | null {
  const s = (status ?? '').toLowerCase();
  if (s === 'approved') return 'budget_request.approved';
  if (s === 'rejected' || s === 'declined') return 'budget_request.rejected';
  return null;
}

export function useRequirements() {
  return useQuery({ queryKey: budgetRequirementsKeys.list(), queryFn: api.fetchRequirements });
}

export function useAddRequirement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: Requirement) => api.addRequirement(entry),
    onMutate: async (entry) => {
      await queryClient.cancelQueries({ queryKey: budgetRequirementsKeys.list() });
      queryClient.setQueryData<Requirement[]>(budgetRequirementsKeys.list(), (old) => [entry, ...(old ?? [])]);
    },
    onSuccess: (_data, entry) => {
      notify({
        eventType: 'requirement.added',
        section: 'budget-requirements',
        targetRef: entry.ref,
        payload: { requestedBy: entry.who, label: entry.item },
      });
    },
  });
}

interface UpdateContext {
  previous?: Requirement[];
}

export function useUpdateRequirement() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; updates: Partial<Requirement> }, UpdateContext>({
    mutationFn: ({ id, updates }) => api.updateRequirement(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: budgetRequirementsKeys.list() });
      const previous = queryClient.getQueryData<Requirement[]>(budgetRequirementsKeys.list());
      queryClient.setQueryData<Requirement[]>(budgetRequirementsKeys.list(), (old) => (old ?? []).map((r) => (r.id === id ? { ...r, ...updates } : r)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(budgetRequirementsKeys.list(), context.previous);
    },
    onSuccess: (_data, { id, updates }, context) => {
      const ev = decisionEvent(updates.status as string | undefined);
      if (!ev) return;
      const req = context?.previous?.find((r) => r.id === id);
      notify({
        eventType: ev,
        section: 'budget-requirements',
        targetRef: req?.ref,
        payload: { requestedBy: req?.who, label: req?.item },
      });
    },
  });
}

/** Undo restores the pre-mutation snapshot the screen captured — mirrors the prototype's own snapshot-based undo. */
export function useRestoreRequirements() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: Requirement[]) => api.restoreRequirements(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: budgetRequirementsKeys.list() });
      queryClient.setQueryData<Requirement[]>(budgetRequirementsKeys.list(), previous);
    },
  });
}

// ---- Budget Requests (item 17) ----

export function useBudgetRequests() {
  return useQuery({ queryKey: budgetRequirementsKeys.requests(), queryFn: api.fetchBudgetRequests });
}

export function useAddBudgetRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: BudgetRequest) => api.addBudgetRequest(entry),
    onMutate: async (entry) => {
      await queryClient.cancelQueries({ queryKey: budgetRequirementsKeys.requests() });
      queryClient.setQueryData<BudgetRequest[]>(budgetRequirementsKeys.requests(), (old) => [entry, ...(old ?? [])]);
    },
    onSuccess: (_data, entry) => {
      notify({
        eventType: 'budget_request.submitted',
        section: 'budget-requirements',
        targetRef: entry.ref,
        payload: { requestedBy: entry.requestedBy, amountNPR: entry.amountNPR, label: entry.title },
      });
    },
  });
}

export function useUpdateBudgetRequest() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; updates: Partial<BudgetRequest> }, { previous?: BudgetRequest[] }>({
    mutationFn: ({ id, updates }) => api.updateBudgetRequest(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: budgetRequirementsKeys.requests() });
      const previous = queryClient.getQueryData<BudgetRequest[]>(budgetRequirementsKeys.requests());
      queryClient.setQueryData<BudgetRequest[]>(budgetRequirementsKeys.requests(), (old) =>
        (old ?? []).map((r) => (r.id === id ? { ...r, ...updates } : r)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(budgetRequirementsKeys.requests(), context.previous);
    },
    onSuccess: (_data, { id, updates }, context) => {
      const ev = decisionEvent(updates.status as string | undefined);
      if (!ev) return;
      const req = context?.previous?.find((r) => r.id === id);
      notify({
        eventType: ev,
        section: 'budget-requirements',
        targetRef: req?.ref,
        payload: { requestedBy: req?.requestedBy, label: req?.title },
      });
    },
  });
}

export function useRestoreBudgetRequests() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: BudgetRequest[]) => api.restoreBudgetRequests(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: budgetRequirementsKeys.requests() });
      queryClient.setQueryData<BudgetRequest[]>(budgetRequirementsKeys.requests(), previous);
    },
  });
}
