/**
 * The plain questions about holidays, with no database in sight (lib/holidays.js has that), so the
 * Attendance sums can use them and be tested on their own. A holiday here is
 * { id, name, start, end (both YYYY-MM-DD), region ("nepal" | "uk" | "" for everyone) }.
 */
import { normaliseRegion } from "../utils/region";

/**
 * The holiday that covers this day (YYYY-MM-DD) for somebody in this region, or null. A holiday with
 * no region is for everyone. Somebody with no region on file counts as Nepal, as everywhere else.
 */
export function holidayOn(iso, holidays, region) {
  if (!holidays?.length) return null;
  const mine = normaliseRegion(region) || "nepal";
  return holidays.find((h) => h.start <= iso && iso <= h.end && (!h.region || h.region === mine)) || null;
}

/** "3 – 17 Oct", "3 Oct", or "30 Oct – 2 Nov": a holiday's days in a few words. */
export function holidaySpan(h) {
  const fmt = (iso, withMonth = true) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", withMonth ? { day: "numeric", month: "short" } : { day: "numeric" });
  };
  if (h.start === h.end) return fmt(h.start);
  const sameMonth = h.start.slice(0, 7) === h.end.slice(0, 7);
  return `${fmt(h.start, !sameMonth)} – ${fmt(h.end)}`;
}

/** How many days it runs (the first and the last included). */
export function holidayDays(h) {
  const [a, b] = [h.start, h.end].map((iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / 86400000) + 1;
}
