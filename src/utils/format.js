export function toNumber(value) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function asCurrency(amount, currency = "NPR") {
  const locale = currency === "GBP" ? "en-GB" : "en-NP";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(amount || 0);
}
