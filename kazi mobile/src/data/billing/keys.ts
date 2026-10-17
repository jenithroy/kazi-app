export const billingKeys = {
  all: ['billing'] as const,
  invoices: () => [...billingKeys.all, 'invoices'] as const,
  openChallans: () => [...billingKeys.all, 'open-challans'] as const,
  challans: () => [...billingKeys.all, 'challans'] as const,
  quotations: () => [...billingKeys.all, 'quotations'] as const,
};
