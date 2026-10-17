/**
 * Live finance readers: `finance_expenses`, `accounts`, `journal_entries`,
 * `bank_transactions`, `vat_bills`, `order_costs`.
 *
 * Live shapes (accounts re-sampled 2026-09-25):
 *   finance_expenses    { category (free text), amountNPR, date, note, vatBill, status ("Paid"), loggedBy, createdAt }
 *   accounts            { name, type (Asset/Liability/Equity/Income/Expense), isBank, openingBalanceNPR, createdAt } — ~114 docs
 *   journal_entries     { date, description, debitAccount, creditAccount, amountNPR, reference, createdBy, createdAt }
 *   bank_transactions   { date ("2026-07-31 20:01"), type ("Debit"/"Credit"), amount, balance, remarks, timestamp, createdAt }
 *   vat_bills           { expenseId ("EXP095"), expenseItem, fileName, fileUrl, storagePath, fileType ("image/jpeg"), uploadedBy, uploadedAt } — 20 docs
 *   order_costs         { orderId (= order_ref), linkedOrderId (= orders.id), material, labour, overhead, shipping, totalNPR, note, createdBy, updatedAt } — empty
 */

import { bool, dedupeByName, num, str, tsToISO } from '@/lib/data/normalise';
import { readCollection, type DocData } from '@/lib/supabase/read';

import { CATEGORIES } from './mock';

import type {
  Account,
  AccountType,
  BankTransaction,
  Expense,
  ExpenseCategoryId,
  JournalEntry,
  OrderCosts,
  PayrollRun,
  VatBill,
} from './types';

// --- Expenses ---

const CATEGORY_BY_LABEL = new Map(CATEGORIES.map((c) => [c.label.toLowerCase(), c.id]));

/**
 * Free-text live `category` → one of the 15 reference categories. Rows the web
 * app wrote carry a label verbatim; older rows (and the ones mobile wrote under
 * its former 6-bucket set) carry anything at all, so the patterns catch the
 * shapes actually seen live — `Equipment / IT`, `Setup / Security`,
 * `Furniture & Fixtures`, `Machinery / Assets`, `Miscellaneous / Events`.
 */
function mapExpenseCategory(raw: unknown): ExpenseCategoryId {
  const s = str(raw).trim().toLowerCase();
  const exact = CATEGORY_BY_LABEL.get(s);
  if (exact) return exact;
  if (/(util|power|electric|water|internet|phone|recharge)/.test(s)) return 'utilities';
  if (/(rent|lease)/.test(s)) return 'rent-lease';
  if (/(salar|wage|payroll|staff|welfare)/.test(s)) return 'salaries';
  if (/(software|subscription|saas|licen)/.test(s)) return 'software';
  if (/(office|stationer)/.test(s)) return 'office-supplies';
  if (/(transport|freight|deliver|shipping|logistic|fuel|travel)/.test(s)) return 'transport';
  // Before `meals`, so the live `Miscellaneous / Events` follows its lead word.
  if (/misc/.test(s)) return 'miscellaneous';
  if (/(meal|food|entertain|refreshment|snack|event)/.test(s)) return 'meals';
  if (/(market|advert|promo|branding)/.test(s)) return 'marketing';
  if (/(professional|legal|lawyer|audit|consult)/.test(s)) return 'professional-fees';
  if (/(raw material|fabric|yarn|trim)/.test(s)) return 'raw-materials';
  if (/consumable/.test(s)) return 'consumables';
  if (/(repair|maintenance|service|wiring)/.test(s)) return 'maintenance';
  if (/(equipment|machin|furnitur|fixture|asset|setup|install)/.test(s)) return 'equipment';
  return 'other';
}

function mapExpenseDoc(id: string, d: DocData): Expense | null {
  const amountNPR = num(d.amountNPR);
  const note = str(d.note).trim();
  const category = str(d.category).trim();
  if (!amountNPR && !note && !category) return null;
  return {
    id,
    category: mapExpenseCategory(d.category),
    name: note || category || 'Expense',
    note,
    amountNPR,
    date: str(d.date).trim() || tsToISO(d.createdAt).slice(0, 10),
    source: 'Cash',
    vatBill: bool(d.vatBill),
    status: /unpaid|payable/i.test(str(d.status)) ? 'Unpaid' : 'Paid',
    loggedBy: str(d.loggedBy).trim(),
  };
}

export async function fetchExpenses(): Promise<Expense[]> {
  return readCollection('finance_expenses', mapExpenseDoc);
}

// --- Chart of accounts ---

const ACCOUNT_TYPES: AccountType[] = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

function mapAccountDoc(id: string, d: DocData): (Account & { createdAt: string }) | null {
  const name = str(d.name).trim();
  if (!name) return null;
  const typeRaw = str(d.type).trim();
  return {
    id,
    name,
    type: ACCOUNT_TYPES.find((t) => t.toLowerCase() === typeRaw.toLowerCase()) ?? 'Asset',
    openingBalanceNPR: num(d.openingBalanceNPR),
    isBank: bool(d.isBank),
    createdAt: tsToISO(d.createdAt),
  };
}

export async function fetchAccounts(): Promise<Account[]> {
  const rows = await readCollection('accounts', mapAccountDoc);
  // ~114 live docs, many user-created duplicates of the reference's clean set.
  return dedupeByName(rows).map(({ createdAt: _drop, ...a }) => a);
}

// --- Journal entries ---

function mapJournalDoc(id: string, d: DocData): JournalEntry | null {
  const amountNPR = num(d.amountNPR);
  const debitAccount = str(d.debitAccount).trim();
  const creditAccount = str(d.creditAccount).trim();
  if (!amountNPR || (!debitAccount && !creditAccount)) return null;
  return {
    id,
    date: str(d.date).trim() || tsToISO(d.createdAt).slice(0, 10),
    description: str(d.description).trim(),
    debitAccount,
    creditAccount,
    amountNPR,
    reference: str(d.reference).trim(),
    createdBy: str(d.createdBy).trim(),
  };
}

export async function fetchJournalEntries(): Promise<JournalEntry[]> {
  return readCollection('journal_entries', mapJournalDoc);
}

// --- Bank feed ---

function mapBankDoc(id: string, d: DocData): BankTransaction | null {
  const amountNPR = num(d.amount);
  if (!amountNPR) return null;
  const rawDate = str(d.date).trim();
  return {
    id,
    // `bank_transactions` has no account column at all. The web app reads a
    // field that is never there and always falls back to Nabil — the feed's own
    // account — so the same row must land in the same ledger block here.
    bankAccount: 'Nabil Bank',
    date: (rawDate.split(' ')[0] || tsToISO(d.createdAt).slice(0, 10)),
    description: str(d.remarks).trim(),
    amountNPR,
    direction: /credit/i.test(str(d.type)) ? 'Credit' : 'Debit',
    category: '',
    reference: '',
    loggedBy: 'Bank feed',
  };
}

export async function fetchBankTransactions(): Promise<BankTransaction[]> {
  return readCollection('bank_transactions', mapBankDoc);
}

// --- Payroll (read-only here: the fiscal-year figures count it as money out) ---

const AD_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function mapPayrollDoc(id: string, d: DocData): PayrollRun | null {
  const month = str(d.month).trim();
  const year = num(d.year);
  const monthIdx = AD_MONTH_NAMES.indexOf(month);
  // A row with no usable month/year belongs to no fiscal year, so it is dropped
  // rather than filed under whichever year happens to be current.
  if (!year || monthIdx < 0) return null;
  return {
    id,
    month,
    year,
    grossNPR: num(d.grossNPR),
    netNPR: num(d.netNPR),
    staffName: str(d.staffName).trim(),
    date: `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`,
  };
}

export async function fetchPayroll(): Promise<PayrollRun[]> {
  return readCollection('finance_payroll', mapPayrollDoc);
}

// --- VAT bills ---

function mapVatBillDoc(id: string, d: DocData): VatBill | null {
  const expenseId = str(d.expenseId).trim();
  if (!expenseId) return null;
  const fileName = str(d.fileName).trim();
  const fileType = str(d.fileType).trim();
  return {
    id,
    expenseId,
    item: str(d.expenseItem).trim() || fileName || 'VAT bill',
    fileName,
    // Every live row is `image/jpeg`; the name is the fallback for rows the
    // web app wrote with no MIME type at all.
    kind: /pdf/i.test(fileType) || /\.pdf$/i.test(fileName) ? 'pdf' : 'image',
    uploadedBy: str(d.uploadedBy).trim(),
    date: tsToISO(d.uploadedAt).slice(0, 10),
    fileUrl: str(d.fileUrl).trim() || undefined,
  };
}

export async function fetchVatBills(): Promise<VatBill[]> {
  return readCollection('vat_bills', mapVatBillDoc);
}

// --- Order costs ---

function mapOrderCostsDoc(_id: string, d: DocData): OrderCosts | null {
  // The view's `orderId` is the human `order_ref`; `linkedOrderId` is the
  // `orders.id` the Order P&L tab keys its rows on.
  const orderId = str(d.linkedOrderId).trim() || str(d.orderId).trim();
  if (!orderId) return null;
  return {
    orderId,
    material: num(d.material),
    labour: num(d.labour),
    overhead: num(d.overhead),
    shipping: num(d.shipping),
    // The table has no `updated_by` column — `created_by` is its only actor field.
    updatedBy: str(d.createdBy).trim(),
    updatedAt: (tsToISO(d.updatedAt) || tsToISO(d.createdAt)).slice(0, 10),
  };
}

export async function fetchOrderCosts(): Promise<OrderCosts[]> {
  return readCollection('order_costs', mapOrderCostsDoc);
}
