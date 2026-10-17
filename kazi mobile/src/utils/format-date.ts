export function formatRelativeTime(fromDate: Date, now = new Date()): string {
  const diffMs = now.getTime() - fromDate.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
