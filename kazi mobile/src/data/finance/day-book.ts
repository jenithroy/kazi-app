/**
 * The Day Book (रोजमेल / Rojmel) — the book of original entry: every purchase,
 * settled sale, bank transaction and journal entry in one chronological list,
 * oldest first, before any of it is posted into the per-account Ledger.
 *
 * Ported from the reference `Finance.jsx` `dayBook` memo. Same four sources as
 * the Cash/Bank ledger, but across every account rather than the cash ones, and
 * merged by date instead of bucketed — so a journal entry against (say) Sales
 * Revenue appears here even though it never reaches the Ledger tab. A journal
 * entry contributes two rows, Dr on one account and Cr on the other.
 */

import { total as invoiceTotal, nprOf, statusFull } from '@/data/billing/utils';
import type { Invoice } from '@/data/billing/types';
import type { PurchaseEntry } from '@/data/purchases/types';

import { defaultBank } from './ledger';
import { CASH_ACCOUNT } from './mock';
import type { Account, BankTransaction, JournalEntry } from './types';

export type DayBookKind = 'purchase' | 'sales' | 'bank' | 'journal';

export interface DayBookRow {
  key: string;
  /** AD ISO. */
  date: string;
  account: string;
  particulars: string;
  dr: number;
  cr: number;
  kind: DayBookKind;
}

export interface DayBookDay {
  /** AD ISO. */
  date: string;
  rows: DayBookRow[];
  dr: number;
  cr: number;
}

export interface DayBookSources {
  accounts: Account[];
  purchases: PurchaseEntry[];
  invoices: Invoice[];
  bankTransactions: BankTransaction[];
  journal: JournalEntry[];
}

export function buildDayBook({ accounts, purchases, invoices, bankTransactions, journal }: DayBookSources): DayBookRow[] {
  const rows: DayBookRow[] = [];

  purchases.forEach((p) => {
    // A credit purchase moves to Accounts Payable — no cash or bank movement yet.
    const account =
      p.paymentType === 'Cash' ? CASH_ACCOUNT
      : p.paymentType === 'Bank' ? (p.bankName || defaultBank(accounts))
      : '';
    if (!account) return;
    rows.push({
      key: `pur-${p.id}`,
      date: p.date,
      account,
      particulars: `Purchase — ${p.items[0]?.particulars || p.expenseId}`,
      dr: 0,
      cr: p.amountNPR,
      kind: 'purchase',
    });
  });

  invoices.forEach((v) => {
    if (statusFull(v) !== 'Paid') return;
    rows.push({
      key: `inv-${v.id}`,
      date: v.issuedISO ?? '',
      // Older invoices carry no payment type at all and default to Cash.
      account: v.paymentType === 'Bank' ? (v.bankName || defaultBank(accounts)) : CASH_ACCOUNT,
      particulars: `Sales — ${v.clientName || v.ref}`,
      dr: nprOf(v, invoiceTotal(v)),
      cr: 0,
      kind: 'sales',
    });
  });

  bankTransactions.forEach((t) => {
    rows.push({
      key: `bnk-${t.id}`,
      date: t.date,
      account: t.bankAccount,
      particulars: t.description || 'Bank transaction',
      dr: t.direction === 'Credit' ? t.amountNPR : 0,
      cr: t.direction === 'Credit' ? 0 : t.amountNPR,
      kind: 'bank',
    });
  });

  journal.forEach((j) => {
    const particulars = j.description || 'Journal entry';
    rows.push({ key: `jnl-${j.id}-dr`, date: j.date, account: j.debitAccount, particulars, dr: j.amountNPR, cr: 0, kind: 'journal' });
    rows.push({ key: `jnl-${j.id}-cr`, date: j.date, account: j.creditAccount, particulars, dr: 0, cr: j.amountNPR, kind: 'journal' });
  });

  return rows.filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
}

/** The same rows under per-day headings, each with its own Dr / Cr totals. */
export function groupDayBook(rows: DayBookRow[]): DayBookDay[] {
  const days: DayBookDay[] = [];
  for (const row of rows) {
    const day = days[days.length - 1];
    if (day && day.date === row.date) {
      day.rows.push(row);
      day.dr += row.dr;
      day.cr += row.cr;
    } else {
      days.push({ date: row.date, rows: [row], dr: row.dr, cr: row.cr });
    }
  }
  return days;
}
