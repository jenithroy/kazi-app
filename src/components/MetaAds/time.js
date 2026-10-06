/**
 * Relative time formatting for Meta Ads section (freshness, sync runs, action logs).
 */
export function timeAgo(date) {
  if (!date) return "Never";
  const ms = typeof date === "number" ? date : new Date(date).getTime();
  if (Number.isNaN(ms)) return "—";
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 15) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
