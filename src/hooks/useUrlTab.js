import { useCallback } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

/**
 * A page's current tab, kept in the address (?tab=payroll) instead of in memory.
 *
 * That is what lets the top menu link straight to a tab, keeps the menu's
 * highlight in step when somebody clicks the tab itself, and means a refresh
 * lands where they were. `tabs` is what this person may open; anything else in
 * the address falls back to the first, so a stale link never strands them on a
 * tab they cannot see.
 *
 * The first tab is the default and leaves the address clean. Switching tabs
 * replaces the history entry rather than adding one, and carries the entry's
 * router state along, so a page that was opened with state (Employees, from
 * Finance's Payroll card) still knows how it was reached.
 */
export default function useUrlTab(tabs, param = "tab") {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const fallback = tabs[0];
  const wanted = params.get(param);
  const tab = tabs.includes(wanted) ? wanted : fallback;

  const setTab = useCallback((next) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (next === fallback) out.delete(param);
      else out.set(param, next);
      return out;
    }, { replace: true, state });
  }, [setParams, fallback, param, state]);

  return [tab, setTab];
}
