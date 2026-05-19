/**
 * Returns today's date as YYYY-MM-DD in the browser's local timezone.
 * (Previously used toISOString() which returns UTC — wrong for Nepal UTC+5:45)
 */
export function todayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns the Monday of the current week as YYYY-MM-DD in local timezone.
 * Does NOT mutate any Date object.
 */
export function startOfWeekDate() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;           // Monday = 1, Sunday wraps back
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateLabel(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}
