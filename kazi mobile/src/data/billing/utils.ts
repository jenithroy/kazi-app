import { money as displayMoney, moneyLakh } from '@/lib/money';

import { CLIENTS, RATES, SYM, VAT_RATE } from './mock';
import type { Currency, DiscountMode, DocLine, Invoice, InvoiceStatus, InvoiceStatusFull } from './types';

export function n0(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function n2(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * An NPR-normalised figure (anything through `nprOf`) in the display currency.
 * Screens that call it need `useMoneySignature()`.
 */
export function npr(n: number): string {
  return displayMoney(n);
}

/** Literal rupees, whatever the display currency — for the FX arithmetic a payment sheet spells out. */
export function nprLiteral(n: number): string {
  return `रु ${n0(n)}`;
}

/**
 * An amount in *the document's own* currency. A GBP invoice is a GBP invoice:
 * its lines, totals and the balance you are paying off are never re-expressed
 * in the display currency, or the sheet would stop agreeing with the paperwork.
 */
export function money(cur: Currency, n: number): string {
  return cur === 'NPR' ? nprLiteral(n) : `${SYM[cur]}${n2(n)}`;
}

/** "रु 41.2L" / "£20.6k" — the design's `lakh()` helper, in the display currency. */
export function lakh(n: number): string {
  return moneyLakh(n);
}

export function short(cur: Currency, n: number): string {
  return cur === 'NPR' ? `रु ${n0(n)}` : `${SYM[cur]}${n0(n)}`;
}

/**
 * The buyer to show. Invoices that came from the database carry a free-text
 * `clientName`; only the seeded ones map onto a `CLIENTS` key (and a real
 * invoice’s key is a placeholder), so reading `CLIENTS[v.client]` directly
 * names a mock client the detail screen never mentions — or throws, when the
 * key isn’t one of the six seeds.
 */
export function clientNameOf(v: Pick<Invoice, 'client' | 'clientName'>): string {
  return v.clientName?.trim() || CLIENTS[v.client]?.name || 'Unnamed client';
}

/** Two-letter avatar initials for whichever name {@link clientNameOf} settles on. */
export function clientInitialsOf(v: Pick<Invoice, 'client' | 'clientName'>): string {
  if (!v.clientName?.trim()) return CLIENTS[v.client]?.initials ?? '—';
  return clientNameOf(v)
    .split(/[\s&.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function subtotal(v: Invoice): number {
  return v.lines.reduce((n, l) => n + l.qty * l.rate, 0);
}

/** Discount amount in the invoice's own currency — % or flat, capped at the subtotal. */
export function discountAmt(v: Invoice): number {
  const sub = subtotal(v);
  if (v.discountMode === 'amount') return Math.min(sub, Math.max(0, v.discountFlatAmt ?? 0));
  return sub * (Math.min(100, Math.max(0, v.discountPct ?? 0)) / 100);
}

/** Subtotal less discount — the base VAT is charged on (IRD: discount before VAT). */
export function taxable(v: Invoice): number {
  return subtotal(v) - discountAmt(v);
}

/** Whether 13% VAT applies. Form invoices carry `applyVAT`; seeds use `export` (zero-rated). */
export function appliesVAT(v: Invoice): boolean {
  return v.applyVAT ?? !v.export;
}

export function vat(v: Invoice): number {
  return appliesVAT(v) ? (taxable(v) * VAT_RATE) / 100 : 0;
}

export function total(v: Invoice): number {
  return taxable(v) + vat(v);
}

/** Every payment converted into the invoice's own currency, at the rate it was recorded. */
export function paid(v: Invoice): number {
  return v.payments.reduce((n, p) => {
    if (p.cur === v.cur) return n + p.amt;
    if (p.cur === 'NPR') return n + p.amt / v.rate;
    return n + (p.amt * p.rate) / v.rate;
  }, 0);
}

export function balance(v: Invoice): number {
  return Math.max(0, total(v) - paid(v));
}

export function status(v: Invoice): InvoiceStatus {
  if (v.cancelled) return 'cancelled';
  return balance(v) < 0.5 ? 'collected' : 'accepted';
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Past its due date with money still owed. Uses `dueISO` when present, else the seed `dueDays`. */
export function isOverdue(v: Invoice): boolean {
  if (v.cancelled || balance(v) < 0.5) return false;
  return v.dueISO ? v.dueISO < todayISO() : v.dueDays < 0;
}

/** Full IRD status model (item 14): `Draft`/`Sent` are user-set, the rest derived from payments + due date. */
export function statusFull(v: Invoice): InvoiceStatusFull {
  if (v.cancelled) return 'Cancelled';
  if (total(v) > 0 && balance(v) < 0.5) return 'Paid';
  if (v.explicitStatus === 'Draft' && paid(v) < 0.5) return 'Draft';
  if (paid(v) > 0.5) return 'Partial';
  if (isOverdue(v)) return 'Overdue';
  return v.explicitStatus ?? 'Sent';
}

/** NPR equivalent of a foreign-currency amount, always at the invoice's own booked rate (no live-FX toggle in the mobile app). */
export function nprOf(v: Invoice, amountFx: number): number {
  return amountFx * v.rate;
}

export function todaysRate(cur: Currency): number {
  return RATES[cur];
}

// ---- Challans + Quotations (item 13) ----

export interface DocTotals {
  subtotal: number;
  discountAmt: number;
  taxableAmt: number;
  vatAmt: number;
  total: number;
}

/**
 * Nepal VAT rule: discount is applied **before** VAT (IRD). `discountMode`
 * `'amount'` uses the flat figure, capped at subtotal; `'pct'` uses the
 * percentage, clamped 0–100. Mirrors the reference `calcTotals`.
 */
export function calcTotals(
  lines: DocLine[],
  applyVAT: boolean,
  discountMode: DiscountMode,
  discountPct: number,
  discountFlatAmt: number,
): DocTotals {
  const subtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  const discountAmt =
    discountMode === 'amount'
      ? Math.min(subtotal, Math.max(0, Number(discountFlatAmt) || 0))
      : subtotal * (Math.min(100, Math.max(0, Number(discountPct) || 0)) / 100);
  const taxableAmt = subtotal - discountAmt;
  const vatAmt = applyVAT ? (taxableAmt * VAT_RATE) / 100 : 0;
  return { subtotal, discountAmt, taxableAmt, vatAmt, total: taxableAmt + vatAmt };
}
