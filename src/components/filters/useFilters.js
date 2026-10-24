/**
 * A page's filters, declared once as data and drawn in the Filters panel (FilterMenu.jsx).
 *
 *   const tf = useFilters(defs, rows);        // `rows`: the page's rows after its search; `defs`: memoised, see below
 *   tf.rows                                   // the rows that pass every filter (same array until a filter or the rows change)
 *   <FindBar filters={tf} .../>               // the search box, the Filters button and the pills for what is narrowed
 *
 * A filter is one object in `defs`:
 *
 *   { id, label, kind: "chips",  options: [{ value, label, tone? }, …], test(row, value) }
 *        a short choice with how many each would show: [All 42] [Not paid 12] [Paid 30]. The FIRST option means "no filter".
 *   { id, label, kind: "select", of(row) → text (or a list of texts), any: "Any category", none: "No category" }
 *        one of the values the rows really hold (each once, with how many), found from the rows: a category, a supplier, a person.
 *        A row that holds several (a journal entry has a debit and a credit account) is under each of them. Optional: `nameOf(value)`
 *        writes a value for the eye when `of` gives something else (a person's id, not their name), `icon(value)` draws a node
 *        beside it in the list (a photo), `dot(value)` a coloured dot.
 *   { id, label, kind: "range",  get(row) → number, unit: "NPR", pill?: "Spend" }
 *        a smallest and a largest amount; a row without a number does not pass once either end is set. The pill says only the amounts
 *        ("NPR 20 to 100") unless `pill` names it ("Spend: NPR 20 to 100"), which a page with several ranges in one currency needs.
 *   { id, label, kind: "dates",  get(row) → "YYYY-MM-DD" (or ""), show?(iso) → text, pill?: "Due" }
 *        a From and a To day; a row without a day does not pass once either end is set. `show` writes a day the way the page writes
 *        days (A.D. or B.S.), for the pill and the hints.
 *   { id, label, kind: "toggle", test(row) → boolean, text?: "Late only", pill?: "Late" }
 *        one yes/no switch with how many it would leave: [Late only 3]. Off is "no filter".
 *   { …, controlled: { value, set } }
 *        a choice the page already keeps itself and uses for something other than narrowing (which of two lists to show, whose tasks, the
 *        order of a book). It is drawn with the others but never narrows `rows` and is never a pill; its options may carry their own
 *        `count` (none is worked out for it, and it needs no `test`).
 *
 * The counts on a filter's options are worked out with every OTHER filter applied and that filter left out (the way a shop's filters
 * count), so "Paid 30" is what you would get by choosing it now. `defs` must be memoised by the page (its functions close over the
 * page's data); `tf.rows` is then stable, which a table needs (a new array every render would re-sort and re-measure it every render).
 *
 * Pressing a pill's × clears that one filter; `tf.clear()` clears them all (not the controlled ones); `tf.set(id, value)` chooses one from
 * outside the panel (a tile or a link on the page that means "show me these").
 *
 * (Written for the Finance tabs, which were first; the other pages use it the same way. finance/useTabFilters.js is this file.)
 */
import { useCallback, useMemo, useState } from "react";

const NONE = "__none__";                                      // the value for rows that hold no text, in a "select"
const OFF_RANGE = Object.freeze({ min: "", max: "" });
const OFF_DATES = Object.freeze({ from: "", to: "" });

export const offOf = (d) => {
  if (d.kind === "chips") return d.options[0].value;
  if (d.kind === "range") return OFF_RANGE;
  if (d.kind === "dates") return OFF_DATES;
  if (d.kind === "toggle") return false;
  return "";
};

const rangeOn = (v) => v.min !== "" || v.max !== "";
const datesOn = (v) => v.from !== "" || v.to !== "";
const isOn = (d, v) => {
  if (d.controlled) return false;
  if (d.kind === "chips") return v !== d.options[0].value;
  if (d.kind === "range") return rangeOn(v);
  if (d.kind === "dates") return datesOn(v);
  if (d.kind === "toggle") return v === true;
  return v !== "";
};

/** The day a row holds for a "dates" filter, as "YYYY-MM-DD", or "" when it has none. */
function dayOf(d, row) {
  const raw = d.get(row);
  const s = typeof raw === "string" ? raw.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function passes(d, row, v) {
  if (d.kind === "chips") return v === d.options[0].value || typeof d.test !== "function" || d.test(row, v);
  if (d.kind === "toggle") return !v || d.test(row);
  if (d.kind === "range") {
    if (!rangeOn(v)) return true;
    const n = numberOf(d, row);
    if (n === null) return false;
    return (v.min === "" || n >= Number(v.min)) && (v.max === "" || n <= Number(v.max));
  }
  if (d.kind === "dates") {
    if (!datesOn(v)) return true;
    const day = dayOf(d, row);
    if (!day) return false;
    return (v.from === "" || day >= v.from) && (v.to === "" || day <= v.to);
  }
  if (!v) return true;
  return holds(d, row).includes(v);
}

/** What a value of a "select" is called on screen. */
const nameFor = (d, key) => (key === NONE ? d.none || "None" : d.nameOf ? String(d.nameOf(key) ?? key) : key);

/** The groups a row is under in a "select": its trimmed texts, or the "none" group when it holds none. */
function holds(d, row) {
  const texts = [].concat(d.of(row) ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);
  return texts.length ? [...new Set(texts)] : [NONE];
}

const nf = (n) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** The row's number for a range, or null when it has none (a missing value is not nought). */
function numberOf(d, row) {
  const raw = d.get(row);
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** "5,000 to 20,000", "from 5,000", "up to 20,000" */
export function rangeText(v, unit) {
  const u = unit ? `${unit} ` : "";
  if (v.min !== "" && v.max !== "") return `${u}${nf(v.min)} to ${nf(v.max)}`;
  return v.min !== "" ? `${u}from ${nf(v.min)}` : `${u}up to ${nf(v.max)}`;
}

/** "12 Oct to 18 Oct", "from 12 Oct", "up to 18 Oct" (`show` writes a day; without it the day is written as it is kept). */
export function datesText(v, show = (iso) => iso) {
  if (v.from !== "" && v.to !== "") return v.from === v.to ? show(v.from) : `${show(v.from)} to ${show(v.to)}`;
  return v.from !== "" ? `from ${show(v.from)}` : `up to ${show(v.to)}`;
}

/**
 * The whole of it, with no React: the rows that pass, what the panel shows for each filter, and what is narrowing. `valueOf(def)` says what is
 * chosen for a filter, `setValue(def, value)` changes it, `clear()` clears every filter the hook keeps.
 */
export function computeFilters(allDefs, rows, valueOf, setValue, clear) {
  const defs = allDefs.filter((d) => d.kind !== "chips" || d.options.length > 0);        // a short choice with nothing to choose from is not drawn
  const live = defs.filter((d) => !d.controlled);
  const vals = new Map(defs.map((d) => {
    let v = valueOf(d);
    // a stored choice that is no longer on offer (its month left the period, a kind vanished after a reload) is no choice: the first option stands
    if (d.kind === "chips" && !d.controlled && !d.options.some((o) => o.value === v)) v = d.options[0].value;
    return [d.id, v];
  }));
  const pass = (row, skip) => live.every((d) => d.id === skip || passes(d, row, vals.get(d.id)));
  const out = rows.filter((r) => pass(r));

  const sections = defs.map((d) => {
    const value = vals.get(d.id);
    const set = (v) => setValue(d, v);
    if (d.kind === "chips") {
      // A choice that only switches the view (controlled, or with no test to count by) shows the counts it was given, or none.
      const counts = !d.controlled && typeof d.test === "function";
      const others = counts ? rows.filter((r) => pass(r, d.id)) : rows;
      const options = d.options.map((o, i) => ({
        ...o,
        count: o.count !== undefined ? o.count : counts ? (i === 0 ? others.length : others.filter((r) => d.test(r, o.value)).length) : undefined,
      }));
      return { id: d.id, label: d.label, kind: "chips", value, set, options };
    }
    if (d.kind === "toggle") {
      const count = typeof d.test === "function" ? rows.filter((r) => pass(r, d.id)).filter((r) => d.test(r)).length : undefined;      // a controlled switch needs no test
      return { id: d.id, label: d.label, kind: "toggle", value, set, text: d.text || d.label, count };
    }
    if (d.kind === "select") {
      const others = rows.filter((r) => pass(r, d.id));
      const seen = new Map();
      others.forEach((r) => holds(d, r).forEach((key) => seen.set(key, (seen.get(key) || 0) + 1)));
      if (value && !seen.has(value)) seen.set(value, 0);                       // what is chosen stays on the list even when nothing is left under it
      const options = [...seen.entries()]
        .sort(([a], [b]) => (a === NONE ? 1 : b === NONE ? -1 : nameFor(d, a).localeCompare(nameFor(d, b))))
        .map(([key, count]) => ({
          value: key, label: nameFor(d, key), hint: String(count),
          icon: key !== NONE && d.icon ? d.icon(key) : undefined, dot: key !== NONE && d.dot ? d.dot(key) : undefined,
        }));
      return { id: d.id, label: d.label, kind: "select", value, set, options: [{ value: "", label: d.any || "Any" }, ...options] };
    }
    if (d.kind === "dates") {
      // the earliest and the latest day the other filters leave, as a hint of what to pick
      const days = rows.filter((r) => pass(r, d.id)).map((r) => dayOf(d, r)).filter(Boolean).sort();
      return { id: d.id, label: d.label, kind: "dates", value, set, show: d.show || ((iso) => iso), lo: days[0] || null, hi: days[days.length - 1] || null };
    }
    // a range: the smallest and largest the other filters leave, as a hint of what to type
    const nums = rows.filter((r) => pass(r, d.id)).map((r) => numberOf(d, r)).filter((n) => n !== null);
    return {
      id: d.id, label: d.label, kind: "range", value, set, unit: d.unit,
      lo: nums.length ? nums.reduce((a, n) => (n < a ? n : a), Infinity) : null, hi: nums.length ? nums.reduce((a, n) => (n > a ? n : a), -Infinity) : null,
    };
  });

  const active = live
    .filter((d) => isOn(d, vals.get(d.id)))
    .map((d) => {
      const v = vals.get(d.id);
      const text = d.kind === "chips"
        ? d.options.find((o) => o.value === v)?.label || String(v)
        : d.kind === "range" ? (d.pill ? `${d.pill}: ${rangeText(v, d.unit)}` : rangeText(v, d.unit))
        : d.kind === "toggle" ? d.pill || d.text || d.label
        : d.kind === "dates" ? `${d.pill || d.label}: ${datesText(v, d.show)}`
        : `${d.label}: ${nameFor(d, v)}`;
      return { id: d.id, text, clear: () => setValue(d, offOf(d)) };
    });

  return {
    rows: out,
    values: Object.fromEntries(vals),
    sections,
    active,
    count: active.length,
    clear,
    /** Choose one filter from outside the panel (a tile that means "show me these"): `tf.set("stage", "Cutting")`. A name nothing answers to does nothing. */
    set: (id, v) => { const d = defs.find((x) => x.id === id); if (d) setValue(d, d.kind === "select" && v !== "" ? String(v) : v); },
  };
}

export default function useFilters(defs, rows) {
  const [own, setOwn] = useState({});                          // the page's filters that this hook keeps, by id

  const valueOf = useCallback((d) => (d.controlled ? d.controlled.value : own[d.id] ?? offOf(d)), [own]);
  const setValue = useCallback((d, v) => {
    if (d.controlled) d.controlled.set(v);
    else setOwn((o) => ({ ...o, [d.id]: v }));
  }, []);
  const clear = useCallback(() => setOwn({}), []);

  return useMemo(() => computeFilters(defs, rows, valueOf, setValue, clear), [defs, rows, valueOf, setValue, clear]);
}
