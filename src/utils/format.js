export function toNumber(value) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// Round-half-up (away from zero), whole-number rounding used sitewide for NPR
// display — paisa isn't used in practice, so figures round to the nearest rupee.
export function roundAmount(n) {
  const num = Number(n) || 0;
  return Math.sign(num) * Math.round(Math.abs(num));
}

export function asCurrency(amount, currency = "NPR") {
  const locale = currency === "GBP" ? "en-GB" : "en-NP";
  const isGBP = currency === "GBP";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: isGBP ? 2 : 0,
    maximumFractionDigits: isGBP ? 2 : 0
  }).format(isGBP ? Number(amount) || 0 : roundAmount(amount));
}
