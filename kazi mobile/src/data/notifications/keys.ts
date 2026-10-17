export const notificationKeys = {
  all: ['notifications'] as const,
  list: (email: string) => [...notificationKeys.all, 'list', email] as const,
  roster: () => [...notificationKeys.all, 'roster'] as const,
};
