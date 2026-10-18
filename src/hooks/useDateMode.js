import { useSyncExternalStore } from "react";
import { fmtField } from "../lib/calendar";
import { fmtDateBS } from "../utils/fiscalYear";

/**
 * A.D. or B.S.: which calendar the finance pages show their dates in.
 *
 * Stored dates are always A.D. "YYYY-MM-DD" strings. This only decides how one is shown and how it is typed in. It is one
 * choice for every date on every finance page, remembered between visits, so an accountant who keeps the books in Nepali
 * dates sets it once. (It used to be a separate switch on each tab and reset on every visit.)
 */

const KEY = "kazi.dateMode";
const listeners = new Set();

function read() {
  try { return localStorage.getItem(KEY) === "bs" ? "bs" : "ad"; } catch { return "ad"; }
}
let current = read();

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function setDateMode(next) {
  const value = next === "bs" ? "bs" : "ad";
  if (value === current) return;
  current = value;
  try { localStorage.setItem(KEY, value); } catch { /* private window: it just won't be remembered */ }
  listeners.forEach((fn) => fn());
}

/** ["ad" | "bs", setDateMode, show(iso)]: `show` writes a stored date in the chosen calendar. */
export default function useDateMode() {
  const mode = useSyncExternalStore(subscribe, () => current, () => "ad");
  const show = (iso) => {
    if (!iso) return "—";
    const day = String(iso).slice(0, 10);
    return mode === "bs" ? fmtDateBS(day) : (fmtField(day) || "—");
  };
  return [mode, setDateMode, show];
}
