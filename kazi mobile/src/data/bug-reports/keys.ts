export const bugReportKeys = {
  all: ['bug-reports'] as const,
  list: () => [...bugReportKeys.all, 'list'] as const,
};
