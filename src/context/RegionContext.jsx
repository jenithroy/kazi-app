import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_REGION, REGION_IDS, STORAGE_KEY, normaliseRegion, regionMeta } from "../utils/region";

/**
 * Which arm of the business is on screen.
 *
 * One selection, shared by every page that has a switch. Walking from
 * Production to Inventory to Finance keeps you in the same region, which is how
 * people actually work — you are looking into the Kathmandu factory, or you are
 * looking at the UK books, and you do not want to re-state that on every page.
 *
 * Persisted, so it survives a reload. The switch is rendered per page (see
 * RegionSwitch); this only holds the answer.
 */

const RegionContext = createContext(null);

function readStored() {
  try {
    const saved = normaliseRegion(localStorage.getItem(STORAGE_KEY));
    if (REGION_IDS.includes(saved)) return saved;
  } catch {
    // Private browsing, storage disabled — fall through to the default.
  }
  return DEFAULT_REGION;
}

export function RegionProvider({ children }) {
  const [region, setRegionState] = useState(readStored);

  const setRegion = useCallback((next) => {
    const clean = normaliseRegion(next);
    if (!REGION_IDS.includes(clean)) return;
    setRegionState(clean);
    try {
      localStorage.setItem(STORAGE_KEY, clean);
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
  }, []);

  const toggleRegion = useCallback(() => {
    setRegionState((cur) => {
      const next = cur === "uk" ? "nepal" : "uk";
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      return next;
    });
  }, []);

  // Two tabs open on the same ERP should not disagree about which region they
  // are showing — one of them would quietly be reading the wrong factory.
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== STORAGE_KEY) return;
      const next = normaliseRegion(e.newValue);
      if (REGION_IDS.includes(next)) setRegionState(next);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(() => ({
    region,
    setRegion,
    toggleRegion,
    isUK: region === "uk",
    isNepal: region === "nepal",
    meta: regionMeta(region),
    label: regionMeta(region).label,
  }), [region, setRegion, toggleRegion]);

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

/**
 * The current region and how to change it.
 *
 * Safe to call outside the provider — it reports the default rather than
 * throwing, so a component lifted into a test or a standalone render does not
 * explode over a switch it never had.
 */
export function useRegion() {
  const ctx = useContext(RegionContext);
  if (ctx) return ctx;
  return {
    region: DEFAULT_REGION,
    setRegion: () => {},
    toggleRegion: () => {},
    isUK: false,
    isNepal: DEFAULT_REGION === "nepal",
    meta: regionMeta(DEFAULT_REGION),
    label: regionMeta(DEFAULT_REGION).label,
  };
}

export default RegionContext;
