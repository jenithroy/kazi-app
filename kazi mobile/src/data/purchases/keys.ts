export const purchasesKeys = {
  all: ['purchases'] as const,
  list: () => [...purchasesKeys.all, 'list'] as const,
};
