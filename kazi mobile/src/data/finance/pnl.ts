/**
 * Profit & Loss and Balance Sheet, derived from the same primary docs the
 * Ledger tab uses. `salesRevenueNPR` and `payrollNPR` are passed in by the
 * screen (they come from Billing / Employees) so this stays decoupled.
 */

import type { PurchaseEntry } from '../purchases/types';
import { accountLedger, accountSummaries, cashBankNames, type LedgerSources } from './ledger';
import type { Account, Expense, JournalEntry } from './types';

export interface ProfitAndLoss {
  salesRevenue: number;
  otherIncome: number;
  totalIncome: number;
  operatingExpenses: number;
  purchases: number;
  payroll: number;
  journalExpenses: number;
  totalExpenses: number;
  netProfit: number;
}

export interface PnlInput {
  salesRevenueNPR: number;
  payrollNPR: number;
  journal: JournalEntry[];
  expenses: Expense[];
  purchases: PurchaseEntry[];
  accounts: Account[];
}

export function buildProfitAndLoss({ salesRevenueNPR, payrollNPR, journal, expenses, purchases, accounts }: PnlInput): ProfitAndLoss {
  const typeOf = (name: string) => accounts.find((a) => a.name === name)?.type;

  const otherIncome = journal
    .filter((j) => j.creditAccount === 'Other Income')
    .reduce((n, j) => n + j.amountNPR, 0);

  const operatingExpenses = expenses.reduce((n, e) => n + e.amountNPR, 0);
  const purchasesTotal = purchases.reduce((n, p) => n + p.amountNPR, 0);

  const journalExpenses = journal
    .filter((j) => typeOf(j.debitAccount) === 'Expense' && j.debitAccount !== 'Purchases' && j.debitAccount !== 'Payroll Expense')
    .reduce((n, j) => n + j.amountNPR, 0);

  const totalIncome = salesRevenueNPR + otherIncome;
  const totalExpenses = operatingExpenses + purchasesTotal + payrollNPR + journalExpenses;

  return {
    salesRevenue: salesRevenueNPR,
    otherIncome,
    totalIncome,
    operatingExpenses,
    purchases: purchasesTotal,
    payroll: payrollNPR,
    journalExpenses,
    totalExpenses,
    netProfit: totalIncome - totalExpenses,
  };
}

export interface BalanceSheetLine {
  name: string;
  balance: number;
}
export interface BalanceSheetGroup {
  lines: BalanceSheetLine[];
  total: number;
}
export interface BalanceSheet {
  assets: BalanceSheetGroup;
  liabilities: BalanceSheetGroup;
  equity: BalanceSheetGroup;
  liabPlusEquity: number;
  /** assetsTotal − (liabilities + equity). Zero = balanced. */
  check: number;
}

export function buildBalanceSheet(sources: LedgerSources, netProfit: number): BalanceSheet {
  const summaries = accountSummaries(sources);

  const cashBank = new Set(cashBankNames(sources.accounts));

  const balanceFor = (acct: Account): number => {
    if (acct.name === 'Profit for the Year') return netProfit;
    if (cashBank.has(acct.name)) return accountLedger(acct.name, sources).closing;
    return summaries.find((s) => s.name === acct.name)?.balance ?? acct.openingBalanceNPR;
  };

  const group = (type: Account['type']): BalanceSheetGroup => {
    const lines = sources.accounts
      .filter((a) => a.type === type)
      .map((a) => ({ name: a.name, balance: balanceFor(a) }))
      .filter((l) => l.balance !== 0);
    return { lines, total: lines.reduce((n, l) => n + l.balance, 0) };
  };

  const assets = group('Asset');
  const liabilities = group('Liability');
  const equity = group('Equity');
  const liabPlusEquity = liabilities.total + equity.total;

  return { assets, liabilities, equity, liabPlusEquity, check: assets.total - liabPlusEquity };
}
