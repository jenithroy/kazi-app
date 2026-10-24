/**
 * What a row of fields does, whatever it writes: keep what is typed, check it, write it once, say how it went, and be ready for the next.
 *
 *   kind     which row this is ("expense", "purchase" …): what is typed and the last day used are kept per kind
 *   blank    (day) => an empty form for that day
 *   check    (form) => null, or { field, message, full? } (the first thing wrong; `full` offers the card for it)
 *   write    async (form) => { ok, row?, message?, field? }, the same writes (lib/financeWrites.js) the cards make
 *   after    ({ res, form }) => the words for "Saved …" (and whatever the tab does next: look again, light the new row)
 *
 * Four habits, each so that a slip costs nothing:
 *   - what is typed and not yet saved is kept when she goes to another section and comes back (it is the page's memory, not the
 *     browser's: a reload starts clean), for the person who typed it and the books (Nepal, UK) it was typed for;
 *   - the day of the last row saved is the day of the next one for half an hour (bills come in batches), then it is today again; a day she
 *     chose herself is never swapped for today's behind her back;
 *   - a second press while a write is on its way is ignored, wherever she has gone since: the memory holds "being written" too, so a row
 *     that is drawn again while its record is still on the way shows it, and what is typed meanwhile is not taken (it would be mixed into
 *     the record being written, or wiped when the write lands);
 *   - the page still loading is not a row that can be saved.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { enterAdvance } from "../flow";
import { useFin } from "../FinanceContext";
import { outsidePeriod } from "../../../lib/financeEntry";
import { kathmanduDate } from "../../../utils/date";

const HALF_HOUR = 30 * 60 * 1000;

/* ── The page's memory of each row: one slot per person, kind and region ───── */

const slots = new Map();
const listeners = new Set();
let version = 0;
const emit = () => { version += 1; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const stamp = () => version;

/**
 * form     what is typed
 * picked   the day in `form` was chosen by her (typed, or taken from the calendar), not put there by the row
 * busy     its write is on its way
 * problem  the first thing wrong, as the bubble shows it
 * saved    the words for the tick, for a moment
 * last     { date, at } of the row last saved
 */
function slotOf(key) {
  let s = slots.get(key);
  if (!s) {
    s = { form: null, picked: false, busy: false, problem: null, saved: null, last: null, timer: 0 };
    slots.set(key, s);
  }
  return s;
}

const startDay = (key) => {
  const last = slots.get(key)?.last;
  return last && Date.now() - last.at < HALF_HOUR ? last.date : kathmanduDate();
};

/** Says so when a record has just been saved on a day the page is not showing (another fiscal year, outside From / To). */
export function useOutsideNote() {
  const { fy, dateRange, show, notify } = useFin();
  return useCallback((day) => {
    if (outsidePeriod({ fy, dateRange }, day)) {
      notify(`Saved, dated ${show(day)}. That is outside the period on screen, so it is not in this list. Choose another period to see it.`, "warn");
    }
  }, [fy, dateRange, show, notify]);
}

const sameBut = (a, b, skip) => JSON.stringify({ ...a, [skip]: null }) === JSON.stringify({ ...b, [skip]: null });

export default function useEntry({ kind, blank, check, write, after, first }) {
  // what is typed belongs to the person who typed it and to the books it was typed for: the page lives on when one signs out and another
  // signs in, and when the region is switched (a record half-typed for Nepal must not be filed in the UK books by an Enter)
  const { profile, region, loading } = useFin();
  const key = `${profile?.personId || profile?.id || profile?.name || ""}:${kind}:${region || ""}`;
  useSyncExternalStore(subscribe, stamp);
  const slot = slotOf(key);
  if (!slot.form) slot.form = blank(startDay(key));

  const rowRef = useRef(null);
  const latest = useRef({});
  latest.current = { check, write, after, blank, loading };

  const idOf = useCallback((name) => `fe-${kind}-${name}`, [kind]);
  const focusField = useCallback((name) => {
    requestAnimationFrame(() => rowRef.current?.querySelector(`#${CSS.escape(`fe-${kind}-${name}`)}`)?.focus({ preventScroll: true }));
  }, [kind]);

  // The memory is brought up to date at once, not on the next render: a date typed and taken by the same key press that saves (Ctrl + Enter)
  // has to be in the form the save reads.
  const set = useCallback((patch) => {
    const s = slotOf(key);
    if (s.busy) return;
    const change = typeof patch === "function" ? patch(s.form) : patch;
    // the row's own day is today's (or the batch's); a day she put there is hers, unless it is today's anyway
    if ("date" in change) s.picked = Boolean(change.date) && change.date !== kathmanduDate();
    s.form = { ...s.form, ...change };
    s.problem = null;
    emit();
  }, [key]);

  /** A thing the row has to say that is not about a save (a paste that was not an amount). */
  const say = useCallback((problem) => { slotOf(key).problem = problem; emit(); }, [key]);

  const submit = useCallback(async () => {
    const s = slotOf(key);
    const { check: verify, write: put, after: then, blank: fresh, loading: waiting } = latest.current;
    if (s.busy || waiting) return;
    const f = s.form;
    const why = verify(f);
    if (why) { s.problem = why; emit(); if (why.field) focusField(why.field); return; }
    s.busy = true;
    s.problem = null;
    s.saved = null;                  // (the tick of the last one gives way to the spinner of this one)
    clearTimeout(s.timer);
    emit();
    let res;
    try { res = await put(f); } catch (err) { console.error(err); res = { ok: false, message: "Not saved. Check your connection and try again." }; }
    s.busy = false;
    if (!res || !res.ok) {
      s.problem = { message: res?.message || "Not saved. Try again.", field: res?.field };
      emit();
      if (res?.field) focusField(res.field);
      return;
    }
    s.last = { date: f.date, at: Date.now() };
    let label = "";
    // (the record is written: whatever the words after it do, the row must be ready for the next one and must not still hold this one)
    try { label = then ? then({ res, form: f }) : ""; } catch (err) { console.error(err); }
    s.form = fresh(f.date);
    s.picked = false;
    s.saved = { label: label || "Saved" };
    clearTimeout(s.timer);
    s.timer = setTimeout(() => { s.saved = null; emit(); }, 2600);
    emit();
    if (first) focusField(first);
  }, [key, first, focusField]);

  // Escape puts a bubble away (a list or calendar that is open took its own Escape first); otherwise the row's keys are the cards': Enter, Ctrl + Enter
  const onKeyDown = useCallback((e) => {
    const s = slotOf(key);
    if (e.key === "Escape" && !e.defaultPrevented && s.problem) { s.problem = null; emit(); return; }
    enterAdvance(e, submit);
  }, [key, submit]);

  // A row left alone does not carry yesterday's day into tomorrow: once the half hour of a batch is up and nothing has been typed, it is today again.
  // What she typed or chose is hers and is left as it is: a day she picked (even with nothing else typed yet), and a row with something in it
  // (a bill half done keeps the day it was started on).
  const refreshDay = useCallback(() => {
    const s = slotOf(key);
    const f = s.form;
    if (!f || !f.date || s.picked || s.busy || (s.last && Date.now() - s.last.at < HALF_HOUR)) return;
    const today = kathmanduDate();
    if (f.date === today) return;
    const { blank: fresh } = latest.current;
    if (!sameBut(f, fresh(f.date), "file")) return;
    s.form = fresh(today);
    emit();
  }, [key]);
  useEffect(() => {
    refreshDay();
    const every = setInterval(refreshDay, 60000);
    window.addEventListener("focus", refreshDay);
    document.addEventListener("visibilitychange", refreshDay);
    return () => { clearInterval(every); window.removeEventListener("focus", refreshDay); document.removeEventListener("visibilitychange", refreshDay); };
  }, [refreshDay]);

  /** Empty the row (its typing has gone into a card that saved it), keeping the day. */
  const clear = useCallback(() => {
    const s = slotOf(key);
    s.form = latest.current.blank(s.form.date);
    s.problem = null;
    emit();
  }, [key]);

  return { form: slot.form, set, say, busy: slot.busy, waiting: loading, problem: slot.problem, saved: slot.saved, submit, onKeyDown, rowRef, idOf, focusField, clear };
}
