import { simulateLatency } from '../mock/delay';
import { DEFAULT_ACCOUNTS, seedBankTransactions, seedExpenses, seedJournalEntries, seedOrderCosts, seedVatBills } from './mock';
import type { Account, BankTransaction, Expense, JournalEntry, OrderCosts, PayrollRun, VatBill } from './types';

let expenseDb: Expense[] = [...seedExpenses];
let vatBillDb: VatBill[] = [...seedVatBills];
let accountDb: Account[] = DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
let journalDb: JournalEntry[] = [...seedJournalEntries];
let bankTxDb: BankTransaction[] = [...seedBankTransactions];
let orderCostsDb: OrderCosts[] = seedOrderCosts.map((c) => ({ ...c }));

// ---- Expenses ----

export async function fetchExpenses(): Promise<Expense[]> {
  await simulateLatency();
  return [...expenseDb];
}

export async function addExpense(expense: Expense): Promise<void> {
  await simulateLatency(300);
  expenseDb = [expense, ...expenseDb];
}

export async function updateExpense(id: string, updates: Partial<Expense>): Promise<void> {
  await simulateLatency(250);
  expenseDb = expenseDb.map((e) => (e.id === id ? { ...e, ...updates } : e));
}

export async function deleteExpense(id: string): Promise<void> {
  await simulateLatency(250);
  expenseDb = expenseDb.filter((e) => e.id !== id);
  // Cascade: a VAT bill has no meaning without its expense.
  vatBillDb = vatBillDb.filter((b) => b.expenseId !== id);
}

export async function restoreExpenses(previous: Expense[]): Promise<void> {
  await simulateLatency(150);
  expenseDb = [...previous];
}

// ---- VAT bills ----

export async function fetchVatBills(): Promise<VatBill[]> {
  await simulateLatency();
  return [...vatBillDb];
}

export async function addVatBill(bill: VatBill): Promise<void> {
  await simulateLatency(300);
  vatBillDb = [bill, ...vatBillDb];
  expenseDb = expenseDb.map((e) => (e.id === bill.expenseId ? { ...e, vatBill: true } : e));
}

export async function deleteVatBill(id: string): Promise<void> {
  await simulateLatency(250);
  const removed = vatBillDb.find((b) => b.id === id);
  vatBillDb = vatBillDb.filter((b) => b.id !== id);
  if (removed && !vatBillDb.some((b) => b.expenseId === removed.expenseId)) {
    expenseDb = expenseDb.map((e) => (e.id === removed.expenseId ? { ...e, vatBill: false } : e));
  }
}

export async function restoreVatBills(previous: VatBill[]): Promise<void> {
  await simulateLatency(150);
  vatBillDb = [...previous];
}

// ---- Chart of accounts ----

export async function fetchAccounts(): Promise<Account[]> {
  await simulateLatency();
  return [...accountDb];
}

export async function updateAccountOpening(id: string, openingBalanceNPR: number): Promise<void> {
  await simulateLatency(200);
  accountDb = accountDb.map((a) => (a.id === id ? { ...a, openingBalanceNPR } : a));
}

// ---- Journal entries ----

export async function fetchJournalEntries(): Promise<JournalEntry[]> {
  await simulateLatency();
  return [...journalDb];
}

export async function addJournalEntry(entry: JournalEntry): Promise<void> {
  await simulateLatency(300);
  journalDb = [entry, ...journalDb];
}

export async function updateJournalEntry(id: string, updates: Partial<JournalEntry>): Promise<void> {
  await simulateLatency(250);
  journalDb = journalDb.map((e) => (e.id === id ? { ...e, ...updates } : e));
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await simulateLatency(250);
  journalDb = journalDb.filter((e) => e.id !== id);
}

export async function restoreJournalEntries(previous: JournalEntry[]): Promise<void> {
  await simulateLatency(150);
  journalDb = [...previous];
}

// ---- Bank transactions (manual side of the eSewa/Fonepay webhook feed) ----

export async function fetchBankTransactions(): Promise<BankTransaction[]> {
  await simulateLatency();
  return [...bankTxDb];
}

export async function addBankTransaction(tx: BankTransaction): Promise<void> {
  await simulateLatency(300);
  bankTxDb = [tx, ...bankTxDb];
}

export async function updateBankTransaction(id: string, updates: Partial<BankTransaction>): Promise<void> {
  await simulateLatency(250);
  bankTxDb = bankTxDb.map((t) => (t.id === id ? { ...t, ...updates } : t));
}

export async function deleteBankTransaction(id: string): Promise<void> {
  await simulateLatency(250);
  bankTxDb = bankTxDb.filter((t) => t.id !== id);
}

export async function restoreBankTransactions(previous: BankTransaction[]): Promise<void> {
  await simulateLatency(150);
  bankTxDb = [...previous];
}

// ---- Payroll (read-only) ----

/**
 * No seeds: payroll runs are real money paid to real people, and inventing them
 * would put made-up figures back into the fiscal-year totals this replaced.
 */
export async function fetchPayroll(): Promise<PayrollRun[]> {
  await simulateLatency();
  return [];
}

// ---- Order costs (Order P&L tab) ----

export async function fetchOrderCosts(): Promise<OrderCosts[]> {
  await simulateLatency();
  return [...orderCostsDb];
}

/** Upsert by `orderId` — one cost record per order (doc id = orderId in the live shape). */
export async function upsertOrderCosts(costs: OrderCosts): Promise<void> {
  await simulateLatency(300);
  const exists = orderCostsDb.some((c) => c.orderId === costs.orderId);
  orderCostsDb = exists
    ? orderCostsDb.map((c) => (c.orderId === costs.orderId ? costs : c))
    : [costs, ...orderCostsDb];
}

export async function deleteOrderCosts(orderId: string): Promise<void> {
  await simulateLatency(250);
  orderCostsDb = orderCostsDb.filter((c) => c.orderId !== orderId);
}

export async function restoreOrderCosts(previous: OrderCosts[]): Promise<void> {
  await simulateLatency(150);
  orderCostsDb = [...previous];
}
