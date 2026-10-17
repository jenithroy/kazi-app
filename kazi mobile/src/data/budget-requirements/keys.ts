export const budgetRequirementsKeys = {
  all: ['budget-requirements'] as const,
  list: () => [...budgetRequirementsKeys.all, 'list'] as const,
  requests: () => [...budgetRequirementsKeys.all, 'requests'] as const,
};
