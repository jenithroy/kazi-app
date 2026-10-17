import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notify } from '@/data/notifications/notify';

import { bugReportKeys } from './keys';
import * as api from './api';
import type { BugReport, BugReportDraft, BugStatus } from './types';

const STATUS_LABEL: Record<BugStatus, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function useBugReports() {
  return useQuery({ queryKey: bugReportKeys.list(), queryFn: api.fetchBugReports });
}

export function useAddBugReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ draft, reportedBy }: { draft: BugReportDraft; reportedBy: string }) => api.addBugReport(draft, reportedBy),
    // No admin notification: reports live only in this phone's memory, so telling
    // a system admin about one would deep-link them to a list that cannot hold it.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bugReportKeys.list() });
    },
  });
}

interface StatusContext {
  previous?: BugReport[];
}

export function useUpdateBugStatus() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; status: BugStatus }, StatusContext>({
    mutationFn: ({ id, status }) => api.updateBugStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: bugReportKeys.list() });
      const previous = queryClient.getQueryData<BugReport[]>(bugReportKeys.list());
      queryClient.setQueryData<BugReport[]>(bugReportKeys.list(), (old) => (old ?? []).map((r) => (r.id === id ? { ...r, status } : r)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(bugReportKeys.list(), context.previous);
    },
    onSuccess: (_data, { id, status }, context) => {
      const prev = context?.previous?.find((r) => r.id === id);
      notify({
        eventType: 'bug_report.status_changed',
        section: 'bug-report',
        targetRef: prev?.ref,
        payload: { submittedBy: prev?.reportedBy, status: STATUS_LABEL[status] },
      });
    },
  });
}

/** Undo restores the pre-change snapshot the screen captured. */
export function useRestoreBugReports() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: BugReport[]) => api.restoreBugReports(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: bugReportKeys.list() });
      queryClient.setQueryData<BugReport[]>(bugReportKeys.list(), previous);
    },
  });
}
