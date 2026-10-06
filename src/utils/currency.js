import { GBP_RATE } from "../constants";
import { asCurrency, roundAmount } from "./format";

// What the ₨ / £ switch in the header does.
//
// It only changes what is *shown*. Everything is stored in NPR, and a pound is
// NPR ÷ GBP_RATE — the same fixed rate Billing, Finance and the invoice documents
// already use. A live market rate here would make £1,000 invoiced come back as
// £1,190 on the dashboard, so there deliberately isn't one.

export const otherCurrency = (currency) => (currency === "GBP" ? "NPR" : "GBP");

/** An NPR amount as a number in `currency`. Unrounded; the formatters round. */
export function fromNPR(amountNPR, currency) {
  const n = Number(amountNPR) || 0;
  return currency === "GBP" ? n / GBP_RATE : n;
}

// Axis ticks: rupees count in lakh ("1.2L"), pounds in thousands ("1.2k").
// Takes a number that is already in `currency` — see `short` for one still in NPR.
export function shortAmount(n, currency) {
  const v = Number(n) || 0;
  if (currency === "GBP") {
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
 *   fmt      headline figures, whole units      "₨ 1,23,456"   "£617"
 *   money    tables and statements              "NPR 123,456"  "£617.28"
 *            (a non-breaking space after NPR; a negative leads with its minus: "-NPR 5,000")
 *            Pounds keep their pence — never use `fmt` for a small amount, ₨90 would read "£0".
 *   moneyAlt the same, in the *other* currency  — for the "(£617.28)" beside a figure
 *   num      digits only, for a column whose header already names the currency
 *   fromNPR  the bare number, for charts
 *   short    axis tick label
 *   prefix   what `fmt` puts before the number, for chart value labels
 */
export function makeCurrencyApi(currency) {
  const alt = otherCurrency(currency);
  const prefix = currency === "GBP" ? "£" : "₨ ";
  return {
    currency,
    altCurrency: alt,
    prefix,
    fromNPR: (npr) => fromNPR(npr, currency),
    // Sign in front ("-£6", not "£-6"); an amount that rounds to nothing is "£0", never "£-0".
    fmt: (npr) => {
      const n = roundAmount(currency === "GBP" ? fromNPR(npr, "GBP") : npr);
      const digits = Math.abs(n).toLocaleString(currency === "GBP" ? "en-GB" : "en-IN");
      return (n < 0 ? "-" : "") + prefix + digits;
    },
    money: (npr) => asCurrency(fromNPR(npr, currency), currency),
    moneyAlt: (npr) => asCurrency(fromNPR(npr, alt), alt),
    num: (npr) => currency === "GBP"
      ? fromNPR(npr, "GBP").toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : roundAmount(npr).toLocaleString(),
    short: (npr) => shortAmount(fromNPR(npr, currency), currency),
  };
}
