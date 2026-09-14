/** Date/preview helpers for the Leads tab — standalone, unlike chatFormat.js,
 * since leads have no staff identity registry to read from. */

const DAY = 86_400_000;

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const daysAgo = (ms) => Math.round((startOfDay(Date.now()) - startOfDay(ms)) / DAY);

const clockOf = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Thread-list stamp. */
export function listTime(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (Date.now() - ms < 60_000) return "Just now";
  const days = daysAgo(ms);
  if (days === 0) return clockOf(ms);
  if (days === 1) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Day separator inside a thread. */
export function dayLabel(ms) {
  const days = daysAgo(ms);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export const messageClock = (iso) => clockOf(new Date(iso).getTime());

/** Splits a thread into day sections, so the view draws one separator per day. */
export function groupByDay(messages) {
  const groups = [];
  for (const m of messages) {
    const ms = new Date(m.created_at).getTime();
    const key = String(startOfDay(ms));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(m);
    else groups.push({ key, label: dayLabel(ms), items: [m] });
  }
  return groups;
}

/** What an attachment reads as where there's no room to render it. */
export function leadPreview(lead) {
  const last = lead?.lastMessage;
  if (!last) return "No messages yet";
  const body = last.content || (last.mediaType ? "Sent an attachment" : "");
  return last.role === "assistant" ? `You: ${body}` : body;
}
