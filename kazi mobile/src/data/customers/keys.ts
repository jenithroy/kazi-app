export const customersKeys = {
  all: ['customers'] as const,
  list: () => [...customersKeys.all, 'list'] as const,
};
