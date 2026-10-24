/**
 * A date typed into a row of a table, in whichever calendar the page is set to (A.D. or B.S.).
 *
 * "22" is that day of the month the row's date is in; "22/10" or "22 oct" adds the month (the year stays); a whole date can be
 * written 2026-10-22, 22/10/2026, 22-10-26, 22 Oct 2026 or 22102026. In B.S. every number and month name is a Bikram Sambat one
 * (Baisakh to Chaitra). The answer is always the A.D. "YYYY-MM-DD" the books keep, or a reason it is not one: a day the month does
 * not have (31 Sept, 30 Chaitra in a 29-day month) is not "rounded", it is refused, and so is a year far from this one (a typo, or
 * the other calendar's year: B.S. runs 56 or 57 years ahead of A.D., so "2083" typed on an A.D. page is not 2083).
 */
import { addDays, addMonths, monthName, parseISO, toISO } from "./calendar";
import { BS_MONTHS, BS_YEARS, adToBsParts, bsPartsToAd, daysInBsMonth, fmtDateBSNumeric } from "../utils/fiscalYear";
import { kathmanduDate } from "../utils/date";

/** Devanagari digits (०१२३४५६७८९) as plain ones: a Nepali keyboard types them, and the books are kept in 0-9. */
export const asciiDigits = (s) => String(s ?? "").replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966));

const AD_MONTHS = Array.from({ length: 12 }, (_, i) => monthName(i + 1).toLowerCase());
const BS_NAMES = BS_MONTHS.map((m) => m.toLowerCase());

/** How many years either side of this one a row will take a typed date (the calendar button and the arrow keys go anywhere; this is for typing). */
const YEARS_BACK = 10;
const YEARS_AHEAD = 2;

export const NOT_A_DATE = "That is not a date. Try 22/10/2026, 22 oct or just 22.";
const farYear = (y) => `The year ${y} is far from today. Check the year, and that the page is on the calendar you are typing in (A.D. or B.S.).`;

/** A month named by its first letters ("oct", "kart"); at least three, so "ma" is never March or May. -1 when it names none. */
function monthByName(word, names) {
  const w = word.toLowerCase();
  if (w.length < 3) return -1;
  return names.findIndex((n) => n.startsWith(w));
}

/** { y, m (1 to 12), d } of the day a row's date sits on, in the chosen calendar. */
function partsOf(iso, mode) {
  const day = parseISO(iso) ? iso : kathmanduDate();
  if (mode === "bs") {
    const p = adToBsParts(day);
    return p ? { y: p.year, m: p.month + 1, d: p.day } : { y: BS_YEARS[0], m: 1, d: 1 };
  }
  const p = parseISO(day);
  return { y: p.y, m: p.m, d: p.d };
}

/** This year in the chosen calendar, or null if that calendar cannot say (today is beyond what its table covers). */
function thisYear(mode) {
  const today = kathmanduDate();
  const p = mode === "bs" ? adToBsParts(today) : parseISO(today);
  return p ? (mode === "bs" ? p.year : p.y) : null;
}

/** The A.D. day for a year, month (1 to 12) and day in the chosen calendar: `{ iso }`, or `{ why }` (what is wrong with it). */
function toAd({ y, m, d }, mode) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1) return { why: NOT_A_DATE };
  const here = thisYear(mode);
  if (here != null && (y < here - YEARS_BACK || y > here + YEARS_AHEAD)) return { why: farYear(y) };
  if (mode === "bs") {
    if (!BS_YEARS.includes(y) || d > daysInBsMonth(y, m - 1)) return { why: NOT_A_DATE };
    const iso = bsPartsToAd(y, m - 1, d);
    return iso ? { iso } : { why: NOT_A_DATE };
  }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > last ? { why: NOT_A_DATE } : { iso: toISO(y, m, d) };
}

/** A year as typed: four digits are the year, two are this century's ("83" is 2083, "26" is 2026). */
const yearOf = (digits) => (digits.length === 4 ? Number(digits) : digits.length === 2 ? 2000 + Number(digits) : NaN);

/**
 * Read what was typed. `base` is the day the row has now (the missing year, month or both come from it).
 * @returns {{ iso: string } | { why: string }} an A.D. "YYYY-MM-DD", or what is wrong with the text
 */
export function readTypedDate(raw, { mode = "ad", base } = {}) {
  const bad = { why: NOT_A_DATE };
  const text = asciiDigits(raw).trim();
  if (!text || /[^A-Za-z0-9\s./,-]/.test(text)) return bad;
  const words = text.match(/[A-Za-z]+/g) || [];
  const nums = text.match(/\d+/g) || [];
  if (words.length > 1 || (words.length === 0 && nums.length === 0)) return bad;
  const now = partsOf(base, mode);
  const names = mode === "bs" ? BS_NAMES : AD_MONTHS;

  // a month named in letters: "22 oct", "22 oct 2026", "22 oct 26", "oct 22", "2026 oct 22"
  if (words.length === 1) {
    const at = monthByName(words[0], names);
    if (at < 0 || nums.length < 1 || nums.length > 2) return bad;
    let day;
    let year = now.y;
    if (nums.length === 1) day = Number(nums[0]);
    else if (nums[0].length === 4) { year = Number(nums[0]); day = Number(nums[1]); }      // 2026 oct 22
    else { day = Number(nums[0]); year = yearOf(nums[1]); }                                // 22 oct 2026
    return toAd({ y: year, m: at + 1, d: day }, mode);
  }

  // eight digits run together: 20261022 (year first) or 22102026 (day first). The year-first reading is tried first and kept if it is a real date.
  if (nums.length === 1 && nums[0].length === 8) {
    const s = nums[0];
    const first = toAd({ y: Number(s.slice(0, 4)), m: Number(s.slice(4, 6)), d: Number(s.slice(6, 8)) }, mode);
    if (first.iso) return first;
    const second = toAd({ y: Number(s.slice(4, 8)), m: Number(s.slice(2, 4)), d: Number(s.slice(0, 2)) }, mode);
    return second.iso || first.why === NOT_A_DATE ? second : first;
  }
  if (nums.length === 1) return nums[0].length <= 2 ? toAd({ y: now.y, m: now.m, d: Number(nums[0]) }, mode) : bad;
  if (nums.length === 2) {
    if (nums.some((n) => n.length > 2)) return bad;
    return toAd({ y: now.y, m: Number(nums[1]), d: Number(nums[0]) }, mode);               // day, then month
  }
  if (nums.length === 3) {
    const [a, b, c] = nums;
    if (a.length === 4) return toAd({ y: Number(a), m: Number(b), d: Number(c) }, mode);   // 2026-10-22
    if (c.length === 4 || c.length === 2) return toAd({ y: yearOf(c), m: Number(b), d: Number(a) }, mode);   // 22-10-2026, 22-10-26
  }
  return bad;
}

/** The A.D. "YYYY-MM-DD" of what was typed, or null when it is not a date the row will take. */
export const parseTypedDate = (raw, opts) => readTypedDate(raw, opts).iso || null;

/** What the field holds while it is being typed in: the numeric date of the chosen calendar. */
export function editableDate(iso, mode) {
  if (!parseISO(iso)) return "";
  return mode === "bs" ? fmtDateBSNumeric(iso) || "" : iso;
}

/** The day a few days or months on (a month keeps the day of the month, or the month's last day if it is shorter). */
export function nudgeDate(iso, { days = 0, months = 0 }, mode = "ad") {
  if (!parseISO(iso)) return iso;
  let next = iso;
  if (months) {
    if (mode === "bs") {
      const p = adToBsParts(next);
      if (p) {
        const total = p.year * 12 + p.month + months;
        const year = Math.floor(total / 12);
        const month = total - year * 12;
        next = bsPartsToAd(year, month, Math.min(p.day, daysInBsMonth(year, month))) || next;
      }
    } else {
      next = addMonths(next, months);
    }
  }
  return days ? addDays(next, days) : next;
}
