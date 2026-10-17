/**
 * Live finance writers — the reference ERP's own collections:
 *   expenses          → `finance_expenses`
 *   journal entries   → `journal_entries`
 *   bank transactions → `bank_transactions`
 *   VAT bills         → `vat_bills`
 *   order costs       → `order_costs`
 *
 *   opening balances  → `accounts.opening_balance_npr`
 *
 * `region` is never written on any of them — it is left to the web ERP.
 */

import { str } from '@/lib/data/normalise';
import { readCollectionWhere, readDocument } from '@/lib/supabase/read';
import { createDocument, patchDocument, removeDocument } from '@/lib/supabase/write';
import { getActor } from '@/data/notifications/actor';

import { expenseCategory } from './mock';

import type { BankTransaction, Expense, JournalEntry, OrderCosts, VatBill } from './types';

const EXPENSES = 'finance_expenses';
const JOURNAL = 'journal_entries';
const BANK = 'bank_transactions';
const ACCOUNTS = 'accounts';
const VAT_BILLS = 'vat_bills';
const ORDER_COSTS = 'order_costs';

export async function updateAccountOpening(id: string, openingBalanceNPR: number): Promise<void> {
  await patchDocument(ACCOUNTS, id, { openingBalanceNPR });
}

// ---- Expenses ----

function expenseToLive(e: Partial<Expense>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // The live column is free text holding the reference's own category string.
  if (e.category !== undefined) out.category = expenseCategory(e.category).label;
  if (e.amountNPR !== undefined) out.amountNPR = e.amountNPR;
  if (e.date !== undefined) out.date = e.date;
  if (e.note !== undefined || e.name !== undefined) out.note = e.note || e.name || '';
  if (e.vatBill !== undefined) out.vatBill = e.vatBill;
  if (e.status !== undefined) out.status = e.status;
  return out;
}

export async function addExpense(expense: Expense): Promise<void> {
  await createDocument(EXPENSES, { ...expenseToLive(expense), loggedBy: getActor()?.name ?? 'kazi-mobile' });
}

export async function updateExpense(id: string, updates: Partial<Expense>): Promise<void> {
  const fields = expenseToLive(updates);
  if (Object.keys(fields).length > 0) await patchDocument(EXPENSES, id, fields);
}

export async function deleteExpense(id: string): Promise<void> {
  await removeDocument(EXPENSES, id);
}

export async function restoreExpenses(_previous: Expense[]): Promise<void> {
  /* snapshot undo — not reversed in Postgres this pass */
}

// ---- Journal entries ----

function journalToLive(e: Partial<JournalEntry>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (e.date !== undefined) out.date = e.date;
  if (e.description !== undefined) out.description = e.description;
  if (e.debitAccount !== undefined) out.debitAccount = e.debitAccount;
  if (e.creditAccount !== undefined) out.creditAccount = e.creditAccount;
  if (e.amountNPR !== undefined) out.amountNPR = e.amountNPR;
  if (e.reference !== undefined) out.reference = e.reference;
  return out;
}

export async function addJournalEntry(entry: JournalEntry): Promise<void> {
  await createDocument(JOURNAL, { ...journalToLive(entry), createdBy: entry.createdBy || getActor()?.name || 'kazi-mobile' });
}

export async function updateJournalEntry(id: string, updates: Partial<JournalEntry>): Promise<void> {
  const fields = journalToLive(updates);
  if (Object.keys(fields).length > 0) await patchDocument(JOURNAL, id, fields);
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await removeDocument(JOURNAL, id);
}

export async function restoreJournalEntries(_previous: JournalEntry[]): Promise<void> {
  /* snapshot undo — not reversed in Postgres this pass */
}

// ---- Bank transactions ----

function bankToLive(t: Partial<BankTransaction>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (t.date !== undefined) out.date = t.date;
  if (t.direction !== undefined) out.type = t.direction;
  if (t.amountNPR !== undefined) out.amount = t.amountNPR;
  if (t.description !== undefined) out.remarks = t.description;
  return out;
}

export async function addBankTransaction(tx: BankTransaction): Promise<void> {
  await createDocument(BANK, bankToLive(tx));
}

export async function updateBankTransaction(id: string, updates: Partial<BankTransaction>): Promise<void> {
  const fields = bankToLive(updates);
  if (Object.keys(fields).length > 0) await patchDocument(BANK, id, fields);
}

export async function deleteBankTransaction(id: string): Promise<void> {
  await removeDocument(BANK, id);
}

export async function restoreBankTransactions(_previous: BankTransaction[]): Promise<void> {
  /* snapshot undo — not reversed in Postgres this pass */
}

// ---- VAT bills ----

export async function addVatBill(bill: VatBill): Promise<void> {
  await createDocument(VAT_BILLS, {
    expenseId: bill.expenseId,
    expenseItem: bill.item,
    fileName: bill.fileName,
    fileType: bill.kind === 'pdf' ? 'application/pdf' : 'image/jpeg',
    uploadedBy: bill.uploadedBy || getActor()?.name || 'kazi-mobile',
    uploadedAt: `${bill.date}T00:00:00Z`,
  });
}

export async function deleteVatBill(id: string): Promise<void> {
  await removeDocument(VAT_BILLS, id);
}

// ---- Order costs ----

/** Row ids of the cost record(s) for an order — nothing enforces one per order. */
async function orderCostRowIds(orderId: string): Promise<string[]> {
  return readCollectionWhere(ORDER_COSTS, { linkedOrderId: orderId }, (id) => id);
}

export async function upsertOrderCosts(costs: OrderCosts): Promise<void> {
  const fields = {
    materialNPR: costs.material,
    labourNPR: costs.labour,
    overheadNPR: costs.overhead,
    shippingNPR: costs.shipping,
    totalNPR: costs.material + costs.labour + costs.overhead + costs.shipping,
    // There is no `updated_by` column; sending one makes PostgREST reject the
    // whole statement, so the last editor goes in the only actor field there is.
    createdBy: costs.updatedBy || getActor()?.name || 'kazi-mobile',
    updatedAt: new Date().toISOString(),
  };

  const existing = await orderCostRowIds(costs.orderId);
  if (existing.length > 0) {
    for (const id of existing) await patchDocument(ORDER_COSTS, id, fields);
    return;
  }

  const order = await readDocument('orders', costs.orderId);
  await createDocument(ORDER_COSTS, {
    ...fields,
    orderId: costs.orderId,
    // `order_ref` is NOT NULL, so the uuid stands in when the order is gone.
    orderRef: str(order?.orderId).trim() || costs.orderId,
  });
}

export async function deleteOrderCosts(orderId: string): Promise<void> {
  for (const id of await orderCostRowIds(orderId)) await removeDocument(ORDER_COSTS, id);
}
