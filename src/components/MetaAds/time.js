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

export function formatDateTime(date) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}
