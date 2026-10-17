export const marketingKeys = {
  all: ['marketing'] as const,
  list: () => [...marketingKeys.all, 'list'] as const,
};
