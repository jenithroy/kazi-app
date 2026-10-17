/**
 * Fiscal-year figures, derived from the primary records — the reference
 * `FiscalYearTransactions.jsx` does the same, and shows money in / money out /
 * net / record count (there is no turnover or margin figure anywhere in it).
 *
 * Seven sources, each filed under the fiscal year of *its own* date: expenses,
 * purchases, payroll, journal entries, bank transactions and invoices. Signs
 * follow the reference exactly — expense / purchase / payroll out, a journal
 * entry neither way (both legs are internal), a bank transaction by its
 * Credit/Debit, and a sale in only once it is Paid, with cancelled ones dropped.
 */

import { total as invoiceTotal, nprOf, statusFull } from '@/data/billing/utils';
import type { Invoice } from '@/data/billing/types';
import type { PurchaseEntry } from '@/data/purchases/types';
import { BS_MONTHS_EN, bsFromAD, bsToAD, currentFiscalYear, fiscalYearForAD } from '@/lib/nepaliDate';

import type { BankTransaction, Expense, FiscalYear, JournalEntry, LedgerRowType, PayrollRun } from './types';

/** One record in a fiscal year, whatever table it came from. */
export interface FiscalYearEntry {
  key: string;
  type: LedgerRowType;
  title: string;
  meta: string;
  amountNPR: number;
  /** `1` money in, `-1` money out, `0` neither — a journal entry, an unpaid invoice. */
  sign: 1 | -1 | 0;
  /** AD ISO date the row is filed under. */
  date: string;
  /** BS fiscal-year label, e.g. `2083/84`. */
  fiscalYear: string;
}

export interface FiscalYearSources {
  expenses: Expense[];
  purchases: PurchaseEntry[];
  payroll: PayrollRun[];
  journal: JournalEntry[];
  bankTransactions: BankTransaction[];
  invoices: Invoice[];
}

const AD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const adMonth = (adISO: string) => AD_MONTHS[Number(adISO.slice(5, 7)) - 1];
const adYear = (adISO: string) => adISO.slice(0, 4);

/** AD span of one BS month, e.g. `Jul – Aug 2026` (or `Aug 2026` when it doesn't straddle two). */
function bsMonthSpan(bsYear: number, bsMonth: number): string {
  const from = bsToAD({ year: bsYear, month: bsMonth, date: 1 });
  const nextMonth = bsMonth === 12 ? 1 : bsMonth + 1;
  const nextYear = bsMonth === 12 ? bsYear + 1 : bsYear;
  const next = new Date(bsToAD({ year: nextYear, month: nextMonth, date: 1 }));
  next.setDate(next.getDate() - 1);
  const to = next.toISOString().slice(0, 10);
  return adMonth(from) === adMonth(to)
    ? `${adMonth(from)} ${adYear(to)}`
    : `${adMonth(from)} – ${adMonth(to)} ${adYear(to)}`;
}

/** Every record across the six sources, each tagged with the fiscal year it falls in. */
export function buildFiscalYearEntries(sources: FiscalYearSources): FiscalYearEntry[] {
  const out: FiscalYearEntry[] = [];
  // A row with no usable date belongs to no year, so it is dropped rather than
  // filed under whichever year happens to be current.
  const push = (date: string, entry: Omit<FiscalYearEntry, 'date' | 'fiscalYear'>) => {
    if (!date) return;
    out.push({ ...entry, date, fiscalYear: fiscalYearForAD(date).label });
  };

  sources.expenses.forEach((e) =>
    push(e.date, {
      key: `exp-${e.id}`,
      type: 'expense',
      title: e.name || 'Expense',
      meta: e.note || e.source,
      amountNPR: e.amountNPR,
      sign: -1,
    }),
  );

  sources.purchases.forEach((p) =>
    push(p.date, {
      key: `pur-${p.id}`,
      type: 'purchase',
      title: p.items[0]?.particulars || p.expenseId || 'Purchase',
      meta: [p.expenseId, p.category].filter(Boolean).join(' · '),
      amountNPR: p.amountNPR,
      sign: -1,
    }),
  );

  sources.payroll.forEach((r) =>
    push(r.date, {
      key: `pay-${r.id}`,
      type: 'payroll',
      title: r.staffName || 'Staff',
      meta: `${r.month} ${r.year}`,
      amountNPR: r.grossNPR || r.netNPR,
      sign: -1,
    }),
  );

  sources.journal.forEach((j) =>
    push(j.date, {
      key: `jnl-${j.id}`,
      type: 'journal',
      title: j.description || 'Journal entry',
      meta: `Dr ${j.debitAccount} / Cr ${j.creditAccount}`,
      amountNPR: j.amountNPR,
      sign: 0,
    }),
  );

  sources.bankTransactions.forEach((t) =>
    push(t.date, {
      key: `bnk-${t.id}`,
      type: 'bank',
      title: t.description || 'Bank transaction',
      meta: t.reference || t.bankAccount,
      amountNPR: t.amountNPR,
      sign: t.direction === 'Credit' ? 1 : -1,
    }),
  );

  sources.invoices.forEach((v) => {
    // A cancelled invoice is not a transaction. Everything else is listed, but
    // only a Paid one is money actually received, so only a Paid one counts.
    //
    // The web app reads the stored `status`; mobile's reader drops it and lets
    // `statusFull` derive Paid from what was actually settled, which is what the
    // rest of this app shows. The two disagree on a handful of live rows still
    // filed as Partial though their payments cover the total to the rupee.
    if (v.cancelled) return;
    push(v.issuedISO ?? '', {
      key: `inv-${v.id}`,
      type: 'sales',
      title: [v.clientName, v.ref].filter(Boolean).join(' — ') || v.ref,
      meta: v.so || v.ref,
      amountNPR: nprOf(v, invoiceTotal(v)),
      sign: statusFull(v) === 'Paid' ? 1 : 0,
    });
  });

  return out;
}

/** `moneyIn` / `moneyOut` / `net` / `records` for one year's entries. */
export function totalFiscalYear(entries: FiscalYearEntry[]): Pick<FiscalYear, 'moneyIn' | 'moneyOut' | 'net' | 'records'> {
  const moneyIn = entries.filter((e) => e.sign > 0).reduce((n, e) => n + e.amountNPR, 0);
  const moneyOut = entries.filter((e) => e.sign < 0).reduce((n, e) => n + e.amountNPR, 0);
  return { moneyIn, moneyOut, net: moneyIn - moneyOut, records: entries.length };
}

/**
 * The fiscal years that actually hold records, newest first, plus the current
 * one — it is where the next transaction will land, so it is listed even empty.
 */
export function summariseFiscalYears(entries: FiscalYearEntry[]): FiscalYear[] {
  const current = currentFiscalYear();
  const labels = new Set(entries.map((e) => e.fiscalYear));
  labels.add(current.label);
  return [...labels]
    .sort((a, b) => b.localeCompare(a))
    .map((label) => {
      const fy = fiscalYearForAD(startADOf(label));
      return {
        id: label,
        label: `FY ${label}`,
        range: `Shrawan ${fy.startBSYear} – Ashad ${fy.startBSYear + 1} · ${adMonth(fy.startAD)} ${adYear(fy.startAD)} – ${adMonth(fy.endAD)} ${adYear(fy.endAD)}`,
        ...totalFiscalYear(entries.filter((e) => e.fiscalYear === label)),
        current: label === current.label,
      };
    });
}

/** Shrawan 1 of a `2083/84` label, in AD. */
function startADOf(label: string): string {
  return bsToAD({ year: Number(label.slice(0, 4)), month: 4, date: 1 });
}

export interface FiscalYearMonth {
  /** BS month name, e.g. `Bhadra`. */
  month: string;
  /** The AD months it spans, e.g. `Aug – Sep 2026`. */
  gregorian: string;
  entries: FiscalYearEntry[];
}

/** One year's entries bucketed into its BS months, newest month first. */
export function groupByBSMonth(entries: FiscalYearEntry[]): FiscalYearMonth[] {
  const buckets = new Map<string, { bsYear: number; bsMonth: number; entries: FiscalYearEntry[] }>();
  for (const entry of entries) {
    const bs = bsFromAD(entry.date);
    const key = `${bs.year}-${bs.month}`;
    const bucket = buckets.get(key) ?? { bsYear: bs.year, bsMonth: bs.month, entries: [] };
    bucket.entries.push(entry);
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .sort((a, b) => b.bsYear - a.bsYear || b.bsMonth - a.bsMonth)
    .map((b) => ({
      month: BS_MONTHS_EN[b.bsMonth - 1],
      gregorian: bsMonthSpan(b.bsYear, b.bsMonth),
      entries: [...b.entries].sort((x, y) => y.date.localeCompare(x.date)),
    }));
}
