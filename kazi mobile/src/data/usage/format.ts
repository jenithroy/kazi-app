/**
 * Time/duration formatting for Usage & Activity, mirroring the reference
 * app's helpers in `src/pages/Usage.jsx`.
 *
 * Kathmandu day maths uses the same fixed UTC+5:45 offset trick as
 * `data/attendance/*` (shift then read the UTC components) rather than the
 * device's `Intl` timezone data — the workshop's day, not the device's.
 */

const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `YYYY-MM-DD` for an instant, in Asia/Kathmandu. */
export function kathmanduDay(ms: number): string {
  return new Date(ms + NEPAL_OFFSET_MS).toISOString().slice(0, 10);
}

export function nepalToday(): string {
  return kathmanduDay(Date.now());
}

/** `HH:MM` of an ISO instant, in Asia/Kathmandu. */
export function clockOf(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + NEPAL_OFFSET_MS).toISOString().slice(11, 16);
}

/** A `YYYY-MM-DD` Kathmandu day → "Today" / "Yesterday" / "Fri 29 Aug". */
export function dayLabel(day: string): string {
  if (day === nepalToday()) return 'Today';
  if (day === kathmanduDay(Date.now() - DAY_MS)) return 'Yesterday';
  const d = new Date(`${day}T00:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/** Milliseconds of dwell time → "45m" / "2h 5m" / "<1m" / "—". */
export function humanDuration(ms: number | null | undefined): string {
  if (!ms || ms < 1000) return '—';
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Initials for an avatar: first letters of the first two words. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** An ISO instant → "just now" / "12m ago" / "3h ago" / "2d ago" / "29 Aug". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 45) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  if (secs < 7 * 86400) return `${Math.round(secs / 86400)}d ago`;
  const d = new Date(t + NEPAL_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}
