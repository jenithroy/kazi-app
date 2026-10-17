export const financeKeys = {
  all: ['finance'] as const,
  expenses: () => [...financeKeys.all, 'expenses'] as const,
  vatBills: () => [...financeKeys.all, 'vat-bills'] as const,
  accounts: () => [...financeKeys.all, 'accounts'] as const,
  journal: () => [...financeKeys.all, 'journal'] as const,
  bankTransactions: () => [...financeKeys.all, 'bank-transactions'] as const,
  orderCosts: () => [...financeKeys.all, 'order-costs'] as const,
  payroll: () => [...financeKeys.all, 'payroll'] as const,
};
