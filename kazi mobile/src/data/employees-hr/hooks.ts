import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notify } from '@/data/notifications/notify';

import { employeesKeys } from './keys';
import * as api from './api';
import type { Employee, MonthKey } from './types';

export function useEmployees() {
  return useQuery({ queryKey: employeesKeys.list(), queryFn: api.fetchEmployees });
}

/** The Role picker's options. Reference data — cached for the session. */
export function usePositions() {
  return useQuery({ queryKey: employeesKeys.positions(), queryFn: api.fetchPositions, staleTime: Infinity });
}

export function useAddEmployee() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, Employee, UpdateContext>({
    mutationFn: (employee: Employee) => api.addEmployee(employee),
    onMutate: async (employee) => {
      await queryClient.cancelQueries({ queryKey: employeesKeys.list() });
      const previous = queryClient.getQueryData<Employee[]>(employeesKeys.list());
      queryClient.setQueryData<Employee[]>(employeesKeys.list(), (old) => [...(old ?? []), employee]);
      return { previous };
    },
    // Without this a rejected insert leaves its placeholder row in the
    // directory — and in the payroll gross.
    onError: (_err, _employee, context) => {
      if (context?.previous) queryClient.setQueryData(employeesKeys.list(), context.previous);
    },
    onSuccess: (_data, employee) => {
      notify({ eventType: 'employee.added', section: 'employees-hr', payload: { label: employee.name } });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: employeesKeys.list() });
    },
  });
}

interface UpdateContext {
  previous?: Employee[];
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: number; updates: Partial<Employee> }, UpdateContext>({
    mutationFn: ({ id, updates }) => api.updateEmployee(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: employeesKeys.list() });
      const previous = queryClient.getQueryData<Employee[]>(employeesKeys.list());
      queryClient.setQueryData<Employee[]>(employeesKeys.list(), (old) => (old ?? []).map((e) => (e.id === id ? { ...e, ...updates } : e)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(employeesKeys.list(), context.previous);
    },
    onSuccess: (_data, { id, updates }, context) => {
      if (updates.active !== false) return;
      const emp = context?.previous?.find((e) => e.id === id);
      if (emp?.active === false) return;
      notify({
        eventType: 'employee.deactivated',
        section: 'employees-hr',
        payload: { label: emp?.name, employee: emp?.name },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: employeesKeys.list() });
    },
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteEmployee(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: employeesKeys.list() });
      const previous = queryClient.getQueryData<Employee[]>(employeesKeys.list());
      const removed = previous?.find((e) => e.id === id);
      // A soft delete, so the row stays — dimmed, with an Inactive pill — rather
      // than vanishing and reappearing on the next read.
      queryClient.setQueryData<Employee[]>(employeesKeys.list(), (old) =>
        (old ?? []).map((e) => (e.id === id ? { ...e, active: false } : e)),
      );
      return { previous, removed };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(employeesKeys.list(), context.previous);
    },
    onSuccess: (_data, _id, context) => {
      if (!context?.removed) return;
      notify({
        eventType: 'employee.deactivated',
        section: 'employees-hr',
        payload: { label: context.removed.name, employee: context.removed.name },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: employeesKeys.list() });
    },
  });
}

export function useRestoreEmployees() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: Employee[]) => api.restoreEmployees(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: employeesKeys.list() });
      queryClient.setQueryData<Employee[]>(employeesKeys.list(), previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: employeesKeys.list() });
    },
  });
}

/** The stored payroll periods, newest first. Empty when nothing has been filed. */
export function usePayMonths() {
  return useQuery({ queryKey: employeesKeys.payMonths(), queryFn: api.fetchPayMonths });
}

export function useApprovals() {
  return useQuery({ queryKey: employeesKeys.approvals(), queryFn: api.fetchApprovals });
}

export function useApproveMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: MonthKey) => api.approveMonth(key),
    onMutate: async (key) => {
      await queryClient.cancelQueries({ queryKey: employeesKeys.approvals() });
      queryClient.setQueryData<Record<string, boolean>>(employeesKeys.approvals(), (old) => ({ ...(old ?? {}), [key]: true }));
    },
    onSuccess: (_data, key) => {
      notify({ eventType: 'payroll.run_finalised', section: 'employees-hr', payload: { label: key } });
    },
  });
}
