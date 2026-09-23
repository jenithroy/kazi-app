import { useSyncExternalStore } from "react";
import { isDateRangeActive } from "../utils/fiscalYear";

/**
 * One custom From/To date range, shared and remembered across every finance
 * page the same way the fiscal year choice is (see FiscalYearFilter.jsx) — a
 * tiny module-level store instead of per-page state, so switching from
 * Billing to Finance keeps the same period on screen.
 *
 * Stacks on top of the fiscal year filter rather than replacing it — region →
 * fiscal year → this, one narrowing step further (see filterByDateRange).
 * Either side can be left blank: "" on `from` or `to` means that side is
 * open, so "everything up to X" and "everything from X on" both work, not
 * just a fully closed range.
 */

const STORAGE_KEY = "kazi.dateRange";
const EMPTY_RANGE = { from: "", to: "" };
const listeners = new Set();

function readStored() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (v && typeof v === "object") return { from: v.from || "", to: v.to || "" };
  } catch { /* private window, or nothing saved yet */ }
  return EMPTY_RANGE;
}

let current = readStored();

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setDateRangeFilter(next) {
  const value = { from: next?.from || "", to: next?.to || "" };
  if (value.from === current.from && value.to === current.to) return;
  current = value;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* private window — choice just won't be remembered */ }
  listeners.forEach((fn) => fn());
}

/** [{from, to}, setDateRangeFilter] — "" on either side means that side is open. */
export function useDateRangeFilter() {
  const value = useSyncExternalStore(subscribe, () => current, () => EMPTY_RANGE);
  return [value, setDateRangeFilter];
}

/**
 * The two date inputs, styled to sit in the same row as Fiscal Year / search
 * (see FiscalYearSelect). Plain A.D. inputs — every date on these pages is
 * stored as an A.D. ISO string already; B.S. is a per-page display toggle on
 * top of that, not a second way to enter one.
 */
export function DateRangeSelect({ style }) {
  const [range, setRange] = useDateRangeFilter();
  const active = isDateRangeActive(range);
  const inputStyle = {
    padding: "6px 8px", fontSize: 13, colorScheme: "light",
    ...(active ? { borderColor: "var(--mint-deep)", color: "var(--mint-deep)", fontWeight: 700 } : null),
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, ...style }}>
      <span style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap" }}>Period</span>
      <input
        type="date" className="kfin-input" aria-label="From date" title="From date"
        value={range.from} max={range.to || undefined} style={inputStyle}
        onChange={(e) => setDateRangeFilter({ ...range, from: e.target.value })}
      />
      <span style={{ fontSize: 12, color: "var(--ink-4)" }}>–</span>
      <input
        type="date" className="kfin-input" aria-label="To date" title="To date"
        value={range.to} min={range.from || undefined} style={inputStyle}
        onChange={(e) => setDateRangeFilter({ ...range, to: e.target.value })}
      />
      {active && (
        <button
          type="button" className="ghost-button" style={{ padding: "3px 8px", fontSize: 12 }}
          onClick={() => setDateRangeFilter(EMPTY_RANGE)} title="Clear date range"
        >
          ✕
        </button>
      )}
    </div>
  );
}
