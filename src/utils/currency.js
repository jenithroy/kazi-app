import { GBP_RATE } from "../constants";
import { asCurrency, roundAmount } from "./format";

// What the currency picker in the header does, and how any other amount in the app
// moves between currencies.
//
// Everything is stored in NPR, except a document (invoice, quotation, challan) whose
// amounts are kept in the document's own currency. Converting is always through NPR,
// at a live rate (see CurrencyContext, which fetches and caches them). Before the first
// fetch lands, or if it fails, the fallback table below stands in so nothing renders NaN.

export const BASE = "NPR";

// Offline stand-ins, in NPR per 1 unit of the currency. GBP keeps the long-standing 200.
const NPR_PER_UNIT_FALLBACK = {
  GBP: GBP_RATE, USD: 133.5, EUR: 145, AUD: 86, INR: 1.6, CNY: 18.4, SGD: 99, AED: 36.3, CAD: 97, JPY: 0.89,
};
// What the store holds: units of the currency per 1 NPR (the shape the rate feed returns).
export const FALLBACK_RATES = Object.freeze({
  NPR: 1,
  ...Object.fromEntries(Object.entries(NPR_PER_UNIT_FALLBACK).map(([c, v]) => [c, 1 / v])),
});

/* ── The rate store ─────────────────────────────────────────────────────────────
   Module-level so plain helpers (a `toNPR` defined outside a component) can read it.
   Components re-render on a change through CurrencyContext, which subscribes. */
let rates = FALLBACK_RATES;
let info = { live: false, updatedAt: null };
let version = 0;
const listeners = new Set();

export function setRates(next, { live = false, updatedAt = null } = {}) {
  rates = Object.freeze({ ...next, NPR: 1 });
  info = { live, updatedAt };
  version += 1;
  listeners.forEach((fn) => fn());
}
export const getRates = () => rates;
export const getRatesInfo = () => info;
export const getRatesVersion = () => version;
export function subscribeRates(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const hasRate = (code) => code === BASE || Number(rates[code]) > 0;

export const otherCurrency = (currency) => (currency === "GBP" ? "NPR" : "GBP");

/** An NPR amount as a number in `currency`. Unrounded; the formatters round. */
export function fromNPR(amountNPR, currency) {
  const n = Number(amountNPR) || 0;
  if (!currency || currency === BASE) return n;
  const r = Number(rates[currency]);
  return r > 0 ? n * r : n;
}

/** An amount in `currency` as NPR. An unknown currency is read as NPR, as it always was. */
export function toNPR(amount, currency) {
  const n = Number(amount) || 0;
  if (!currency || currency === BASE) return n;
  const r = Number(rates[currency]);
  return r > 0 ? n / r : n;
}

/* ── Currency facts ─────────────────────────────────────────────────────────── */

// Offered first, in this order, when they have a rate.
export const COMMON_CURRENCIES = ["NPR", "GBP", "USD", "EUR", "INR", "AUD", "AED", "CAD", "SGD", "CNY", "JPY"];

/** Every currency we hold a rate for: the common ones first, then the rest A–Z. */
export function availableCurrencies() {
  const all = Object.keys(rates).filter(hasRate);
  const common = COMMON_CURRENCIES.filter((c) => all.includes(c));
  const rest = all.filter((c) => !common.includes(c)).sort();
  return [...common, ...rest];
}

const digitsCache = {};
/** Decimal places a currency is normally written with (JPY 0, most 2). */
export function currencyDigits(code) {
  if (code in digitsCache) return digitsCache[code];
  let d = 2;
  try { d = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits; } catch { /* unknown code */ }
  return (digitsCache[code] = d);
}

const symbolCache = { NPR: "₨", GBP: "£" };
export function currencySymbol(code) {
  if (code in symbolCache) return symbolCache[code];
  let s = code;
  try {
    const part = new Intl.NumberFormat("en-US", { style: "currency", currency: code, currencyDisplay: "symbol" })
      .formatToParts(0).find((p) => p.type === "currency");
    if (part) s = part.value;
  } catch { /* unknown code */ }
  return (symbolCache[code] = s);
}

let names;
export function currencyName(code) {
  if (!names) { try { names = new Intl.DisplayNames(["en"], { type: "currency" }); } catch { names = { of: (c) => c }; } }
  try { return names.of(code) || code; } catch { return code; }
}

/** An amount already in `currency`, written the way that currency is normally written. */
export function formatIn(amount, currency) {
  if (currency === "NPR" || currency === "GBP") return asCurrency(amount, currency);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "symbol" }).format(Number(amount) || 0);
  } catch {
    return `${currency} ${(Number(amount) || 0).toFixed(2)}`;
  }
}

// Axis ticks: rupees count in lakh ("1.2L"), everything else in thousands ("1.2k").
// Takes a number that is already in `currency` — see `short` for one still in NPR.
export function shortAmount(n, currency) {
  const v = Number(n) || 0;
  if (currency !== BASE) {
    const trim = (x) => String(Number(x.toFixed(1)));
    if (v >= 1e6) return `${trim(v / 1e6)}m`;
    if (v >= 1000) return `${trim(v / 1000)}k`;
    return String(roundAmount(v));
  }
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(v);
}

/**
 * The formatters for one display currency. Every one takes an amount in NPR.
 *
 *   fmt          headline figures, whole units      "₨ 1,23,456"   "£617"   "$823"
 *   money        tables and statements              "NPR 123,456"  "£617.28"  "$823.04"
 *                (a non-breaking space after NPR; a negative leads with its minus: "-NPR 5,000")
 *                Foreign amounts keep their pence — never use `fmt` for a small amount, ₨90 would read "£0".
 *   moneyAlt     the same, in the *other* currency  — for the "(£617.28)" beside a figure.
 *                 The other is GBP while the page is in NPR, and NPR otherwise.
 *   moneyForeign the same, in the non-NPR half of an NPR | foreign pair (GBP while in NPR).
 *   num          digits only, for a column whose header already names the currency
 *   fromNPR/toNPR the bare numbers
 *   short        axis tick label
 *   prefix       what `fmt` puts before the number, for chart value labels
 *
 * `foreign` is the currency opposite NPR in a two-column table: the chosen one, or GBP while NPR is chosen.
 */
export function makeCurrencyApi(currency) {
  const isNPR = currency === BASE;
  const alt = isNPR ? "GBP" : "NPR";
  const foreign = isNPR ? "GBP" : currency;
  const symbol = currencySymbol(currency);
  const prefix = isNPR ? "₨ " : symbol;
  return {
    currency,
    altCurrency: alt,
    foreign,
    symbol,
    prefix,
    fromNPR: (npr) => fromNPR(npr, currency),
    toNPR: (amount) => toNPR(amount, currency),
    // Sign in front ("-£6", not "£-6"); an amount that rounds to nothing is "£0", never "£-0".
    fmt: (npr) => {
      if (isNPR) {
        const n = roundAmount(npr);
        return (n < 0 ? "-" : "") + prefix + Math.abs(n).toLocaleString("en-IN");
      }
      const n = roundAmount(fromNPR(npr, currency));
      if (currency === "GBP") return (n < 0 ? "-" : "") + prefix + Math.abs(n).toLocaleString("en-GB");
      return (n < 0 ? "-" : "") + prefix + Math.abs(n).toLocaleString("en-US");
    },
    money: (npr) => formatIn(fromNPR(npr, currency), currency),
    moneyAlt: (npr) => formatIn(fromNPR(npr, alt), alt),
    moneyForeign: (npr) => formatIn(fromNPR(npr, foreign), foreign),
    num: (npr) => {
      if (isNPR) return roundAmount(npr).toLocaleString();
      const d = currencyDigits(currency);
      return fromNPR(npr, currency).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    short: (npr) => shortAmount(fromNPR(npr, currency), currency),
  };
}
