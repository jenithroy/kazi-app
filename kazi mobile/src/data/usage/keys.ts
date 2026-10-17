export const usageKeys = {
  all: ['usage'] as const,
  daily: (since: string | null) => [...usageKeys.all, 'daily', since ?? 'all'] as const,
  feed: (since: string | null) => [...usageKeys.all, 'feed', since ?? 'all'] as const,
};
