/**
 * Preference-aware money formatting. Every amount in this app is stored in NPR;
 * these functions render it in whichever currency Settings › Currency is set to,
 * at the live GBP rate.
 *
 * They are plain functions, not hooks, because the per-module `npr()` / `lakh()`
 * / `short()` helpers they back are called straight from JSX at ~90 sites. The
 * cost of that is that a component does not re-render on its own when the
 * preference flips: a screen that shows money calls `useMoneySignature()` once
 * at its top, and anything that *memoises* a formatted string puts the
 * signature in its dependency list.
 */
import { useSyncExternalStore } from 'react';

import { asCompactConvertedGBP, asConvertedGBP, toGBP, type Currency } from './currency';
import { currentCurrency, currentRate, getCurrencySnapshot, subscribeCurrency } from './currency-store';

export interface MoneyOptions {
  /** Digit grouping for NPR. `en-US` = 1,250,000 · `en-IN` = 12,50,000 (lakh). Default `en-US`. */
  grouping?: 'en-US' | 'en-IN';
  /** `glyph` = `रु 1,250` / `£25` (default) · `code` = `NPR 1,250` / `GBP 25` · `none` = digits only. */
  symbol?: 'glyph' | 'code' | 'none';
}

const GLYPH: Record<Currency, string> = { NPR: 'रु', GBP: '£' };

function withSymbol(digits: string, cur: Currency, symbol: MoneyOptions['symbol']): string {
  if (symbol === 'none') return digits;
  if (symbol === 'code') return `${cur} ${digits}`;
  // The rupee glyph is a word, so it takes a space; the pound sign hugs its number.
  return cur === 'NPR' ? `${GLYPH.NPR} ${digits}` : `${GLYPH.GBP}${digits}`;
}

/**
 * An NPR amount in the display currency: `रु 1,250,000` or `£6,250`.
 * Converted pounds are whole above £100 (as the reference rounds them) and keep
 * their pence below it, so a rupee-priced trim doesn't render as `£0`.
 */
export function money(npr: number, opts: MoneyOptions = {}): string {
  const { grouping = 'en-US', symbol = 'glyph' } = opts;
  if (currentCurrency() === 'GBP') {
    const gbp = toGBP(npr, currentRate());
    if (symbol === 'glyph') return asConvertedGBP(gbp);
    const abs = Math.abs(gbp);
    const digits =
      abs >= 100 || Number.isInteger(abs)
        ? Math.round(abs).toLocaleString('en-GB')
        : abs.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return withSymbol(`${gbp < 0 ? '-' : ''}${digits}`, 'GBP', symbol);
  }
  return withSymbol(Math.round(npr).toLocaleString(grouping), 'NPR', symbol);
}

/** Just the digits, no symbol — for table columns that print the currency in their header. */
export function moneyDigits(npr: number, grouping: MoneyOptions['grouping'] = 'en-US'): string {
  return money(npr, { grouping, symbol: 'none' });
}

/**
 * Compact KPI/chart formatting: `रु 41.2L` above a lakh, plain rupees below it —
 * and `£20.6k` / `£625` in pounds. Pounds always take the glyph; `symbol` only
 * applies to the rupee side, which is the one that appears in payroll tables.
 */
export function moneyCompact(npr: number, opts: MoneyOptions = {}): string {
  if (currentCurrency() === 'GBP') return asCompactConvertedGBP(toGBP(npr, currentRate()));
  const { grouping = 'en-US', symbol = 'glyph' } = opts;
  if (Math.abs(npr) < 100_000) return withSymbol(Math.round(npr).toLocaleString(grouping), 'NPR', symbol);
  return withSymbol(`${(npr / 100_000).toFixed(1).replace(/\.0$/, '')}L`, 'NPR', symbol);
}

/**
 * Always-lakh variant — `रु 0.4L` for a sub-lakh figure — matching the `lakh()`
 * helper the design shipped for hero tiles that need a fixed-width number.
 */
export function moneyLakh(npr: number): string {
  if (currentCurrency() === 'GBP') return asCompactConvertedGBP(toGBP(npr, currentRate()));
  return `${GLYPH.NPR} ${(npr / 100_000).toFixed(1).replace(/\.0$/, '')}L`;
}

/** An amount already denominated in GBP (Customers' UK invoices, Budget's `amountGBP`). */
export function moneyFromGBP(gbp: number, opts: MoneyOptions = {}): string {
  if (currentCurrency() === 'GBP') {
    const { symbol = 'glyph' } = opts;
    const digits = gbp.toLocaleString('en-GB');
    return withSymbol(digits, 'GBP', symbol);
  }
  return money(gbp * currentRate(), opts);
}

/**
 * `NPR:200` / `GBP:203.4` — changes whenever a formatted string would.
 * Pass it as a `useMemo` dependency wherever money is formatted inside one.
 */
export function moneySignature(): string {
  const { primary, rate } = getCurrencySnapshot();
  return `${primary}:${rate}`;
}

/**
 * Subscribes the calling component to the currency preference and the live rate.
 * Call it at the top of any screen that renders money through these formatters —
 * without it the screen keeps its old rupees until something else re-renders it.
 */
export function useMoneySignature(): string {
  return useSyncExternalStore(subscribeCurrency, moneySignature, moneySignature);
}
