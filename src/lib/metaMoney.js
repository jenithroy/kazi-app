/**
 * Money for the Meta Ads section only. The app-wide asCurrency() rounds every
 * non-GBP amount to whole units (right for NPR elsewhere), but here a $12.50
 * budget or a $0.42 cost per result has to show exactly — especially inside
 * the budget editor. Uses each currency's own precision (Intl's default
 * fraction digits). Stand-in until the kit's <Money exact> exists.
 */

const formatters = new Map();

function formatterFor(currency) {
  if (!formatters.has(currency)) {
    let f = null;
    try {
      f = new Intl.NumberFormat(currency === "GBP" ? "en-GB" : "en-US", { style: "currency", currency });
    } catch {
      f = null; // unknown / missing code — fall back below
    }
    formatters.set(currency, f);
  }
  return formatters.get(currency);
}

/** Major units → "$12.50". Never rounds to whole units. */
export function money(amount, currency) {
  if (amount == null || amount === "" || Number.isNaN(Number(amount))) return "—";
  const n = Number(amount);
  const f = currency ? formatterFor(currency) : null;
  if (f) return f.format(n);
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
}

/** Meta's budget fields are minor units (cents). */
export function moneyMinor(minor, currency) {
  if (minor == null) return "—";
  return money(Number(minor) / 100, currency);
}

/** Just the symbol, for chart axis prefixes ("$", "£", "NPR "). */
export function currencySymbol(currency) {
  const f = currency ? formatterFor(currency) : null;
  if (!f) return "";
  const part = f.formatToParts(0).find((p) => p.type === "currency");
  return part ? part.value : currency;
}
