/**
 * Payroll's Filters panel: what the records can be narrowed by, declared as data for the shared engine (components/filters/useFilters.js).
 * No React in here, so it can be checked on its own; the sums are lib/payroll.js.
 *
 *   Person        whose pay (found from the records)
 *   Position      the position written on the record
 *   Month         the months the records are for, newest first (an A.D. month, "July 2026", the way the table groups them)
 *   Net pay       a smallest and a largest take-home amount
 *   Logged by     who entered the record (only when more than one person has)
 *   Only show     Has a late cut · Has PF or other · Has a bonus · Has a note
 *
 * The period (a fiscal year, or any From / To) is the panel's shared choice and already narrows `rows` before they get here.
 */
import { periodKey } from "./payroll";
import foldNames from "./foldNames";

const clean = (v) => String(v ?? "").trim();
const positive = (v) => Number(v) > 0;

/** The month a record is for, as the table's headings write it. */
export const monthOf = (r) => `${clean(r.month) || "Unknown month"} ${r.year || ""}`.trim();

/** `rows`: the records in the period (before the search); the months and the people offered come from them. */
export function payrollFilterDefs({ rows }) {
  const months = new Map();
  for (const r of rows) if (!months.has(monthOf(r))) months.set(monthOf(r), periodKey(r));
  const newestFirst = [...months.entries()].sort(([, a], [, b]) => b.localeCompare(a)).map(([label]) => label);

  // a name typed with other capitals or spaces is the same name (the totals count a person once whatever the spelling: lib/payroll.js)
  const people = foldNames(rows, (r) => r.staffName);
  const positions = foldNames(rows, (r) => r.role);
  const loggers = foldNames(rows, (r) => r.loggedBy);
  const defs = [
    { id: "person", label: "Person", kind: "select", of: (r) => people.keyOf(r.staffName), nameOf: people.nameOf, any: "Everyone", none: "No name" },
    { id: "position", label: "Position", kind: "select", of: (r) => positions.keyOf(r.role), nameOf: positions.nameOf, any: "Any position", none: "No position" },
  ];
  if (newestFirst.length > 1) {
    defs.push({
      id: "month", label: "Month", kind: "chips",
      options: [{ value: "all", label: "All months" }, ...newestFirst.map((label) => ({ value: label, label }))],
      test: (r, v) => monthOf(r) === v,
    });
  }
  defs.push({ id: "net", label: "Net pay", kind: "range", get: (r) => r.netNPR, unit: "NPR", pill: "Net pay" });
  if (new Set(rows.map((r) => loggers.keyOf(r.loggedBy)).filter(Boolean)).size > 1) {
    defs.push({ id: "by", label: "Logged by", kind: "select", of: (r) => loggers.keyOf(r.loggedBy), nameOf: loggers.nameOf, any: "Anyone", none: "Not recorded" });
  }
  defs.push(
    { id: "late", label: "Has a late cut", kind: "toggle", text: "Has a late cut", pill: "Has a late cut", test: (r) => positive(r.lateDeductionNPR) },
    { id: "pf", label: "Has PF or other", kind: "toggle", text: "Has PF or other taken off", pill: "Has PF or other", test: (r) => positive(r.pfDeductionNPR) },
    { id: "bonus", label: "Has a bonus", kind: "toggle", text: "Has a bonus", pill: "Has a bonus", test: (r) => positive(r.bonusNPR) },
    { id: "note", label: "Has a note", kind: "toggle", text: "Has a note", pill: "Has a note", test: (r) => Boolean(clean(r.note)) },
  );
  return defs;
}
