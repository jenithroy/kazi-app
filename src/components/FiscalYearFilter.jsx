import { useMemo, useSyncExternalStore } from "react";
import {
  ALL_FISCAL_YEARS, isFiscalYearLabel, fiscalYearDateRangeAD, fmtDateBS, mergeFiscalYears,
} from "../utils/fiscalYear";

/**
 * One fiscal-year choice for every finance page.
 *
 * The selection is shared and remembered: pick 2082/83 on Billing and Finance,
 * Purchases and Accounting open on 2082/83 too, because the person is working in
 * a year, not in a page. It lives in a tiny module-level store rather than in
 * each page's state so the pages agree without a provider being threaded
 * through the router.
 *
 * "all" is the default and means no restriction — the pages behaved that way
 * before the filter existed, so nothing disappears until a year is chosen.
 */

const STORAGE_KEY = "kazi.fiscalYear";
const listeners = new Set();
const NO_YEARS = [];

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isFiscalYearLabel(v) ? v : ALL_FISCAL_YEARS;
  } catch {
    return ALL_FISCAL_YEARS;
  }
}

let current = readStored();

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setFiscalYearFilter(value) {
  const next = isFiscalYearLabel(value) ? value : ALL_FISCAL_YEARS;
  if (next === current) return;
  current = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private window — the choice just won't be remembered */ }
  listeners.forEach((fn) => fn());
}

/** [selectedFiscalYear, setSelectedFiscalYear] — "all" or a label like "2082/83". */
export function useFiscalYearFilter() {
  const value = useSyncExternalStore(subscribe, () => current, () => ALL_FISCAL_YEARS);
  return [value, setFiscalYearFilter];
}

/**
 * The dropdown, laid out like the Type filter on the fiscal-year pages so it can
 * sit in the same row as a page's search box.
 *
 * `years` is what the page's own data spans (see fiscalYearsIn) — only those
 * years are offered, plus "All years". The one exception is a year that is
 * already selected but has nothing on this page: it stays in the list so the
 * control never shows a value it cannot display, and can still be switched away
 * from. The choice is shared across pages, so that does happen.
 */
export function FiscalYearSelect({ years = NO_YEARS, style }) {
  const [value, setValue] = useFiscalYearFilter();

  const options = useMemo(
    () => mergeFiscalYears(years, isFiscalYearLabel(value) ? [value] : []),
    [years, value]
  );

  const range = isFiscalYearLabel(value) ? fiscalYearDateRangeAD(value) : null;

  return (
    <label
      style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, ...style }}
      title={range ? `Shrawan 1 – Asar end · ${fmtDateBS(range.startAD)} to ${fmtDateBS(range.endAD)}` : "Show every fiscal year"}
    >
      <span style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap" }}>Fiscal year</span>
      <select
        className="kfin-select"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Fiscal year"
        style={{
          padding: "6px 10px", fontSize: 13, minWidth: 120,
          ...(range ? { borderColor: "var(--mint-deep)", color: "var(--mint-deep)", fontWeight: 700 } : null),
        }}
      >
        <option value={ALL_FISCAL_YEARS}>All years</option>
        {options.map((y) => <option key={y} value={y}>FY {y}</option>)}
      </select>
    </label>
  );
}
