export const salesKeys = {
  all: ['sales'] as const,
  list: () => [...salesKeys.all, 'list'] as const,
};
