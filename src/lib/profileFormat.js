/**
 * How the profile card words a few facts: a date, the day someone was added as an employee, which days they work. Shared by the card
 * for your own profile (components/ProfileModal.jsx) and the card for anyone else's (components/profile/PersonCard.jsx).
 */
import { WEEKDAYS } from "../constants";
import { kathmanduDate, tsDate } from "../utils/date";

export const LOCATION = { nepal: "Nepal", uk: "United Kingdom" };

export const fmtDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// The day a person was added to the staff directory, as the office (Kathmandu) saw it: "2026-04-18". Not the join date HR types in
// (that one can be set to any day): this is the record's own created stamp. Null when the stamp is missing or unusable.
export function addedDay(createdAt) {
  const d = tsDate(createdAt);
  return d ? kathmanduDate(d) : null;
}

// ["Sun","Mon","Tue","Wed","Thu","Fri"] -> "Sun–Fri"; anything patchier is listed out.
export function daysLabel(days) {
  if (!Array.isArray(days) || !days.length) return null;
  const idx = [...new Set(days.map((d) => WEEKDAYS.indexOf(d)).filter((i) => i >= 0))].sort((a, b) => a - b);
  if (!idx.length) return days.join(", ");
  if (idx.length === 7) return "Every day";
  const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  return run && idx.length > 2
    ? `${WEEKDAYS[idx[0]]}–${WEEKDAYS[idx[idx.length - 1]]}`
    : idx.map((i) => WEEKDAYS[i]).join(", ");
}
