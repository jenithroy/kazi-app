/**
 * What every Finance tab needs from the page: who is looking, which lists, the sums, the way to say something happened.
 * The page builds it once per render and the tabs read it, so a tab is a small file about its own table and card
 * rather than a long list of props. The Purchases page provides the same context with the lists it has.
 */
import { createContext, useContext } from "react";

const Ctx = createContext(null);

export const FinanceProvider = Ctx.Provider;

export function useFin() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFin() outside a FinanceProvider");
  return v;
}

/** "No expenses in FY 2083/84 (12 in other years)." when the year is why a list is empty; the usual words otherwise. */
export function emptyWords({ fyActive, fy, noun, regionCount, fallback }) {
  return fyActive && regionCount > 0 ? `No ${noun} in FY ${fy} (${regionCount} in other years).` : fallback;
}
