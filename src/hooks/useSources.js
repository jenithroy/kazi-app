import { useSyncExternalStore } from "react";
import { normalizeSources } from "../lib/sources";

/**
 * The Contact Finder's sources (lib/sources.js): where to take companies from and how to read them, as the person chose them in "Sources". Kept in this
 * browser, so they are the same on every visit and for the page and the run alike, and each person has their own.
 *
 *   const [sources, setSources] = useSources();
 *
 * `getSources()` is the same value for code that is not a component (the run reads it when "Find emails" is pressed).
 */

const KEY = "kazi.contactFinder.sources";
const listeners = new Set();

function read() {
  try { return normalizeSources(JSON.parse(localStorage.getItem(KEY))); } catch { return normalizeSources(null); }
}
let current = read();
const NOTHING_CHOSEN = normalizeSources(null);

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const getSources = () => current;

export function setSources(next) {
  current = normalizeSources(next);
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* a private window: it just isn't remembered */ }
  listeners.forEach((fn) => fn());
}

export default function useSources() {
  const sources = useSyncExternalStore(subscribe, getSources, () => NOTHING_CHOSEN);
  return [sources, setSources];
}
