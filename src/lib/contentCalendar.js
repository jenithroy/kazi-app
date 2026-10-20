/**
 * The content calendar's rules, with nothing on screen: what a row of `content_calendar` means, which day it sits on, in what
 * order a day reads, what a card's typing becomes, and how the arrow keys move around the month. The page (pages/Marketing.jsx)
 * draws it and lib/contentWrites.js saves it.
 *
 * A row is either an idea waiting in the inbox or a piece of work planned for a day. The table's `status` says which
 * ("inbox" | "scheduled") and the date goes with it: a row is on the calendar when it is `scheduled` AND has a real date. Any
 * other row (an inbox row, or a "scheduled" one whose date is missing: nothing draws those on a day) is an idea. The old page
 * left the second kind on neither list, so a row like that could never be seen again.
 */
import { WEEKDAY_NAMES, addDays, addMonths, fmtWords, monthGrid, monthName, monthShort, parseISO, toISO, weekday } from "./calendar";

export const TYPES = ["Shoot", "Edit", "Ideation", "Publish"];
/**
 * What a dragged piece of work is called in the drag. Not "text/plain": a text box accepts that as typing, so work dragged across the
 * "Add an idea" box wrote its id into it. A type of our own is accepted by nothing but our drop targets.
 */
export const DRAG_TYPE = "application/x-kazi-content-item";
export const DEFAULT_TYPE = "Ideation";      // an idea has not been planned yet
export const DAY_TYPE = "Shoot";             // work started on a day is most often a shoot (as the old page had it)

const clean = (v) => String(v ?? "").trim();
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const typeOf = (t) => (TYPES.includes(t) ? t : DEFAULT_TYPE);

/** One row of the table, the way the page uses it. */
export function toItem(row) {
  const date = parseISO(row.scheduledDate) ? row.scheduledDate : "";
  const placed = row.status === "scheduled" && date !== "";
  return {
    id: String(row.id),
    title: clean(row.title),
    type: typeOf(row.type),
    placed,
    date: placed ? date : "",
    timeSlot: clean(row.timeSlot),
    notes: String(row.notes ?? ""),
    mediaUrl: clean(row.mediaUrl),
    createdAt: String(row.createdAt ?? ""),
  };
}

export const titleOf = (item) => item.title || "Untitled";

/* ── Reading a day in order ───────────────────────────────────── */

const WITH_AMPM = /\b(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?m\b/i;
const CLOCK24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;

/**
 * Minutes into the day where a time slot starts ("10:00 AM – 2:00 PM" → 600, "2pm" → 840, "14:30" → 870), or Infinity when it says
 * no time (blank, or words like "Morning"): work with a time reads first, the rest after it.
 */
export function slotStart(text) {
  const s = String(text ?? "");
  const ap = WITH_AMPM.exec(s);
  if (ap) {
    let h = Number(ap[1]);
    const min = Number(ap[2] || 0);
    if (h < 1 || h > 12 || min > 59) return Infinity;
    if (ap[3].toLowerCase() === "p" && h < 12) h += 12;
    if (ap[3].toLowerCase() === "a" && h === 12) h = 0;
    return h * 60 + min;
  }
  const c = CLOCK24.exec(s);
  return c ? Number(c[1]) * 60 + Number(c[2]) : Infinity;
}

/** Earliest time first, then the order they were added in: the same day always reads the same way. */
export function byTime(a, b) {
  const t = slotStart(a.timeSlot) - slotStart(b.timeSlot);      // NaN when both have no time: falls through to the next test
  return t || cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);
}

/** Map of "YYYY-MM-DD" → the work planned that day, in the order it happens. */
export function groupByDate(items) {
  const map = new Map();
  items.filter((i) => i.placed).forEach((i) => {
    if (!map.has(i.date)) map.set(i.date, []);
    map.get(i.date).push(i);
  });
  map.forEach((list) => list.sort(byTime));
  return map;
}

/** The inbox: everything not on a day, newest idea first. */
export function inboxOf(items) {
  return items.filter((i) => !i.placed).sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(b.id, a.id));
}

/** The next `limit` pieces of work on or after `from`, in the order they happen. */
export function comingUp(items, from, limit = 8) {
  return items
    .filter((i) => i.placed && i.date >= from)
    .sort((a, b) => cmp(a.date, b.date) || byTime(a, b))
    .slice(0, limit);
}

export const countInMonth = (items, y, m) => {
  const prefix = `${y}-${String(m).padStart(2, "0")}-`;
  return items.filter((i) => i.placed && i.date.startsWith(prefix)).length;
};

/* ── Moving around the month ──────────────────────────────────── */

export const monthOf = (iso) => { const p = parseISO(iso); return { y: p.y, m: p.m }; };

/** The month's day boxes: whole weeks from the Sunday on or before the 1st to the Saturday on or after the last day (4 to 6 rows). */
export function monthCells({ y, m }) {
  const all = monthGrid(y, m);
  const last = all.map((c) => c.inMonth).lastIndexOf(true);
  return all.slice(0, Math.floor(last / 7) * 7 + 7);
}
export const monthTitle = ({ y, m }) => `${monthName(m)} ${y}`;
export const shiftMonth = ({ y, m }, by) => monthOf(addMonths(toISO(y, m, 1), by));
export const sameMonth = (a, b) => a.y === b.y && a.m === b.m;

/** "Tue 21 Oct" */
export const dayShort = (iso) => {
  const p = parseISO(iso);
  return p ? `${WEEKDAY_NAMES[weekday(iso)].slice(0, 3)} ${p.d} ${monthShort(p.m)}` : "";
};

/**
 * The day an arrow key lands on, or null when the key is not one of the calendar's. Weeks start on Sunday, as in the date picker.
 * Page keys move a month (the day of the month is kept where the month has it).
 */
export function keyTarget(iso, key) {
  const day = weekday(iso);
  switch (key) {
    case "ArrowLeft": return addDays(iso, -1);
    case "ArrowRight": return addDays(iso, 1);
    case "ArrowUp": return addDays(iso, -7);
    case "ArrowDown": return addDays(iso, 7);
    case "Home": return addDays(iso, -day);
    case "End": return addDays(iso, 6 - day);
    case "PageUp": return addMonths(iso, -1);
    case "PageDown": return addMonths(iso, 1);
    default: return null;
  }
}

/**
 * How many chips a day's box shows, and how many it leaves for "+N more". A day with more work than fits gives its last line to
 * the "+N more" and shows one chip fewer. `room` is the number of lines the box can hold.
 */
export function chipSplit(count, room) {
  const lines = Math.max(1, Math.floor(room));
  if (count <= lines) return { shown: count, more: 0 };
  const shown = Math.max(0, lines - 1);
  return { shown, more: count - shown };
}

/* ── What a card holds ────────────────────────────────────────── */

/** The card's fields for a piece of work that is not saved yet; `date` empty means it starts in the inbox. */
export const blankDraft = (date = "") => ({
  id: null, title: "", type: date ? DAY_TYPE : DEFAULT_TYPE, date, timeSlot: "", notes: "", mediaUrl: "",
});

export const draftOf = (item) => ({
  id: item.id, title: item.title, type: item.type, date: item.date, timeSlot: item.timeSlot, notes: item.notes, mediaUrl: item.mediaUrl,
});

/** What is wrong with a card's typing, in a sentence, or "" when it can be saved. */
export function formProblem(form) {
  if (!clean(form.title)) return "Give it a title.";
  if (form.date && !parseISO(form.date)) return "That date is not a real day.";
  const url = clean(form.mediaUrl);
  if (url && !/^https?:\/\/\S+$/i.test(url)) return "The picture link must start with http:// or https://.";
  return "";
}

/**
 * What the card's typing is saved as. The date decides where it lives: a date puts it on the calendar and no date puts it back in
 * the inbox, so the two columns can never disagree.
 */
export function payloadOf(form) {
  const date = parseISO(form.date) ? form.date : "";
  return {
    title: clean(form.title),
    status: date ? "scheduled" : "inbox",
    scheduledDate: date || null,
    type: typeOf(form.type),
    notes: String(form.notes ?? "").replace(/\s+$/, ""),
    timeSlot: clean(form.timeSlot),
    mediaUrl: clean(form.mediaUrl) || null,
  };
}

/** Has the card been changed from `base`? (What would be saved, compared, so a stray trailing space is not a change.) */
export const isDirty = (form, base) => JSON.stringify(payloadOf(form)) !== JSON.stringify(payloadOf(base));

/**
 * What Save writes for work that already exists: only the fields the card changed. Writing the whole card put back the day or the caption
 * a colleague had changed while it was open, with no warning. Where the work lives is one decision (a day, or none), so `status` and
 * `scheduledDate` go together or not at all.
 */
export function changesOf(form, base) {
  const now = payloadOf(form);
  const was = payloadOf(base);
  const moved = now.status !== was.status || now.scheduledDate !== was.scheduledDate;
  return Object.fromEntries(
    Object.keys(now).filter((k) => (k === "status" || k === "scheduledDate" ? moved : now[k] !== was[k])).map((k) => [k, now[k]]),
  );
}

/** A one-line account of where a piece of work is, for a card's subtitle and a row's second line. */
export const whereText = (item) => (item.placed ? `${fmtWords(item.date)}${item.timeSlot ? ` · ${item.timeSlot}` : ""}` : "In the ideas inbox");
