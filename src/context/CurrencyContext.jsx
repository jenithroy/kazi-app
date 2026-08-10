import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { GBP_RATE as FALLBACK_RATE } from "../constants";
import { roundAmount } from "../utils/format";

const CACHE_KEY = "kazi_gbp_rate";
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function getCachedRate() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { rate, ts } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL) return rate;
  } catch {}
  return null;
}

function setCachedRate(rate) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, ts: Date.now() }));
}

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(
    () => localStorage.getItem("kazi_currency") || "NPR"
  );
  const [rate, setRate] = useState(() => getCachedRate() || FALLBACK_RATE);

  useEffect(() => {
    if (getCachedRate()) return; // still fresh, skip fetch
    fetch("https://open.er-api.com/v6/latest/GBP")
      .then(r => r.json())
      .then(d => {
        const live = d?.rates?.NPR;
        if (live && live > 0) {
          setRate(live);
          setCachedRate(live);
        }
      })
      .catch(() => {}); // silent fallback to 200
  }, []);

  const toggle = useCallback(() => {
    setCurrency(c => {
      const next = c === "NPR" ? "GBP" : "NPR";
      localStorage.setItem("kazi_currency", next);
      return next;
    });
  }, []);

  const fmt = useCallback((amountNPR) => {
    const n = Number(amountNPR || 0);
    if (currency === "GBP") {
      return "£" + roundAmount(n / rate).toLocaleString("en-GB");
    }
    return "₨ " + roundAmount(n).toLocaleString("en-IN");
  }, [currency, rate]);

  return (
    <CurrencyContext.Provider value={{ currency, toggle, fmt, rate }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
