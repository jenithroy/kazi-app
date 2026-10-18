/**
 * Payroll: the sums the Payroll page shows, free of React. A payroll record is one person's pay for one month: basic and bonus make
 * the gross, the late cut and PF (or other) come off it, and what is left is the net. The record's own maths is `calcPayroll`
 * (lib/finance.js); this file groups records into months and adds them up.
 */
import { MONTHS, monthsCovered } from "./finance";

const monthIndex = (m) => MONTHS.indexOf(m);

/** A record's place in time, sortable as text: 2026-07. A record with an unknown month sorts as the year's first. */
export const periodKey = (r) => `${Number(r.year) || 0}-${String(monthIndex(r.month) + 1).padStart(2, "0")}`;

/** Newest month first, then people A to Z. */
export function sortPayroll(rows) {
  return [...rows].sort((a, b) => periodKey(b).localeCompare(periodKey(a)) || String(a.staffName || "").localeCompare(String(b.staffName || "")));
}

const num = (v) => Number(v) || 0;
const deductionsOf = (r) => (r.totalDeductionsNPR != null ? num(r.totalDeductionsNPR) : num(r.lateDeductionNPR) + num(r.pfDeductionNPR));

/** The money across some records: gross, what came off it, the net, and how many different people. */
export function totalsOf(rows) {
  return {
    gross: rows.reduce((s, r) => s + num(r.grossNPR || r.netNPR), 0),
    deductions: rows.reduce((s, r) => s + deductionsOf(r), 0),
    net: rows.reduce((s, r) => s + num(r.netNPR), 0),
    people: new Set(rows.map((r) => String(r.staffName || "").trim().toLowerCase()).filter(Boolean)).size,
    records: rows.length,
  };
}

/** Records grouped by month, newest first, each with its totals. */
export function groupByMonth(rows) {
  const groups = [];
  for (const r of sortPayroll(rows)) {
    const key = periodKey(r);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, month: r.month, year: r.year, rows: [r] });
  }
  return groups.map((g) => ({ ...g, totals: totalsOf(g.rows) }));
}

/**
 * Which records the four numbers at the top add up. With a period chosen: all of them, and it names the months they are for. Otherwise
 * this month's, and when this month has none (payroll is often entered after the fact) the most recent month that has some. The month is
 * always named ("October 2026"), never "this month": a record is kept by the A.D. month it names and counted in the period its first
 * day falls in, so "this month" would mean one thing here and another to the period menu.
 */
export function headline(rows, { periodActive, now = new Date() }) {
  if (periodActive) return { rows, label: monthsCovered(rows) || "in this period", ...totalsOf(rows) };
  const here = rows.filter((r) => r.month === MONTHS[now.getMonth()] && Number(r.year) === now.getFullYear());
  if (here.length) return { rows: here, label: `${MONTHS[now.getMonth()]} ${now.getFullYear()}`, ...totalsOf(here) };
  const latest = groupByMonth(rows)[0];
  return latest ? { rows: latest.rows, label: `${latest.month} ${latest.year}`, ...totalsOf(latest.rows) } : { rows: [], label: "no payroll yet", ...totalsOf([]) };
}
