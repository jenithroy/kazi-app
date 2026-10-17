import type { Account, BankTransaction, Expense, ExpenseCategory, ExpenseCategoryId, ExpenseSource, JournalEntry, OrderCosts, VatBill } from './types';

/**
 * The reference's 15 `EXPENSE_CATEGORIES`, in its order. `label` is the exact
 * string the live `finance_expenses.category` stores, so the web app and mobile
 * read the same rows back into the same bucket.
 */
export const CATEGORIES: ExpenseCategory[] = [
  { id: 'utilities', label: 'Utilities', tag: 'UTL', bg: '#F7EEDA', fg: '#7A5709' },
  { id: 'rent-lease', label: 'Rent / Lease', tag: 'RNT', bg: '#F1EEE5', fg: '#3B4F47' },
  { id: 'salaries', label: 'Salaries', tag: 'SAL', bg: '#E2F6EC', fg: '#0E5E43' },
  { id: 'office-supplies', label: 'Office Supplies', tag: 'OFF', bg: '#E8EEF6', fg: '#2C4A6E' },
  { id: 'transport', label: 'Transport', tag: 'TRN', bg: '#E9EFEC', fg: '#147A57' },
  { id: 'meals', label: 'Meals & Entertainment', tag: 'MEA', bg: '#F8E7DF', fg: '#8E4327' },
  { id: 'marketing', label: 'Marketing', tag: 'MKT', bg: '#F0E9F3', fg: '#5A3C6B' },
  { id: 'professional-fees', label: 'Professional Fees', tag: 'PRO', bg: '#EDEAE0', fg: '#5B6C64' },
  { id: 'equipment', label: 'Equipment', tag: 'EQP', bg: '#E8EEF6', fg: '#2C4A6E' },
  { id: 'maintenance', label: 'Maintenance & Repairs', tag: 'MNT', bg: '#F8E7DF', fg: '#8E4327' },
  { id: 'raw-materials', label: 'Raw Materials', tag: 'RAW', bg: '#EAF2E4', fg: '#3F6127' },
  { id: 'consumables', label: 'Consumables', tag: 'CON', bg: '#F7EEDA', fg: '#7A5709' },
  { id: 'software', label: 'Software & Subscriptions', tag: 'SFW', bg: '#F0E9F3', fg: '#5A3C6B' },
  { id: 'miscellaneous', label: 'Miscellaneous', tag: 'MSC', bg: '#F1EEE5', fg: '#3B4F47' },
  { id: 'other', label: 'Other', tag: 'OTH', bg: '#EDEAE0', fg: '#5B6C64' },
];

/** The category record for an id, falling back to `Other` rather than undefined. */
export function expenseCategory(id: ExpenseCategoryId | string): ExpenseCategory {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export const EXPENSE_SOURCES: ExpenseSource[] = ['Cash', 'Bank', 'Payable'];

export const seedExpenses: Expense[] = [
  { id: 'e1', category: 'utilities', name: 'NEA electricity · Bhadra', note: 'Bill 44112 · bank transfer', amountNPR: 214500, date: '2026-08-24', source: 'Bank', vatBill: true, status: 'Paid', loggedBy: 'Anil Karki' },
  { id: 'e2', category: 'transport', name: 'Air freight · SO-2290', note: 'Halden & Co. · DHL consignment', amountNPR: 486000, date: '2026-08-22', source: 'Bank', vatBill: true, status: 'Paid', loggedBy: 'Anil Karki' },
  { id: 'e3', category: 'maintenance', name: 'Overlock service · 6 heads', note: 'Juki technician · 2 days', amountNPR: 78000, date: '2026-08-21', source: 'Payable', vatBill: false, status: 'Unpaid', loggedBy: 'Sita Rai' },
  { id: 'e4', category: 'salaries', name: 'Overtime · finishing line', note: '38 workers · week 33', amountNPR: 342000, date: '2026-08-20', source: 'Cash', vatBill: false, status: 'Paid', loggedBy: 'Anil Karki' },
  { id: 'e5', category: 'rent-lease', name: 'Godown rent · Balaju', note: 'Bhadra · 4,200 sq ft', amountNPR: 195000, date: '2026-08-18', source: 'Bank', vatBill: true, status: 'Paid', loggedBy: 'Anil Karki' },
  { id: 'e6', category: 'professional-fees', name: 'Customs agent fee', note: '3 consignments cleared', amountNPR: 62000, date: '2026-08-17', source: 'Payable', vatBill: false, status: 'Unpaid', loggedBy: 'Sita Rai' },
];

export const seedVatBills: VatBill[] = [
  { id: 'vb1', expenseId: 'e1', item: 'NEA electricity · Bhadra', fileName: 'nea-44112.pdf', kind: 'pdf', uploadedBy: 'Anil Karki', date: '2026-08-24' },
  { id: 'vb2', expenseId: 'e2', item: 'Air freight · SO-2290', fileName: 'dhl-invoice-2290.jpg', kind: 'image', uploadedBy: 'Anil Karki', date: '2026-08-22' },
  { id: 'vb3', expenseId: 'e5', item: 'Godown rent · Balaju', fileName: 'rent-bhadra.pdf', kind: 'pdf', uploadedBy: 'Anil Karki', date: '2026-08-18' },
];

export const MARGINS: number[] = [18.2, 19.4, 17.8, 21.0, 20.2, 22.6, 23.4, 21.8, 24.1, 22.9, 23.8, 24.6];

// ---- Chart of accounts (item 8) — 26 `DEFAULT_ACCOUNTS`, openings on cash/banks + capital ----

export const CASH_ACCOUNT = 'Cash';
export const BANK_ACCOUNTS = ['Bank - NIC Asia', 'Bank - Nabil Bank', 'Bank - Global IME', 'Bank - Standard Chartered'];
export const ADVANCE_ACCOUNTS = ['Advance Received', 'Advance Payable'];

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'a01', name: 'Cash', type: 'Asset', openingBalanceNPR: 480000 },
  { id: 'a02', name: 'Bank - NIC Asia', type: 'Asset', openingBalanceNPR: 3250000 },
  { id: 'a03', name: 'Bank - Nabil Bank', type: 'Asset', openingBalanceNPR: 1820000 },
  { id: 'a04', name: 'Bank - Global IME', type: 'Asset', openingBalanceNPR: 910000 },
  { id: 'a05', name: 'Bank - Standard Chartered', type: 'Asset', openingBalanceNPR: 1240000 },
  { id: 'a06', name: 'Accounts Receivable', type: 'Asset', openingBalanceNPR: 0 },
  { id: 'a07', name: 'Inventory - Raw Materials', type: 'Asset', openingBalanceNPR: 0 },
  { id: 'a08', name: 'Inventory - Finished Goods', type: 'Asset', openingBalanceNPR: 0 },
  { id: 'a09', name: 'Fixed Assets - Machinery', type: 'Asset', openingBalanceNPR: 0 },
  { id: 'a10', name: 'Accumulated Depreciation', type: 'Asset', openingBalanceNPR: 0 },
  { id: 'a11', name: 'Advance Payable', type: 'Asset', openingBalanceNPR: 0 },
  { id: 'a12', name: 'Accounts Payable', type: 'Liability', openingBalanceNPR: 0 },
  { id: 'a13', name: 'VAT Payable', type: 'Liability', openingBalanceNPR: 0 },
  { id: 'a14', name: 'TDS Payable', type: 'Liability', openingBalanceNPR: 0 },
  { id: 'a15', name: 'SSF Payable', type: 'Liability', openingBalanceNPR: 0 },
  { id: 'a16', name: 'Salaries Payable', type: 'Liability', openingBalanceNPR: 0 },
  { id: 'a17', name: 'Advance Received', type: 'Liability', openingBalanceNPR: 0 },
  { id: 'a18', name: 'Bank Loan', type: 'Liability', openingBalanceNPR: 0 },
  { id: 'a19', name: 'Share Capital', type: 'Equity', openingBalanceNPR: 7500000 },
  { id: 'a20', name: 'Retained Earnings', type: 'Equity', openingBalanceNPR: 0 },
  { id: 'a21', name: 'Profit for the Year', type: 'Equity', openingBalanceNPR: 0 },
  { id: 'a22', name: 'Sales Revenue', type: 'Income', openingBalanceNPR: 0 },
  { id: 'a23', name: 'Other Income', type: 'Income', openingBalanceNPR: 0 },
  { id: 'a24', name: 'Purchases', type: 'Expense', openingBalanceNPR: 0 },
  { id: 'a25', name: 'Payroll Expense', type: 'Expense', openingBalanceNPR: 0 },
  { id: 'a26', name: 'Operating Expenses', type: 'Expense', openingBalanceNPR: 0 },
];

export const BANK_TX_CATEGORIES = ['Customer receipt', 'Supplier payment', 'Payroll', 'Bank charges', 'Interest', 'Transfer', 'Tax', 'Other'];

export const seedBankTransactions: BankTransaction[] = [
  { id: 'bt1', bankAccount: 'Bank - NIC Asia', date: '2026-08-24', description: 'Halden & Co. · SO-2290 settled', amountNPR: 3150000, direction: 'Credit', category: 'Customer receipt', reference: 'FT2408240091', loggedBy: 'Anil Karki' },
  { id: 'bt2', bankAccount: 'Bank - NIC Asia', date: '2026-08-23', description: 'Sunrise Mills · EXP184', amountNPR: 210180, direction: 'Debit', category: 'Supplier payment', reference: 'FT2408230145', loggedBy: 'Anil Karki' },
  { id: 'bt3', bankAccount: 'Bank - Nabil Bank', date: '2026-08-22', description: 'Quarterly account charges', amountNPR: 3390, direction: 'Debit', category: 'Bank charges', reference: 'CHG-0822', loggedBy: 'Sita Rai' },
  { id: 'bt4', bankAccount: 'Bank - Standard Chartered', date: '2026-08-20', description: 'Base Layer Studio · advance', amountNPR: 1880000, direction: 'Credit', category: 'Customer receipt', reference: 'SWIFT-77120', loggedBy: 'Anil Karki' },
  { id: 'bt5', bankAccount: 'Bank - NIC Asia', date: '2026-08-18', description: 'Payroll run · Shrawan', amountNPR: 4180000, direction: 'Debit', category: 'Payroll', reference: 'SAL-2026-05', loggedBy: 'Sita Rai' },
];

// ---- Order P&L (item 11) ----

/**
 * Units passed QC last month. The reference derives this from `production`
 * batch `passed` counts; mobile's production mock carries no monthly output
 * figure, so the auto labour rate (last month's production payroll ÷ this)
 * uses a seeded value until the Production module logs batch output.
 */
export const LAST_MONTH_UNITS_PASSED = 8600;

/** Departments whose payroll feeds the auto labour rate (reference: `isProductionWorker`). */
export const PRODUCTION_DEPTS = ['Sewing', 'Cutting', 'Finishing', 'Packing'];

/** Keyed by the sales `Order.id`. Seeded spread: one healthy, one thin, one loss-making. */
export const seedOrderCosts: OrderCosts[] = [
  { orderId: 'o1', material: 1850000, labour: 720000, overhead: 240000, shipping: 180000, updatedBy: 'Anil Karki', updatedAt: '2026-08-22' },
  { orderId: 'o2', material: 1420000, labour: 900000, overhead: 210000, shipping: 260000, updatedBy: 'Anil Karki', updatedAt: '2026-08-21' },
  { orderId: 'o7', material: 210000, labour: 168000, overhead: 42000, shipping: 28000, updatedBy: 'Sita Rai', updatedAt: '2026-08-18' },
];

export const seedJournalEntries: JournalEntry[] = [
  { id: 'j1', date: '2026-08-23', description: 'Depreciation · machinery (monthly)', debitAccount: 'Operating Expenses', creditAccount: 'Accumulated Depreciation', amountNPR: 128000, reference: 'JV-0331', createdBy: 'Anil Karki' },
  { id: 'j2', date: '2026-08-20', description: 'Advance from Northfield Apparel · SO-2291', debitAccount: 'Bank - NIC Asia', creditAccount: 'Advance Received', amountNPR: 1296000, reference: 'JV-0326', partyName: 'Northfield Apparel', createdBy: 'Anil Karki' },
  { id: 'j3', date: '2026-08-18', description: 'Year-start opening stock revaluation', debitAccount: 'Inventory - Raw Materials', creditAccount: 'Retained Earnings', amountNPR: 402000, reference: 'JV-0318', createdBy: 'Anil Karki' },
  { id: 'j4', date: '2026-08-16', description: 'SSF payable · Shrawan payroll', debitAccount: 'Payroll Expense', creditAccount: 'SSF Payable', amountNPR: 214500, reference: 'JV-0314', createdBy: 'Sita Rai' },
  { id: 'j5', date: '2026-08-12', description: 'Cash withdrawn for petty expenses', debitAccount: 'Cash', creditAccount: 'Bank - Nabil Bank', amountNPR: 100000, reference: 'JV-0309', createdBy: 'Sita Rai' },
];
