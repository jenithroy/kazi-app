/**
 * The reference `EXPENSE_CATEGORIES` (Finance.jsx) verbatim, as slugs. The
 * live `finance_expenses.category` is free text holding the *label*, so
 * `CATEGORIES` in `mock.ts` carries the exact string each id reads and writes.
 */
export const EXPENSE_CATEGORY_IDS = [
  'utilities',
  'rent-lease',
  'salaries',
  'office-supplies',
  'transport',
  'meals',
  'marketing',
  'professional-fees',
  'equipment',
  'maintenance',
  'raw-materials',
  'consumables',
  'software',
  'miscellaneous',
  'other',
] as const;

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORY_IDS)[number];

export interface ExpenseCategory {
  id: ExpenseCategoryId;
  /** The live/reference category string, e.g. `Meals & Entertainment`. */
  label: string;
  tag: string;
  bg: string;
  fg: string;
}

/** Matches the live `finance_expenses.status` ("Paid") — mobile also tracks the unpaid side. */
export type ExpenseStatus = 'Paid' | 'Unpaid';

/** Where an expense is settled from. `Payable` = booked but not yet paid. */
export type ExpenseSource = 'Cash' | 'Bank' | 'Payable';

/**
 * Shape mirrors the live `finance_expenses` collection (`category`, `amountNPR`,
 * `date`, `note`, `vatBill`, `status`, `loggedBy`). `name` is the row's display
 * title; `meta` is derived on screen from `source`/`loggedBy` (no longer stored).
 */
export interface Expense {
  id: string;
  category: ExpenseCategoryId;
  name: string;
  note: string;
  amountNPR: number;
  /** AD ISO date, `YYYY-MM-DD`. BS is derived for display. */
  date: string;
  source: ExpenseSource;
  vatBill: boolean;
  status: ExpenseStatus;
  loggedBy: string;
}

export type VatBillKind = 'image' | 'pdf';

/**
 * A VAT bill scan linked to an expense. Mirrors the live `vat_bills` table
 * (`expense_id`, `expense_item`, `file_name`, `file_type`, `uploaded_by`,
 * `uploaded_at`).
 */
export interface VatBill {
  id: string;
  expenseId: string;
  /** Snapshot of the linked expense's title, so the list reads without a join. */
  item: string;
  fileName: string;
  kind: VatBillKind;
  uploadedBy: string;
  /** AD ISO date. */
  date: string;
  /** Public Storage URL of the scan. Live rows only — mock rows have no file. */
  fileUrl?: string;
}

/**
 * One fiscal year's figures, all derived from the rows that fall in it — money
 * in, money out, net and how many records there are. The reference
 * `FiscalYearTransactions.jsx` shows exactly these four and no margin: it has
 * no margin figure, and there is no source for one.
 */
export interface FiscalYear {
  /** The BS fiscal-year label, e.g. `2083/84`, which is also its id. */
  id: string;
  /** `FY 2083/84`. */
  label: string;
  range: string;
  moneyIn: number;
  moneyOut: number;
  /** `moneyIn − moneyOut`. */
  net: number;
  records: number;
  current: boolean;
}

// ---- Chart of accounts + journal (item 8) ----

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

/**
 * Mirrors the live `accounts` collection (`name`, `type`) plus an
 * `openingBalanceNPR` the reference backfills in code — mobile stores it.
 */
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openingBalanceNPR: number;
  /** The chart's own cash/bank designation. Absent on mock rows. */
  isBank?: boolean;
}

/** Mirrors `journal_entries` (`date`, `description`, `debitAccount`, `creditAccount`, `amountNPR`, `reference`). */
export interface JournalEntry {
  id: string;
  /** AD ISO. */
  date: string;
  description: string;
  /** Account *name* (matches how the live docs store it). */
  debitAccount: string;
  creditAccount: string;
  amountNPR: number;
  reference: string;
  /** Required when either leg is an advance account. */
  partyName?: string;
  createdBy: string;
}

// ---- Bank transactions (item 10) ----

/** Statement convention: `Credit` = money in, `Debit` = money out (mirrors the live `bank_transactions.type`). */
export type BankDirection = 'Credit' | 'Debit';

export interface BankTransaction {
  id: string;
  /** Account name — a `Bank - …` from the chart, or a free-text "Other". */
  bankAccount: string;
  /** AD ISO date. */
  date: string;
  description: string;
  amountNPR: number;
  direction: BankDirection;
  category: string;
  reference: string;
  loggedBy: string;
}

// ---- Order P&L (item 11) ----

/**
 * Per-order cost breakdown for the Order P&L tab. Keyed by `Order.id`, which
 * is the live `order_costs.order_id`. Once a record exists, all four figures
 * are explicit; the auto labour rate only pre-fills the sheet / shows in the
 * table for orders with no record yet.
 *
 * `updatedBy` reads and writes the live `created_by` — the table has no
 * `updated_by` column.
 */
export interface OrderCosts {
  orderId: string;
  material: number;
  labour: number;
  overhead: number;
  shipping: number;
  updatedBy: string;
  /** AD ISO date. */
  updatedAt: string;
}

/** Fiscal-Year Transactions drill covers 6 sources (item 18 / reference `FiscalYearTransactions.jsx`). */
export type LedgerRowType = 'bank' | 'journal' | 'expense' | 'purchase' | 'payroll' | 'sales';

/**
 * A finalised payroll row (`finance_payroll`) — only the fields the fiscal-year
 * figures read. Payroll is the one source with no date of its own.
 */
export interface PayrollRun {
  id: string;
  /** English month name as stored, e.g. `May`. */
  month: string;
  year: number;
  grossNPR: number;
  netNPR: number;
  /**
   * The view's `staffName` is `legacy_staff_name`. It is the only name on the row
   * without a join, but its sibling `legacy_role` is stale enough to be wrong
   * (an intern filed as "Managing Director"), so that one is not shown at all.
   */
  staffName: string;
  /** `${year}-MM-01`, synthesised from month + year exactly as the web app does. */
  date: string;
}
