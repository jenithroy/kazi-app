const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
    formatters.set(currency, formatter);
  }
  return formatter;
}

/** Kazi ops span Nepal (NPR) and UK (GBP) — always format with an explicit currency, never a bare number. */
export function formatCurrency(amount: number, currency: 'NPR' | 'GBP'): string {
  if (currency === 'NPR') {
    // Intl doesn't render NPR with the "NPR" prefix the design uses; match it directly.
    return `NPR ${Math.round(amount).toLocaleString('en-IN')}`;
  }
  return getFormatter(currency).format(amount);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
