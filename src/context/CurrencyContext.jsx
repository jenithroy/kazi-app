import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { makeCurrencyApi } from "../utils/currency";

/**
 * Which currency the app is showing money in — NPR or GBP.
 *
 * One choice, made with the button in the header and shared by every page;
 * remembered between visits. It changes the display only: amounts are stored in
 * NPR and converted at the fixed GBP_RATE (see utils/currency.js for the
 * formatters this hands out).
 */

const STORAGE_KEY = "kazi_currency";

function readStored() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "NPR" || saved === "GBP") return saved;
  } catch {
    // Private browsing, storage disabled — fall through to the default.
  }
  return "NPR";
}

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(readStored);

  const toggle = useCallback(() => {
    setCurrency(c => {
      const next = c === "NPR" ? "GBP" : "NPR";
      try { localStorage.setItem(STORAGE_KEY, next); } catch {
        // Not being able to remember the choice is not a reason to refuse it.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...makeCurrencyApi(currency), toggle }), [currency, toggle]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

const OUTSIDE_PROVIDER = { ...makeCurrencyApi("NPR"), toggle: () => {} };

/**
 * The current currency, its formatters, and how to flip it.
 *
 * Safe to call outside the provider — it reports NPR rather than throwing, so a
 * component lifted into a test or a standalone render does not explode over a
 * switch it never had.
 */
export function useCurrency() {
  return useContext(CurrencyContext) || OUTSIDE_PROVIDER;
}
