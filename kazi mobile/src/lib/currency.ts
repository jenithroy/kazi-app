/**
 * Dual-currency support. Kazi ops span Nepal (NPR) and the UK (GBP); the
 * reference web app carries a single `GBP_RATE` constant and renders every
 * money value in the user's preferred currency with the other shown muted
 * alongside it. This module is the pure/formatting half of that — the
 * React state (which currency is "primary", persisted) lives in
 * `currency-context.tsx`.
 *
 * The rate is a parameter here, never a global read: `currency-store.ts` owns
 * the live GBP→NPR rate (fetched like the reference app does) and passes it in.
 * Billing's per-invoice *booked* rate deliberately stays the fixed `GBP_RATE` —
 * a stored invoice total must not drift with the market.
 */

export type Currency = 'NPR' | 'GBP';

/**
 * Matches the reference app's `GBP_RATE` in `src/constants.js`. 1 GBP = 200 NPR.
 * This is the *fallback*: the live rate from `currency-store.ts` replaces it for
 * display as soon as one arrives.
 */
export const GBP_RATE = 200;

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  NPR: 'रु',
  GBP: '£',
};

export function toGBP(npr: number, rate: number = GBP_RATE): number {
  return npr / rate;
}

export function toNPR(value: number, from: Currency, rate: number = GBP_RATE): number {
  return from === 'GBP' ? value * rate : value;
}

/** Convert any amount between the two currencies. `convert(x, 'NPR', 'NPR')` is a no-op. */
export function convert(value: number, from: Currency, to: Currency, rate: number = GBP_RATE): number {
  if (from === to) return value;
  return to === 'GBP' ? toGBP(value, rate) : toNPR(value, from, rate);
}

/**
 * Format an amount that is *already in* `cur`. NPR is whole-rupee with Nepali
 * lakh grouping (१,२३,४५६ style digits stay Latin) and the `रु` glyph the
 * design uses; GBP shows pence only when the amount isn't round.
 */
export function asCurrency(value: number, cur: Currency): string {
  if (cur === 'NPR') {
    return `${CURRENCY_SYMBOL.NPR} ${Math.round(value).toLocaleString('en-IN')}`;
  }
  const rounded = Math.abs(value - Math.round(value)) < 0.005;
  return `${CURRENCY_SYMBOL.GBP}${value.toLocaleString('en-GB', {
    minimumFractionDigits: rounded ? 0 : 2,
    maximumFractionDigits: rounded ? 0 : 2,
  })}`;
}

/**
 * Compact "रु 41.2L" / "£20.6k" formatting for KPI tiles and chart labels,
 * matching the per-module `lakh()` / `short()` helpers the design shipped.
 */
export function asCompactCurrency(value: number, cur: Currency): string {
  if (cur === 'NPR') {
    if (Math.abs(value) < 100000) return `${CURRENCY_SYMBOL.NPR} ${Math.round(value).toLocaleString('en-IN')}`;
    return `${CURRENCY_SYMBOL.NPR} ${(value / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  }
  if (Math.abs(value) < 1000) return asCurrency(value, 'GBP');
  if (Math.abs(value) < 1000000) return `${CURRENCY_SYMBOL.GBP}${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${CURRENCY_SYMBOL.GBP}${(value / 1000000).toFixed(2).replace(/\.00$/, '')}m`;
}

export interface MoneyParts {
  /** The amount in the user's preferred currency, formatted. */
  primary: string;
  /** The same amount in the other currency, formatted — shown muted next to `primary`. */
  secondary: string;
}

/**
 * Given an NPR amount and the user's preferred currency, produce both the
 * primary and secondary display strings.
 */
export function moneyParts(
  npr: number,
  primaryCurrency: Currency,
  compact = false,
  rate: number = GBP_RATE,
): MoneyParts {
  const fmt = compact ? asCompactCurrency : asCurrency;
  const gbp = compact ? asCompactConvertedGBP(toGBP(npr, rate)) : asConvertedGBP(toGBP(npr, rate));
  if (primaryCurrency === 'GBP') {
    return { primary: gbp, secondary: fmt(npr, 'NPR') };
  }
  return { primary: fmt(npr, 'NPR'), secondary: gbp };
}

/**
 * A GBP amount that came from converting rupees, rather than one someone typed.
 * The reference rounds these to whole pounds (`roundAmount(n / rate)`), which
 * reads right for the invoice-sized numbers this ERP mostly shows — but a
 * रु 22 trim would render as "£0", so anything under £100 keeps its pence.
 */
export function asConvertedGBP(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  // The minus belongs outside the symbol — "£-92.40" reads as a typo.
  if (abs >= 100 || Number.isInteger(abs)) return `${sign}${asCurrency(Math.round(abs), 'GBP')}`;
  return `${sign}${CURRENCY_SYMBOL.GBP}${abs.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Compact pounds for a converted amount. `asCompactCurrency` only abbreviates
 * from £1k up and prints exact pence below it, which is more precision than a
 * KPI tile wants — under £1k this rounds the way {@link asConvertedGBP} does.
 */
export function asCompactConvertedGBP(value: number): string {
  return Math.abs(value) < 1000 ? asConvertedGBP(value) : asCompactCurrency(value, 'GBP');
}
