export const tasksKeys = {
  all: ['tasks'] as const,
  list: () => [...tasksKeys.all, 'list'] as const,
  assignees: () => [...tasksKeys.all, 'assignees'] as const,
};
