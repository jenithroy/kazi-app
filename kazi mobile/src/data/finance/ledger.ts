/**
 * Running Cash / Bank ledgers + per-account summaries, derived on the fly from
 * primary docs — the reference `Finance.jsx` `cashBankLedger` memo does the same
 * (there is no stored ledger). Sources wired now: `accounts` (opening balances),
 * `journal_entries`, `finance_purchases`, `finance_expenses`. Paid `invoices`
 * and `bank_transactions` join in with items 10 / 14.
 */

import type { PurchaseEntry } from '../purchases/types';
import { BANK_ACCOUNTS, CASH_ACCOUNT } from './mock';
import type { Account, AccountType, BankTransaction, Expense, JournalEntry } from './types';

export interface LedgerRow {
  date: string;
  particulars: string;
  ref: string;
  dr: number;
  cr: number;
  balance: number;
  /** For deep-linking a row back to its source editor. */
  link?: { kind: 'purchase' | 'expense' | 'journal' | 'bank'; id: string };
}

export interface AccountLedger {
  account: string;
  opening: number;
  rows: LedgerRow[];
  closing: number;
}

export interface LedgerSources {
  accounts: Account[];
  journal: JournalEntry[];
  purchases: PurchaseEntry[];
  expenses: Expense[];
  /** Manual + webhook bank feed (item 10). Optional so older callers still type-check. */
  bankTransactions?: BankTransaction[];
}

/**
 * Which chart accounts are cash/bank. Derived from the chart rather than a fixed
 * list because the live chart names its banks plainly ("Nabil Bank", "Fonepay")
 * with no `Bank - ` prefix, and carries `isBank` on only some of them — so the
 * name check backs the flag up. `BANK_ACCOUNTS` keeps the mock chart working.
 */
export function cashBankNames(accounts: Account[]): string[] {
  const fromChart = accounts
    .filter((a) => a.name === CASH_ACCOUNT || a.isBank || /\bbank\b|fonepay/i.test(a.name))
    .map((a) => a.name);
  return [...new Set([CASH_ACCOUNT, ...fromChart, ...BANK_ACCOUNTS])];
}

/**
 * Where a "Bank" movement with no bank name of its own lands. The web app
 * hardcodes Nabil for exactly this case, so preferring anything else would file
 * the same purchase under a different ledger block in each app.
 */
export function defaultBank(accounts: Account[]): string {
  const banks = cashBankNames(accounts).filter((n) => n !== CASH_ACCOUNT);
  return banks.find((n) => n === 'Nabil Bank') ?? banks[0] ?? BANK_ACCOUNTS[0];
}

interface RawMove {
  date: string;
  particulars: string;
  ref: string;
  account: string;
  dr: number;
  cr: number;
  link?: LedgerRow['link'];
}

/** Every Dr/Cr movement that touches Cash or a Bank account, before running-balance. */
function cashBankMoves({ accounts, journal, purchases, expenses, bankTransactions = [] }: LedgerSources): RawMove[] {
  const moves: RawMove[] = [];
  const cashBank = new Set(cashBankNames(accounts));
  const isCashBank = (name: string) => cashBank.has(name);

  bankTransactions.forEach((t) => {
    if (!isCashBank(t.bankAccount)) return;
    // Credit = money in = Dr on the asset; Debit = money out = Cr.
    moves.push({
      date: t.date,
      particulars: t.description,
      ref: t.reference || t.category,
      account: t.bankAccount,
      dr: t.direction === 'Credit' ? t.amountNPR : 0,
      cr: t.direction === 'Debit' ? t.amountNPR : 0,
      link: { kind: 'bank', id: t.id },
    });
  });

  journal.forEach((j) => {
    if (isCashBank(j.debitAccount)) {
      moves.push({ date: j.date, particulars: j.description, ref: j.reference, account: j.debitAccount, dr: j.amountNPR, cr: 0, link: { kind: 'journal', id: j.id } });
    }
    if (isCashBank(j.creditAccount)) {
      moves.push({ date: j.date, particulars: j.description, ref: j.reference, account: j.creditAccount, dr: 0, cr: j.amountNPR, link: { kind: 'journal', id: j.id } });
    }
  });

  purchases
    // A Credit purchase moves no cash yet, so it never reaches a cash/bank ledger.
    .filter((p) => p.status === 'paid' && p.paymentType !== 'Credit')
    .forEach((p) => {
      // A null `paymentType` means the method was never recorded, so the row
      // belongs to no cash/bank account — posting it to Cash would invent one.
      const account =
        p.paymentType === 'Cash' ? CASH_ACCOUNT
        : p.paymentType === 'Bank' ? (p.bankName || defaultBank(accounts))
        : (p.bankName ?? '');
      if (!isCashBank(account)) return;
      moves.push({
        date: p.date,
        particulars: `${p.party} · ${p.items[0]?.particulars ?? p.category}`,
        ref: p.expenseId,
        account,
        dr: 0,
        cr: p.amountNPR,
        link: { kind: 'purchase', id: p.id },
      });
    });

  expenses
    .filter((e) => e.status === 'Paid' && e.source !== 'Payable')
    .forEach((e) => {
      const account = e.source === 'Cash' ? CASH_ACCOUNT : defaultBank(accounts);
      moves.push({ date: e.date, particulars: e.name, ref: e.id.toUpperCase(), account, dr: 0, cr: e.amountNPR, link: { kind: 'expense', id: e.id } });
    });

  return moves;
}

/** Running ledger for one Cash/Bank account, oldest → newest. */
export function accountLedger(accountName: string, sources: LedgerSources): AccountLedger {
  const acct = sources.accounts.find((a) => a.name === accountName);
  const opening = acct?.openingBalanceNPR ?? 0;
  const moves = cashBankMoves(sources)
    .filter((m) => m.account === accountName)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let balance = opening;
  const rows: LedgerRow[] = moves.map((m) => {
    balance += m.dr - m.cr;
    return { date: m.date, particulars: m.particulars, ref: m.ref, dr: m.dr, cr: m.cr, balance, link: m.link };
  });

  return { account: accountName, opening, rows, closing: balance };
}

export interface AccountSummary {
  id: string;
  name: string;
  type: AccountType;
  dr: number;
  cr: number;
  count: number;
  /** Signed balance: Asset/Expense = Dr − Cr (+ opening); Liability/Equity/Income = Cr − Dr (+ opening). */
  balance: number;
}

const isDebitNormal = (t: AccountType) => t === 'Asset' || t === 'Expense';

/** Per-account Dr/Cr/entry-count/balance — from journal entries + opening balances (the "Other Accounts" grid). */
export function accountSummaries(sources: LedgerSources): AccountSummary[] {
  const { accounts, journal } = sources;
  return accounts.map((a) => {
    let dr = 0;
    let cr = 0;
    let count = 0;
    journal.forEach((j) => {
      if (j.debitAccount === a.name) {
        dr += j.amountNPR;
        count += 1;
      }
      if (j.creditAccount === a.name) {
        cr += j.amountNPR;
        count += 1;
      }
    });
    const net = isDebitNormal(a.type) ? dr - cr : cr - dr;
    return { id: a.id, name: a.name, type: a.type, dr, cr, count, balance: a.openingBalanceNPR + net };
  });
}
