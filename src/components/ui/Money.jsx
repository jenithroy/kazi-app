import { GBP_RATE } from "../../constants";
import { useCurrency } from "../../context/CurrencyContext";
import { roundAmount } from "../../utils/format";
import { cn } from "./utils";

/* ── Money ────────────────────────────────────────────── */

function figure(n, locale, exact) {
  const abs = Math.abs(n);
  return exact
    ? abs.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : roundAmount(abs).toLocaleString(locale);
}

/**
 * An amount, stored in NPR, shown in the currency the person picked in the top
 * bar, with the other currency beside it.
 *
 *   amount     the value in NPR; null or undefined shows a dash
 *   secondary  also show the other currency, smaller (default on)
 *   tone       "owed" | "settled" | "muted"
 *   exact      two decimal places instead of whole units
 *   signed     a + before positive amounts (for money in and out)
 *   stacked    the second currency under the first, for table cells
 *   align      "end" (default) or "start", when stacked
 */
export function Money({ amount, secondary = true, tone, exact = false, signed = false, stacked = false, align = "end", className }) {
  const currencyCtx = useCurrency();

  if (amount == null || amount === "") {
    return <span className={cn("k-money", "k-money--empty", className)}>—</span>;
  }

  const currency = currencyCtx?.currency || "NPR";
  const rate = currencyCtx?.rate || GBP_RATE;
  const value = Number(amount) || 0;
  const sign = value < 0 ? "−" : signed && value > 0 ? "+" : "";
  const npr = `${sign}₨ ${figure(value, "en-IN", exact)}`;
  const gbp = `${sign}£${figure(value / rate, "en-GB", exact)}`;
  const [main, alt] = currency === "GBP" ? [gbp, npr] : [npr, gbp];

  return (
    <span
      className={cn(
        "k-money",
        stacked && "k-money--stacked",
        stacked && align === "start" && "k-money--start",
        tone && `k-money--${tone}`,
        className,
      )}
    >
      <span className="k-money-main">{main}</span>
      {secondary && <span className="k-money-alt">{alt}</span>}
    </span>
  );
}
