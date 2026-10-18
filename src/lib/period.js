/**
 * The period a finance page is looking at, and the choices that set it.
 *
 * Two shared filters already decide it (a fiscal year, and a From/To range on top of it: FiscalYearFilter.jsx,
 * DateRangeFilter.jsx). This file does not replace them. It names the common choices ("this month", "last fiscal year"),
 * works out what each one sets, and says in words what is chosen.
 *
 * "This month" is the Nepali (Bikram Sambat) month: the books are kept by fiscal year, which is a B.S. year, and an
 * accountant's month is Kartik or Mangsir, not the 1st to the 31st. Its name is on the option, so it is never ambiguous.
 */
import {
  BS_MONTHS, adToBsParts, bsPartsToAd, daysInBsMonth, currentFiscalYear, fiscalYearDateRangeAD, fiscalYearLabel,
  fmtDateBS, isFiscalYearLabel, parseFiscalYearLabel, ALL_FISCAL_YEARS, mergeFiscalYears,
} from "../utils/fiscalYear";
import { fmtField } from "./calendar";

export const NO_RANGE = { from: "", to: "" };

/** The B.S. month `offset` months from the one `todayIso` is in, as an A.D. range with its name. */
export function bsMonthRange(todayIso, offset = 0) {
  const p = adToBsParts(todayIso);
  if (!p) return null;
  let y = p.year;
  let m = p.month + offset;
  while (m < 0) { m += 12; y -= 1; }
  while (m > 11) { m -= 12; y += 1; }
  const from = bsPartsToAd(y, m, 1);
  const to = bsPartsToAd(y, m, daysInBsMonth(y, m));
  return from && to ? { from, to, name: `${BS_MONTHS[m]} ${y}` } : null;
}

const previousFiscalYear = (label) => fiscalYearLabel(parseFiscalYearLabel(label).startYear - 1);

/**
 * The choices for the period menu. `years` is the fiscal years the current tab's records fall in (the page works it out
 * per tab); the current year and last year are always offered, then any other year that has records.
 */
export function periodOptions({ today, years = [], fy, range }) {
  const thisFy = currentFiscalYear();
  const lastFy = thisFy ? previousFiscalYear(thisFy) : "";
  const m0 = bsMonthRange(today, 0);
  const m1 = bsMonthRange(today, -1);
  const fyList = mergeFiscalYears(years, thisFy ? [thisFy] : [], lastFy ? [lastFy] : [], isFiscalYearLabel(fy) ? [fy] : []);
  const opts = [{ value: "all", label: "All time" }];
  if (m0) opts.push({ value: "month:0", label: "This month", hint: m0.name });
  if (m1) opts.push({ value: "month:-1", label: "Last month", hint: m1.name });
  fyList.forEach((y) => opts.push({ value: `fy:${y}`, label: `Fiscal year ${y}`, hint: y === thisFy ? "this year" : y === lastFy ? "last year" : undefined }));
  const chosen = chosenValue({ fy, range, today });
  if (chosen === "custom") opts.push({ value: "custom", label: "Custom dates", disabled: true });
  return opts;
}

/** Which menu entry matches what is chosen right now ("custom" when it is a pair of dates nobody named). */
export function chosenValue({ fy, range, today }) {
  const hasRange = Boolean(range?.from || range?.to);
  if (isFiscalYearLabel(fy)) return `fy:${fy}`;
  if (!hasRange) return "all";
  const m0 = bsMonthRange(today, 0);
  const m1 = bsMonthRange(today, -1);
  if (m0 && range.from === m0.from && range.to === m0.to) return "month:0";
  if (m1 && range.from === m1.from && range.to === m1.to) return "month:-1";
  return "custom";
}

/** What picking an entry sets: a fiscal year (clearing the dates), or a pair of dates (clearing the year). */
export function applyChoice(value, { today }) {
  if (value === "all") return { fy: ALL_FISCAL_YEARS, range: NO_RANGE };
  if (value.startsWith("fy:")) return { fy: value.slice(3), range: NO_RANGE };
  if (value.startsWith("month:")) {
    const r = bsMonthRange(today, Number(value.slice(6)));
    return r ? { fy: ALL_FISCAL_YEARS, range: { from: r.from, to: r.to } } : null;
  }
  return null;
}

/** Shortcuts under the From / To calendars: the start and end of the usual stretches. */
export function rangeShortcuts({ today }) {
  const m0 = bsMonthRange(today, 0);
  const m1 = bsMonthRange(today, -1);
  const fy = currentFiscalYear();
  const fyr = fy ? fiscalYearDateRangeAD(fy) : null;
  const from = [];
  const to = [];
  if (m0) from.push([`Start of ${m0.name.split(" ")[0]}`, m0.from]);
  if (m1) from.push([`Start of ${m1.name.split(" ")[0]}`, m1.from]);
  if (fyr?.startAD) from.push(["Start of fiscal year", fyr.startAD]);
  to.push(["Today", today]);
  if (m1) to.push([`End of ${m1.name.split(" ")[0]}`, m1.to]);
  if (fyr?.endAD) to.push(["End of fiscal year", fyr.endAD]);
  return { from, to };
}

/** The period in words, in whichever calendar the page is showing: "Fiscal year 2083/84 · 17 Jul 2026 to 16 Jul 2027". */
export function describePeriod({ fy, range, mode = "ad" }) {
  const show = (iso) => (mode === "bs" ? fmtDateBS(iso) : fmtField(iso));
  const parts = [];
  if (isFiscalYearLabel(fy)) {
    const r = fiscalYearDateRangeAD(fy);
    parts.push(`Fiscal year ${fy}${r?.startAD && r?.endAD ? ` · ${show(r.startAD)} to ${show(r.endAD)}` : ""}`);
  }
  if (range?.from || range?.to) {
    const text = range.from && range.to ? `${show(range.from)} to ${show(range.to)}`
      : range.from ? `from ${show(range.from)}` : `up to ${show(range.to)}`;
    parts.push(isFiscalYearLabel(fy) ? `narrowed to ${text}` : text);
  }
  return parts.length ? parts.join(", ") : "All time";
}
