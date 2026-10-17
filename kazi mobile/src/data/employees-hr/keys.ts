export const employeesKeys = {
  all: ['employees-hr'] as const,
  list: () => [...employeesKeys.all, 'list'] as const,
  payMonths: () => [...employeesKeys.all, 'pay-months'] as const,
  approvals: () => [...employeesKeys.all, 'approvals'] as const,
  positions: () => [...employeesKeys.all, 'positions'] as const,
};
