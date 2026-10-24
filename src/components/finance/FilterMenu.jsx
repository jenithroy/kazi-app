/**
 * The Filters button of a Finance tab, beside its search box, and the panel it opens.
 *
 * The button, the panel and the pills are the same on every page (components/filters/FilterMenu.jsx); this file only says what is the same
 * for the whole of Finance: which side of the business is on screen (Nepal or UK), whether dates are written in A.D. or B.S., and the
 * period (a month, a fiscal year, or any From / To). They are the shared choices as ever (RegionContext, useDateMode, and the fiscal year
 * and date range stores that Billing and the other finance pages also read), so changing one here changes it everywhere.
 *
 * The page that provides the Finance context decides whether "All of Finance" is offered: the Finance page and the Purchases page do (their
 * headers no longer have those buttons); a Finance context with no `filterYears` shows only the tab's own filters.
 */
import { useMemo } from "react";
import GenericFilterMenu, { ActiveFilters as GenericActiveFilters, FindBar as GenericFindBar } from "../filters/FilterMenu";
import { useFin } from "./FinanceContext";

function useFinanceScope() {
  const { filterYears, untagged } = useFin();
  return useMemo(
    () => (filterYears === undefined ? undefined : { label: "All of Finance", region: { untagged }, dates: true, period: { years: filterYears } }),
    [filterYears, untagged],
  );
}

export default function FilterMenu({ filters }) {
  return <GenericFilterMenu filters={filters} scope={useFinanceScope()} />;
}

/** What is narrowing the list right now, as pills that each clear with one press: the tab's filters, then the period. */
export function ActiveFilters({ filters }) {
  return <GenericActiveFilters filters={filters} scope={useFinanceScope()} />;
}

/** A tab's search box with the Filters button right beside it, and the pills for what is narrowed after them. */
export function FindBar(props) {
  return <GenericFindBar {...props} scope={useFinanceScope()} />;
}
