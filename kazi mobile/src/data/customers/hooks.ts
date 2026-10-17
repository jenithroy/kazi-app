import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { customersKeys } from './keys';
import * as api from './api';
import type { Customer } from './types';

export function useCustomers() {
  return useQuery({ queryKey: customersKeys.list(), queryFn: api.fetchCustomers });
}

interface UpdateContext {
  previous?: Customer[];
}

export function useAddCustomer() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, Customer, UpdateContext>({
    mutationFn: (customer: Customer) => api.addCustomer(customer),
    onMutate: async (customer) => {
      await queryClient.cancelQueries({ queryKey: customersKeys.list() });
      const previous = queryClient.getQueryData<Customer[]>(customersKeys.list());
      queryClient.setQueryData<Customer[]>(customersKeys.list(), (old) => [...(old ?? []), customer]);
      return { previous };
    },
    onError: (_err, _customer, context) => {
      if (context?.previous) queryClient.setQueryData(customersKeys.list(), context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: customersKeys.list() }),
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; updates: Partial<Customer> }, UpdateContext>({
    mutationFn: ({ id, updates }) => api.updateCustomer(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: customersKeys.list() });
      const previous = queryClient.getQueryData<Customer[]>(customersKeys.list());
      queryClient.setQueryData<Customer[]>(customersKeys.list(), (old) => (old ?? []).map((c) => (c.id === id ? { ...c, ...updates } : c)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(customersKeys.list(), context.previous);
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string, UpdateContext>({
    mutationFn: (id) => api.deleteCustomer(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: customersKeys.list() });
      const previous = queryClient.getQueryData<Customer[]>(customersKeys.list());
      queryClient.setQueryData<Customer[]>(customersKeys.list(), (old) => (old ?? []).filter((c) => c.id !== id));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(customersKeys.list(), context.previous);
    },
  });
}

/** Undo a delete — the row goes back into Postgres at its original id. */
export function useRestoreCustomers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: Customer[]) => api.restoreCustomers(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: customersKeys.list() });
      queryClient.setQueryData<Customer[]>(customersKeys.list(), previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: customersKeys.list() }),
  });
}
