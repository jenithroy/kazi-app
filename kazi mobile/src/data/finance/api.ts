/**
 * Data-source selector for the finance module.
 *   reads  → expenses / accounts / journal / bank / VAT bills / order costs from
 *            Supabase when configured
 *   writes → expenses / journal / bank / VAT bills / order costs to Supabase when
 *            configured, mirrored to mock
 *
 * Snapshot-undo restores are not reversed server-side.
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';
import { liveWrite } from '@/lib/supabase/write';

import * as live from './supabase';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';

// Mock-only: no live collection / field, or the rules forbid it.
// `deleteJournalEntry` — `journal_entries` is `allow delete: if false` (ledger
// entries are immutable in the reference ERP); the mobile delete is local only.
export {
  restoreVatBills,
  restoreOrderCosts,
  deleteJournalEntry,
} from './mock-api';

export const updateAccountOpening = liveWrite(
  'finance/updateAccountOpening',
  writeLive.updateAccountOpening,
  mock.updateAccountOpening,
);

export const fetchExpenses = isSupabaseConfigured
  ? liveRead('finance/expenses', live.fetchExpenses)
  : mock.fetchExpenses;

export const fetchAccounts = isSupabaseConfigured
  ? liveRead('finance/accounts', live.fetchAccounts)
  : mock.fetchAccounts;

export const fetchJournalEntries = isSupabaseConfigured
  ? liveRead('finance/journal', live.fetchJournalEntries)
  : mock.fetchJournalEntries;

export const fetchBankTransactions = isSupabaseConfigured
  ? liveRead('finance/bank', live.fetchBankTransactions)
  : mock.fetchBankTransactions;

export const fetchVatBills = isSupabaseConfigured
  ? liveRead('finance/vatBills', live.fetchVatBills)
  : mock.fetchVatBills;

export const fetchOrderCosts = isSupabaseConfigured
  ? liveRead('finance/orderCosts', live.fetchOrderCosts)
  : mock.fetchOrderCosts;

export const fetchPayroll = isSupabaseConfigured
  ? liveRead('finance/payroll', live.fetchPayroll)
  : mock.fetchPayroll;

export const addExpense = liveWrite('finance/addExpense', writeLive.addExpense, mock.addExpense);
export const updateExpense = liveWrite('finance/updateExpense', writeLive.updateExpense, mock.updateExpense);
export const deleteExpense = liveWrite('finance/deleteExpense', writeLive.deleteExpense, mock.deleteExpense);
export const restoreExpenses = liveWrite('finance/restoreExpenses', writeLive.restoreExpenses, mock.restoreExpenses);

export const addJournalEntry = liveWrite('finance/addJournalEntry', writeLive.addJournalEntry, mock.addJournalEntry);
export const updateJournalEntry = liveWrite('finance/updateJournalEntry', writeLive.updateJournalEntry, mock.updateJournalEntry);
export const restoreJournalEntries = liveWrite(
  'finance/restoreJournalEntries',
  writeLive.restoreJournalEntries,
  mock.restoreJournalEntries,
);

export const addBankTransaction = liveWrite('finance/addBankTransaction', writeLive.addBankTransaction, mock.addBankTransaction);
export const updateBankTransaction = liveWrite(
  'finance/updateBankTransaction',
  writeLive.updateBankTransaction,
  mock.updateBankTransaction,
);
export const deleteBankTransaction = liveWrite(
  'finance/deleteBankTransaction',
  writeLive.deleteBankTransaction,
  mock.deleteBankTransaction,
);
export const restoreBankTransactions = liveWrite(
  'finance/restoreBankTransactions',
  writeLive.restoreBankTransactions,
  mock.restoreBankTransactions,
);

export const addVatBill = liveWrite('finance/addVatBill', writeLive.addVatBill, mock.addVatBill);
export const deleteVatBill = liveWrite('finance/deleteVatBill', writeLive.deleteVatBill, mock.deleteVatBill);

export const upsertOrderCosts = liveWrite('finance/upsertOrderCosts', writeLive.upsertOrderCosts, mock.upsertOrderCosts);
export const deleteOrderCosts = liveWrite('finance/deleteOrderCosts', writeLive.deleteOrderCosts, mock.deleteOrderCosts);
