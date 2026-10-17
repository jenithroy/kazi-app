import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notify } from '@/data/notifications/notify';

import { financeKeys } from './keys';
import * as api from './api';
import type { Account, BankTransaction, Expense, JournalEntry, OrderCosts, VatBill } from './types';

const LARGE_AMOUNT_NPR = 100_000;

function largeAmountNotify(amountNPR: number, label: string, ref?: string) {
  if (amountNPR < LARGE_AMOUNT_NPR) return;
  notify({ eventType: 'finance.large_amount', section: 'finance', targetRef: ref, payload: { amountNPR, label } });
}

// ---- Expenses ----

export function useExpenses() {
  return useQuery({ queryKey: financeKeys.expenses(), queryFn: api.fetchExpenses });
}

export function useAddExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expense: Expense) => api.addExpense(expense),
    onMutate: async (expense) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.expenses() });
      queryClient.setQueryData<Expense[]>(financeKeys.expenses(), (old) => [expense, ...(old ?? [])]);
    },
    onSuccess: (_data, expense) => {
      notify({
        eventType: 'expense.logged',
        section: 'finance',
        targetRef: expense.id,
        payload: { loggedBy: expense.loggedBy, amountNPR: expense.amountNPR, label: expense.name },
      });
      largeAmountNotify(expense.amountNPR, `Expense — ${expense.name}`, expense.id);
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Expense> }) => api.updateExpense(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.expenses() });
      queryClient.setQueryData<Expense[]>(financeKeys.expenses(), (old) =>
        (old ?? []).map((e) => (e.id === id ? { ...e, ...updates } : e)),
      );
    },
    onSuccess: (_data, { id, updates }) => {
      if (String(updates.status ?? '').toLowerCase() !== 'paid') return;
      const exp = queryClient.getQueryData<Expense[]>(financeKeys.expenses())?.find((e) => e.id === id);
      notify({
        eventType: 'expense.marked_paid',
        section: 'finance',
        targetRef: id,
        payload: { loggedBy: exp?.loggedBy, label: exp?.name },
      });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteExpense(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.expenses() });
      queryClient.setQueryData<Expense[]>(financeKeys.expenses(), (old) => (old ?? []).filter((e) => e.id !== id));
      queryClient.setQueryData<VatBill[]>(financeKeys.vatBills(), (old) => (old ?? []).filter((b) => b.expenseId !== id));
    },
  });
}

/** Undo restores the pre-mutation snapshot the screen captured — mirrors the prototype's own snapshot-based undo. */
export function useUndoExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: Expense[]) => api.restoreExpenses(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.expenses() });
      queryClient.setQueryData<Expense[]>(financeKeys.expenses(), previous);
    },
  });
}

// ---- VAT bills ----

export function useVatBills() {
  return useQuery({ queryKey: financeKeys.vatBills(), queryFn: api.fetchVatBills });
}

export function useAddVatBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bill: VatBill) => api.addVatBill(bill),
    onMutate: async (bill) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.vatBills() });
      queryClient.setQueryData<VatBill[]>(financeKeys.vatBills(), (old) => [bill, ...(old ?? [])]);
      queryClient.setQueryData<Expense[]>(financeKeys.expenses(), (old) =>
        (old ?? []).map((e) => (e.id === bill.expenseId ? { ...e, vatBill: true } : e)),
      );
    },
  });
}

export function useDeleteVatBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteVatBill(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.vatBills() });
      queryClient.setQueryData<VatBill[]>(financeKeys.vatBills(), (old) => (old ?? []).filter((b) => b.id !== id));
    },
  });
}

export function useUndoVatBills() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: VatBill[]) => api.restoreVatBills(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.vatBills() });
      queryClient.setQueryData<VatBill[]>(financeKeys.vatBills(), previous);
    },
  });
}

// ---- Chart of accounts ----

export function useAccounts() {
  return useQuery({ queryKey: financeKeys.accounts(), queryFn: api.fetchAccounts });
}

export function useUpdateAccountOpening() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, openingBalanceNPR }: { id: string; openingBalanceNPR: number }) =>
      api.updateAccountOpening(id, openingBalanceNPR),
    onMutate: async ({ id, openingBalanceNPR }) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.accounts() });
      queryClient.setQueryData<Account[]>(financeKeys.accounts(), (old) =>
        (old ?? []).map((a) => (a.id === id ? { ...a, openingBalanceNPR } : a)),
      );
    },
  });
}

// ---- Journal entries ----

export function useJournalEntries() {
  return useQuery({ queryKey: financeKeys.journal(), queryFn: api.fetchJournalEntries });
}

export function useAddJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: JournalEntry) => api.addJournalEntry(entry),
    onMutate: async (entry) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.journal() });
      queryClient.setQueryData<JournalEntry[]>(financeKeys.journal(), (old) => [entry, ...(old ?? [])]);
    },
    onSuccess: (_data, entry) => {
      notify({
        eventType: 'journal.posted',
        section: 'accounting',
        targetRef: entry.reference,
        payload: { createdBy: entry.createdBy, amountNPR: entry.amountNPR, label: entry.description },
      });
      largeAmountNotify(entry.amountNPR, `Journal — ${entry.description}`, entry.reference);
    },
  });
}

export function useUpdateJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<JournalEntry> }) => api.updateJournalEntry(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.journal() });
      queryClient.setQueryData<JournalEntry[]>(financeKeys.journal(), (old) =>
        (old ?? []).map((e) => (e.id === id ? { ...e, ...updates } : e)),
      );
    },
  });
}

export function useDeleteJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteJournalEntry(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.journal() });
      queryClient.setQueryData<JournalEntry[]>(financeKeys.journal(), (old) => (old ?? []).filter((e) => e.id !== id));
    },
  });
}

export function useUndoJournalEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: JournalEntry[]) => api.restoreJournalEntries(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.journal() });
      queryClient.setQueryData<JournalEntry[]>(financeKeys.journal(), previous);
    },
  });
}

// ---- Bank transactions ----

export function useBankTransactions() {
  return useQuery({ queryKey: financeKeys.bankTransactions(), queryFn: api.fetchBankTransactions });
}

export function useAddBankTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tx: BankTransaction) => api.addBankTransaction(tx),
    onMutate: async (tx) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.bankTransactions() });
      queryClient.setQueryData<BankTransaction[]>(financeKeys.bankTransactions(), (old) => [tx, ...(old ?? [])]);
    },
    onSuccess: (_data, tx) => {
      notify({
        eventType: 'bank.tx_imported',
        section: 'finance',
        targetRef: tx.reference,
        payload: { loggedBy: tx.loggedBy, amountNPR: tx.amountNPR, label: tx.description },
      });
      largeAmountNotify(tx.amountNPR, `Bank — ${tx.description}`, tx.reference);
    },
  });
}

export function useUpdateBankTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<BankTransaction> }) => api.updateBankTransaction(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.bankTransactions() });
      queryClient.setQueryData<BankTransaction[]>(financeKeys.bankTransactions(), (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, ...updates } : t)),
      );
    },
  });
}

export function useDeleteBankTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteBankTransaction(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.bankTransactions() });
      queryClient.setQueryData<BankTransaction[]>(financeKeys.bankTransactions(), (old) => (old ?? []).filter((t) => t.id !== id));
    },
  });
}

export function useUndoBankTransactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: BankTransaction[]) => api.restoreBankTransactions(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.bankTransactions() });
      queryClient.setQueryData<BankTransaction[]>(financeKeys.bankTransactions(), previous);
    },
  });
}

// ---- Order costs (Order P&L tab) ----

export function useOrderCosts() {
  return useQuery({ queryKey: financeKeys.orderCosts(), queryFn: api.fetchOrderCosts });
}

/** Read-only — payroll is written from Employees, this is the fiscal-year figures' source. */
export function usePayroll() {
  return useQuery({ queryKey: financeKeys.payroll(), queryFn: api.fetchPayroll });
}

export function useUpsertOrderCosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (costs: OrderCosts) => api.upsertOrderCosts(costs),
    onMutate: async (costs) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.orderCosts() });
      queryClient.setQueryData<OrderCosts[]>(financeKeys.orderCosts(), (old) => {
        const list = old ?? [];
        return list.some((c) => c.orderId === costs.orderId)
          ? list.map((c) => (c.orderId === costs.orderId ? costs : c))
          : [costs, ...list];
      });
    },
  });
}

export function useDeleteOrderCosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api.deleteOrderCosts(orderId),
    onMutate: async (orderId) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.orderCosts() });
      queryClient.setQueryData<OrderCosts[]>(financeKeys.orderCosts(), (old) => (old ?? []).filter((c) => c.orderId !== orderId));
    },
  });
}

/** Undo restores the pre-mutation snapshot the screen captured. */
export function useUndoOrderCosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: OrderCosts[]) => api.restoreOrderCosts(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: financeKeys.orderCosts() });
      queryClient.setQueryData<OrderCosts[]>(financeKeys.orderCosts(), previous);
    },
  });
}
