import { createContext, useContext, useState, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  makeCurrencyApi, setRates, subscribeRates, getRatesVersion, getRatesInfo, hasRate,
  availableCurrencies, currencyName, FALLBACK_RATES,
} from "../utils/currency";

/**
 * Which currency the app is showing money in — any currency the rate feed knows.
 *
 * One choice, made with the picker in the header and shared by every page; remembered
 * between visits. Amounts are stored in NPR (a document keeps its own currency) and
 * converted at a live rate: fetched once, cached for six hours, with a built-in table
 * standing in until it lands or if the feed is down (see utils/currency.js for the
 * formatters this hands out).
 */

const STORAGE_KEY = "kazi_currency";
const RATES_CACHE_KEY = "kazi_fx_rates";
const RATES_URL = "https://open.er-api.com/v6/latest/NPR"; // units of each currency per 1 NPR
const RATES_TTL = 6 * 60 * 60 * 1000;

function readStored() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && /^[A-Z]{3}$/.test(saved)) return saved;
  } catch {
    // Private browsing, storage disabled — fall through to the default.
  }
  return "NPR";
}

function readCachedRates() {
  try {
    const { rates, ts } = JSON.parse(localStorage.getItem(RATES_CACHE_KEY));
    if (rates && rates.USD > 0 && ts) return { rates, ts };
  } catch { /* nothing cached, or unreadable */ }
  return null;
}

// Seeded once, synchronously, so the first render already has the last rates we saw
// instead of flashing the fallback table.
let seeded = false;
function seedFromCache() {
  if (seeded) return;
  seeded = true;
  const cached = readCachedRates();
  if (cached) setRates(cached.rates, { live: true, updatedAt: cached.ts });
}

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  seedFromCache();
  const [stored, setStored] = useState(readStored);
  const version = useSyncExternalStore(subscribeRates, getRatesVersion);

  // Fetch when the cache is missing or older than the TTL. A failed fetch leaves whatever
  // rates we already have in place — never worse than the fallback table.
  useEffect(() => {
    const cached = readCachedRates();
    if (cached && Date.now() - cached.ts < RATES_TTL) return undefined;
    let alive = true;
    fetch(RATES_URL)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d || d.result === "error" || !d.rates || !(d.rates.USD > 0)) return;
        const ts = Date.now();
        setRates(d.rates, { live: true, updatedAt: ts });
        try { localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ rates: d.rates, ts })); } catch { /* not remembered */ }
      })
      .catch(() => {}); // stay on the fallback
    return () => { alive = false; };
  }, []);

  const setCurrency = useCallback((code) => {
    const next = String(code || "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(next)) return;
    setStored(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
  }, []);

  // A remembered currency the feed no longer lists reads as NPR rather than as nonsense.
  const currency = hasRate(stored) ? stored : "NPR";

  const value = useMemo(() => {
    const { live, updatedAt } = getRatesInfo();
    return {
      ...makeCurrencyApi(currency),
      setCurrency,
      currencies: availableCurrencies(),
      currencyName,
      ratesLive: live,
      ratesUpdatedAt: updatedAt,
      // Put this in the deps of any useMemo that converts with toNPR/fromNPR/money.
      ratesVersion: version,
    };
    // `version` is the rate store's change counter: new rates mean new formatters.
  }, [currency, setCurrency, version]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

const OUTSIDE_PROVIDER = {
  ...makeCurrencyApi("NPR"),
  setCurrency: () => {},
  currencies: Object.keys(FALLBACK_RATES),
  currencyName,
  ratesLive: false,
  ratesUpdatedAt: null,
  ratesVersion: 0,
};

/**
 * The current currency, its formatters, and how to change it.
 *
 * Safe to call outside the provider — it reports NPR rather than throwing, so a
 * component lifted into a test or a standalone render does not explode over a
 * switch it never had.
 */
export function useCurrency() {
  return useContext(CurrencyContext) || OUTSIDE_PROVIDER;
}
