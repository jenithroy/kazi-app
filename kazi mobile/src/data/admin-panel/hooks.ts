import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notify } from '@/data/notifications/notify';

import { adminPanelKeys } from './keys';
import * as api from './api';
import type { AdminMatrix, RoleDraft, RoleFields } from './types';

/** Roles, sections, finance tabs, both permission tables and the roll, in one read. */
export function useAdminMatrix() {
  return useQuery({ queryKey: adminPanelKeys.matrix(), queryFn: api.fetchAdminMatrix });
}

/**
 * Commit a staged draft.
 *
 * Deliberately NOT optimistic. Everything else in the app paints the change
 * first and rolls back on failure, but here the tier-4 trigger and the
 * "can't reduce a super admin" guard mean the row that lands is not always the
 * row that was sent — so the screen waits and re-reads what the database
 * actually did.
 */
export function useSaveRoleDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, draft }: { roleId: string; draft: RoleDraft; roleLabel: string; holders: string[]; changeCount: number }) =>
      api.saveRoleDraft({ roleId, draft }),
    onSuccess: (_data, { roleLabel, holders, changeCount }) => {
      queryClient.invalidateQueries({ queryKey: adminPanelKeys.matrix() });
      notify({
        eventType: 'permissions.changed',
        section: 'admin-panel',
        payload: { label: roleLabel, count: changeCount, people: holders },
      });
    },
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fields: RoleFields) => api.createRole(fields),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminPanelKeys.matrix() }),
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fields: RoleFields) => api.updateRole(fields),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminPanelKeys.matrix() }),
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => api.deleteRole(roleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminPanelKeys.matrix() }),
  });
}

interface PersonContext {
  previous?: AdminMatrix;
}

/**
 * People are written as you go — one tap, one row, no draft. Optimistic,
 * because unlike the matrix this write has no trigger behind it: the row that
 * lands is the row that was sent.
 */
export function useSetPersonRole() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { personId: string; positionId: string | null; personName: string }, PersonContext>({
    mutationFn: ({ personId, positionId }) => api.setPersonRole({ personId, positionId }),
    onMutate: async ({ personId, positionId }) => {
      await queryClient.cancelQueries({ queryKey: adminPanelKeys.matrix() });
      const previous = queryClient.getQueryData<AdminMatrix>(adminPanelKeys.matrix());
      queryClient.setQueryData<AdminMatrix>(adminPanelKeys.matrix(), (old) =>
        old ? { ...old, people: old.people.map((p) => (p.id === personId ? { ...p, positionId } : p)) } : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(adminPanelKeys.matrix(), context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminPanelKeys.matrix() }),
  });
}
